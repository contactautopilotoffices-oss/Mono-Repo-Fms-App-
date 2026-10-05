import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from './client';
import { mmkvAsyncStorage } from '../storage';

/**
 * Creates a Supabase client authenticated with a Bearer token from the Authorization header.
 * Use this when mobile apps call API routes with `Authorization: Bearer <token>`.
 */
export function createClientFromToken(accessToken: string) {
  return createSupabaseClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/**
 * Extract bearer token from an Authorization header value.
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Get the current Supabase access token for Bearer auth.
 * Returns null if not authenticated.
 *
 * Strategy: use getSession() (synchronous, cached from storage) first to avoid
 * a network round-trip on mobile. On Expo Go, AsyncStorage may not be fully
 * synchronised when the app starts, so we fall back to getUser() which validates
 * the token with the Supabase Auth server — slower but authoritative.
 *
 * @param forceRefresh - If true, forces a session refresh with the Auth server
 *   to obtain a fresh access token (used after a 401 response).
 */
export async function getSupabaseToken(forceRefresh = false): Promise<string | null> {
  try {
    const supabase = createClient();

    // On 401 retry or explicit force: refresh the session to get a new, valid access token
    if (forceRefresh) {
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData.session?.access_token) return refreshData.session.access_token;
      } catch (e) {
        console.warn('[mobile-auth] force refresh exception:', e);
      }
    }

    // getSession() reads from cached storage — works immediately, no network call.
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (session?.access_token) {
      // Proactively check if token is expired or expiring soon (within 2 minutes)
      const nowSec = Math.floor(Date.now() / 1000);
      const isExpiredOrExpiring = session.expires_at ? session.expires_at <= nowSec + 120 : false;

      if (isExpiredOrExpiring) {
        console.log('[mobile-auth] Token expiring/expired, refreshing proactively...');
        try {
          const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr && refreshData.session?.access_token) {
            return refreshData.session.access_token;
          }
        } catch (e) {
          console.warn('[mobile-auth] Proactive token refresh failed, returning current token:', e);
        }
      }
      return session.access_token;
    }

    // Fallback: forcefully read from MMKV storage directly
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const projectIdMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (projectIdMatch) {
      const cookieName = `sb-${projectIdMatch[1]}-auth-token`;
      const stored = await mmkvAsyncStorage.getItem(cookieName);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.access_token) return parsed.access_token; // v2 storage format
          if (Array.isArray(parsed) && parsed[0]) return parsed[0]; // old v1 storage format
        } catch (e) {
          console.warn('[mobile-auth] Failed to parse raw storage token');
        }
      }
    }

    // Fallback: no session available
    return null;
  } catch (err) {
    console.warn('[mobile-auth] getSupabaseToken error:', err);
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Auth token snapshot (single read per request)
// ───────────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
}

/**
 * Short-lived memo of the last successful token read.
 *
 * Each outbound API call used to call getSession() two or three times (once for
 * the bearer token, again to synthesise the auth cookie). getSession() takes an
 * internal lock and can touch storage, so on a screen that fires several
 * requests it was real serialised work on the JS thread for a value that cannot
 * meaningfully change between calls in the same tick.
 *
 * The TTL is deliberately far shorter than the token lifetime, and
 * getSupabaseToken() still does its own expiry check, so a stale entry can never
 * outlive the token it holds.
 */
const TOKEN_MEMO_TTL_MS = 3000;
let tokenMemo: { tokens: AuthTokens; at: number } | null = null;

/** Drop the memo. Call on sign-out, sign-in, or any forced refresh. */
export function clearAuthTokenCache(): void {
  tokenMemo = null;
}

/**
 * Get access + refresh token in ONE session read, memoised for a few seconds.
 *
 * Prefer this over calling getSupabaseToken() and getSession() separately.
 */
export async function getAuthTokens(forceRefresh = false): Promise<AuthTokens | null> {
  if (forceRefresh) clearAuthTokenCache();

  const memo = tokenMemo;
  if (memo && Date.now() - memo.at < TOKEN_MEMO_TTL_MS) {
    return memo.tokens;
  }

  const accessToken = await getSupabaseToken(forceRefresh);
  if (!accessToken) {
    clearAuthTokenCache();
    return null;
  }

  let refreshToken: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    // Only pair the refresh token with the access token we actually return.
    if (data?.session?.access_token === accessToken) {
      refreshToken = data.session.refresh_token ?? null;
    }
  } catch {
    // Non-fatal: the bearer token alone is enough for the Fastify server.
  }

  const tokens: AuthTokens = { accessToken, refreshToken };
  tokenMemo = { tokens, at: Date.now() };
  return tokens;
}

/**
 * Get the current user's ID, with the same session-first strategy as getSupabaseToken.
 * Safe to call from non-React service files (unlike useAuth() which requires a hook).
 * Returns null if no authenticated session is found.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user?.id) return sessionData.session.user.id;

    const { data: userData } = await supabase.auth.getUser();
    return userData.user?.id ?? null;
  } catch {
    return null;
  }
}
