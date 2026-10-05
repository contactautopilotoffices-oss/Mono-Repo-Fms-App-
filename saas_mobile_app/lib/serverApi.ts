// ============================================================================
// serverApi — Mobile Fastify Server Proxy
// ============================================================================
// Routes ALL calls through the mobile Fastify server instead of calling
// Supabase directly. The interface is identical so all callers are unaffected.
// ============================================================================

import {
  getCurrentUserId,
  getSupabaseToken,
  getAuthTokens,
  clearAuthTokenCache,
  type AuthTokens,
} from '@/utils/supabase/mobile-auth';
import { fetchWithRetry, type FetchRetryOptions } from '@/utils/api/fetchWithRetry';
import { showNetworkErrorToast } from '@/utils/networkToast';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MOBILE_SERVER_URL = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL ?? 'http://192.168.31.236:3000';

if (__DEV__) {
  console.log('[serverApi] Initialized with MOBILE_SERVER_URL:', MOBILE_SERVER_URL);
}

const SUPABASE_PROJECT_ID = (() => {
  const match = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').match(
    /https:\/\/([^.]+)\.supabase\.co/
  );
  return match ? match[1] : null;
})();

/**
 * Build request headers from an already-resolved token snapshot.
 *
 * Centralised so the three call paths (query, GET, request) cannot drift, and so
 * none of them re-reads the session: that was the per-request cost this replaces.
 */
function buildAuthHeaders(tokens: AuthTokens | null, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (!tokens?.accessToken) return headers;

  headers['Authorization'] = `Bearer ${tokens.accessToken}`;

  // Auth cookie, kept for the case where MOBILE_SERVER_URL points at the Next.js
  // web app, whose middleware expects a Cookie rather than a bearer token.
  //
  // The expensive part was never building the header: it was that each call site
  // made a SECOND getSession() read just to obtain the refresh token. The token
  // snapshot now carries both from one read, so this costs a string concat.
  if (SUPABASE_PROJECT_ID && tokens.refreshToken) {
    const cookieValue = JSON.stringify([
      tokens.accessToken,
      tokens.refreshToken,
      null,
      null,
      null,
    ]);
    headers['Cookie'] = `sb-${SUPABASE_PROJECT_ID}-auth-token=${encodeURIComponent(cookieValue)}`;
  }

  return headers;
}

/** Writes must not be auto-replayed; a timed-out mutation may already have landed. */
function retryPolicyFor(body: unknown): FetchRetryOptions {
  const action = (body as { action?: string } | null)?.action;
  const isMutation = !!action && action !== 'select';
  return isMutation ? { maxRetries: 1 } : {};
}

// ---------------------------------------------------------------------------
// Response type (kept identical for callers)
// ---------------------------------------------------------------------------

export interface ServerApiResponse<T = unknown> {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  count?: number | null;
}

export class ServerApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

// ---------------------------------------------------------------------------
// Filter application helper (kept for type compatibility)
// ---------------------------------------------------------------------------

type FilterOp = 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'lt' | 'gt' | 'ilike' | 'not' | 'is' | 'or';

interface QueryFilter {
  op: FilterOp;
  column?: string;
  value?: unknown;
  values?: unknown[];
  operator?: string;
  expression?: string;
  foreignTable?: string;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function serverFetch(endpoint: string, body: unknown): Promise<unknown> {
  const retryPolicy = retryPolicyFor(body);
  // Serialise once, not once per attempt.
  const payload = JSON.stringify(body);

  const doFetch = async (tokens: AuthTokens | null) =>
    fetchWithRetry(
      `${MOBILE_SERVER_URL}${endpoint}`,
      {
        method: 'POST',
        headers: buildAuthHeaders(tokens, 'application/json'),
        body: payload,
      },
      retryPolicy
    );

  let tokens = await getAuthTokens();
  let response = await doFetch(tokens);

  // Retry once on 401 (expired token) or 403 (property-switch race: the request
  // went out before the session carried the new property membership). Both are
  // fixed by forcing a fresh token, and one retry covers both cases.
  if (response.status === 401 || response.status === 403) {
    clearAuthTokenCache();
    tokens = await getAuthTokens(true);
    if (tokens) {
      response = await doFetch(tokens);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ServerApiError(
      `Server error ${response.status}: ${text || response.statusText}`,
      response.status
    );
  }

  return response.json();
}

async function serverGet(
  endpoint: string,
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<unknown> {
  // Build the URL once, outside the attempt closure.
  const url = new URL(`${MOBILE_SERVER_URL}${endpoint}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  const href = url.toString();

  const doFetch = async (tokens: AuthTokens | null) =>
    fetchWithRetry(href, {
      method: 'GET',
      headers: buildAuthHeaders(tokens),
    });

  let tokens = await getAuthTokens();
  let response = await doFetch(tokens);

  // One forced-refresh retry covers both an expired token (401) and the
  // property-switch race (403).
  if (response.status === 401 || response.status === 403) {
    clearAuthTokenCache();
    tokens = await getAuthTokens(true);
    if (tokens) {
      response = await doFetch(tokens);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ServerApiError(
      `Server error ${response.status}: ${text || response.statusText}`,
      response.status
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

async function fileToBase64(file: File | Blob | ArrayBuffer): Promise<string> {
  if (file instanceof ArrayBuffer) {
    const bytes = new Uint8Array(file);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is data:*/*;base64,xxxx — strip the prefix
      const base64 = result.split(',')[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handleApiError(err: unknown): ServerApiResponse<any> {
  const errMsg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  const isNetwork = errMsg.includes('network') || errMsg.includes('failed to fetch') || errMsg.includes('timeout') || errMsg.includes('aborted');
  if (isNetwork) {
    showNetworkErrorToast('Network is slow or disconnected.');
    return { data: null, error: { message: 'Network connection is slow or unavailable. Please check your internet.', code: 'NETWORK_ERROR' } };
  }
  if (err instanceof ServerApiError) {
    return { data: null, error: { message: err.message, code: String(err.statusCode) } };
  }
  return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
}

// ---------------------------------------------------------------------------
// Public API — same interface as before
// ---------------------------------------------------------------------------

export const serverApi = {
  // ── Generic Supabase query ──────────────────────────────────────────────
  async query<T = unknown>(body: {
    table: string;
    action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
    select?: string;
    selectOptions?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean };
    filters?: QueryFilter[];
    orders?: Array<{ column: string; ascending?: boolean }>;
    limit?: number;
    offset?: number;
    single?: boolean;
    maybeSingle?: boolean;
    values?: unknown;
    mutationOptions?: { onConflict?: string; ignoreDuplicates?: boolean; defaultToNull?: boolean };
  }): Promise<ServerApiResponse<T>> {
    try {
      const result = (await serverFetch('/api/query', body)) as ServerApiResponse<T>;
      return result;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // ── RPC (8 callers) ───────────────────────────────────────────────────────
  async get<T = unknown>(
    endpoint: string,
    query?: Record<string, string | number | boolean | null | undefined>
  ): Promise<ServerApiResponse<T>> {
    try {
      const result = (await serverGet(endpoint, query)) as { success?: boolean; data?: T } | T;
      if (result && typeof result === 'object' && 'data' in result) {
        return { data: (result as { data: T }).data ?? null, error: null };
      }
      return { data: result as T, error: null };
    } catch (err) {
      return handleApiError(err);
    }
  },

  async post<T = unknown>(endpoint: string, body?: unknown): Promise<ServerApiResponse<T>> {
    try {
      const result = (await this.request(endpoint, 'POST', body)) as { success?: boolean; data?: T } | T;
      if (result && typeof result === 'object' && 'data' in result) {
        return { data: (result as { data: T }).data ?? null, error: null };
      }
      return { data: result as T, error: null };
    } catch (err) {
      return handleApiError(err);
    }
  },

  async patch<T = unknown>(endpoint: string, body?: unknown): Promise<ServerApiResponse<T>> {
    try {
      const result = (await this.request(endpoint, 'PATCH', body)) as { success?: boolean; data?: T } | T;
      if (result && typeof result === 'object' && 'data' in result) {
        return { data: (result as { data: T }).data ?? null, error: null };
      }
      return { data: result as T, error: null };
    } catch (err) {
      return handleApiError(err);
    }
  },

  async delete<T = unknown>(endpoint: string, body?: unknown): Promise<ServerApiResponse<T>> {
    try {
      const result = (await this.request(endpoint, 'DELETE', body)) as { success?: boolean; data?: T } | T;
      if (result && typeof result === 'object' && 'data' in result) {
        return { data: (result as { data: T }).data ?? null, error: null };
      }
      return { data: result as T, error: null };
    } catch (err) {
      return handleApiError(err);
    }
  },

  async request(endpoint: string, method: string, body?: unknown): Promise<unknown> {
    const payload = body ? JSON.stringify(body) : undefined;
    // Anything that is not a GET changes state, so it must not be auto-replayed.
    const retryPolicy: FetchRetryOptions =
      method.toUpperCase() === 'GET' ? {} : { maxRetries: 1 };

    const doFetch = async (tokens: AuthTokens | null) =>
      fetchWithRetry(
        `${MOBILE_SERVER_URL}${endpoint}`,
        {
          method,
          headers: buildAuthHeaders(tokens, 'application/json'),
          body: payload,
        },
        retryPolicy
      );

    let tokens = await getAuthTokens();
    let response = await doFetch(tokens);

    if (response.status === 401 || response.status === 403) {
      clearAuthTokenCache();
      tokens = await getAuthTokens(true);
      if (tokens) {
        response = await doFetch(tokens);
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ServerApiError(
        `Server error ${response.status}: ${text || response.statusText}`,
        response.status
      );
    }
    return response.json();
  },

  async rpc<T = unknown>(functionName: string, params?: Record<string, unknown>): Promise<ServerApiResponse<T>> {
    try {
      const result = (await serverFetch('/api/rpc', { fn: functionName, params })) as ServerApiResponse<T>;
      return result;
    } catch (err) {
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  // ── Storage (1 caller each) ───────────────────────────────────────────────
  async uploadFile(
    bucket: string,
    path: string,
    file: File | Blob | ArrayBuffer | { uri: string; name?: string; type?: string },
    contentType?: string,
  ): Promise<ServerApiResponse<{ path: string }>> {
    try {
      const token = await getSupabaseToken();
      let fileBase64 = '';

      if (file instanceof File || file instanceof Blob) {
        // Web: convert Blob to base64
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        fileBase64 = btoa(String.fromCharCode(...bytes));
      } else if (file instanceof ArrayBuffer) {
        // Web ArrayBuffer: convert to base64
        const bytes = new Uint8Array(file);
        fileBase64 = btoa(String.fromCharCode(...bytes));
      } else if (file && 'uri' in file) {
        // React Native: read file and convert to base64
        const response = await fetch(file.uri);
        const blob = await response.blob();
        const reader = new FileReader();
        fileBase64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix if present
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetchWithRetry(`${MOBILE_SERVER_URL}/api/storage/upload`, {
        method: 'POST',
        body: JSON.stringify({
          bucket,
          path,
          fileBase64,
          contentType: contentType || 'application/octet-stream',
        }),
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || response.statusText);
      }

      const json = await response.json();
      if (json.error) throw new Error(json.error);

      return { data: { path: json.data?.path || json.path }, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  async getPublicUrl(bucket: string, path: string): Promise<ServerApiResponse<{ publicUrl: string }>> {
    try {
      const { createClient } = require('@/utils/supabase/client');
      const supabase = createClient();
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return { data: { publicUrl: data.publicUrl }, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  async removeFile(bucket: string, path: string): Promise<ServerApiResponse<unknown>> {
    try {
      const token = await getSupabaseToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${MOBILE_SERVER_URL}/api/storage/remove`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ bucket, path }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ServerApiError(
          `Server error ${response.status}: ${text || response.statusText}`,
          response.status
        );
      }

      return (await response.json()) as ServerApiResponse<unknown>;
    } catch (err) {
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },
};

export default serverApi;
