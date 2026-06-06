import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from './client';

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

    // On 401 retry: refresh the session to get a new, valid access token
    if (forceRefresh) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      if (refreshData.session?.access_token) return refreshData.session.access_token;
    }

    // getSession() reads from cached storage — works immediately, no network call.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) return sessionData.session.access_token;

    // Fallback: no session available
    return null;
  } catch {
    return null;
  }
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
