// ============================================================================
// serverApi — Mobile Fastify Server Proxy
// ============================================================================
// Routes ALL calls through the mobile Fastify server instead of calling
// Supabase directly. The interface is identical so all callers are unaffected.
// ============================================================================

import { getSupabaseToken } from '@/utils/supabase/mobile-auth';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MOBILE_SERVER_URL = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL ?? 'http://localhost:3001';

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
  const doFetch = async (authToken: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const { createClient } = require('@/utils/supabase/client');
    const supabase = createClient();
    
    // If no token was provided, try to fetch it directly from the local client session
    if (!authToken) {
      try {
        const { data } = await supabase.auth.getSession();
        authToken = data?.session?.access_token || null;
      } catch (e) {
        console.warn('[serverApi] Failed to get session for auth token:', e);
      }
    }

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      
      // Defensive fix: If the MOBILE_SERVER_URL inadvertently points to the Next.js web app (e.g. www.back2basiics.com)
      // the web app's middleware.ts will reject the request with 401 Unauthorized because it expects a Cookie,
      // not just a Bearer token. We synthesize the cookie here just like apiFetch does.
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const projectIdMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (projectIdMatch) {
        const projectId = projectIdMatch[1];
        const cookieName = `sb-${projectId}-auth-token`;
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            const cookieValue = JSON.stringify([
              data.session.access_token,
              data.session.refresh_token,
              null,
              null,
              null
            ]);
            headers['Cookie'] = `${cookieName}=${encodeURIComponent(cookieValue)}`;
          }
        } catch (e) {
          console.warn('[serverApi] Failed to synthesize cookie:', e);
        }
      }
    }

    return fetch(`${MOBILE_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  };

  let token = await getSupabaseToken();
  let response = await doFetch(token);

  // Retry once on 401 — force-refresh the session to get a fresh access token
  if (response.status === 401) {
    token = await getSupabaseToken(true);
    if (token) {
      response = await doFetch(token);
    }
  }

  // Retry once on 403 — property-switching race: prefetch fires before the
  // session token is updated; a force-refresh gets the correct fresh token
  // which lets the server re-evaluate the user's property_membership.
  if (response.status === 403) {
    token = await getSupabaseToken(true);
    if (token) {
      response = await doFetch(token);
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
  const doFetch = async (authToken: string | null) => {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const projectIdMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (projectIdMatch) {
        const projectId = projectIdMatch[1];
        const cookieName = `sb-${projectId}-auth-token`;
        const { createClient } = require('@/utils/supabase/client');
        const supabase = createClient();
        // Fire and forget since doFetch isn't normally strictly awaiting the cookie, 
        // but wait! We are inside an async function. Let's await it.
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            const cookieValue = JSON.stringify([
              data.session.access_token,
              data.session.refresh_token,
              null,
              null,
              null
            ]);
            headers['Cookie'] = `${cookieName}=${encodeURIComponent(cookieValue)}`;
          }
        } catch (e) {}
      }
    }

    const url = new URL(`${MOBILE_SERVER_URL}${endpoint}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    return fetch(url.toString(), {
      method: 'GET',
      headers,
    });
  };

  let token = await getSupabaseToken();
  let response = await doFetch(token);

  // Retry once on 401 — force-refresh the session to get a fresh access token
  if (response.status === 401) {
    token = await getSupabaseToken(true);
    if (token) {
      response = await doFetch(token);
    }
  }

  // Retry once on 403 — property-switching race (same as serverFetch above)
  if (response.status === 403) {
    token = await getSupabaseToken(true);
    if (token) {
      response = await doFetch(token);
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
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
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
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
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
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
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
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
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
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  async request(endpoint: string, method: string, body?: unknown): Promise<unknown> {
    const doFetch = async (tokenParam: string | null) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      const { createClient } = require('@/utils/supabase/client');
      const supabase = createClient();
      let authToken = tokenParam;
      
      // If no token was provided, try to fetch it directly from the local client session
      if (!authToken) {
        try {
          const { data } = await supabase.auth.getSession();
          authToken = data?.session?.access_token || null;
        } catch (e) {
          console.warn('[serverApi] Failed to get session for auth token:', e);
        }
      }

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
        const projectIdMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
        if (projectIdMatch) {
          const projectId = projectIdMatch[1];
          const cookieName = `sb-${projectId}-auth-token`;
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
              const cookieValue = JSON.stringify([
                data.session.access_token,
                data.session.refresh_token,
                null,
                null,
                null
              ]);
              headers['Cookie'] = `${cookieName}=${encodeURIComponent(cookieValue)}`;
            }
          } catch (e) {
            console.warn('[serverApi] Failed to synthesize cookie:', e);
          }
        }
      }
      return fetch(`${MOBILE_SERVER_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    let token = await getSupabaseToken();
    let response = await doFetch(token);

    if (response.status === 401) {
      token = await getSupabaseToken(true);
      if (token) {
        response = await doFetch(token);
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
      const formData = new FormData();
      formData.append('bucket', bucket);
      formData.append('path', path);

      if (file instanceof File || file instanceof Blob) {
        formData.append('file', file, (file as File).name || 'upload');
      } else if (file instanceof ArrayBuffer) {
        // Only possible in web, wrap in Blob
        const blob = new Blob([file], { type: contentType || 'application/octet-stream' });
        formData.append('file', blob, 'upload');
      } else if (file && 'uri' in file) {
        // React Native uri object
        formData.append('file', {
          uri: file.uri,
          name: file.name || path.split('/').pop() || 'upload',
          type: file.type || contentType || 'application/octet-stream',
        } as any);
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${MOBILE_SERVER_URL}/api/upload`, {
        method: 'POST',
        body: formData,
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
