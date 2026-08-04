import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { mmkvAsyncStorage as AsyncStorage } from '@/utils/storage';
import { User, Session } from '@supabase/supabase-js';

import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { UserMembership, PropertyInfo } from '@/types/membership';
import { clearToken } from '@/services/cassandra/cassandraAuthService';
import { queryClient } from '@/utils/queryClient';
import { prefetchCriticalOnLogin, prefetchImportantOnLogin } from '@/services/prefetchService';
import { useDashboardStore } from '@/stores/dashboardStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended user type that includes common metadata fields. */
export type AuthUser = User & {
  name?: string;
  avatar?: string;
  full_name?: string;
};

export interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  membership: UserMembership | null;
  isMembershipLoading: boolean;
  // Auth actions
  signIn: (email: string, password: string) => Promise<{ data: { user: AuthUser | null; session: Session | null }; error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ user: AuthUser | null; session: Session | null; error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  // Cache helpers
  refreshMembership: () => Promise<void>;
  triggerPrefetch: (propertyId: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enrichUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const meta = u.user_metadata as Record<string, string> | undefined;
  return {
    ...u,
    name: meta?.full_name ?? meta?.name ?? undefined,
    avatar: meta?.avatar_url ?? undefined,
    full_name: meta?.full_name ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Membership cache (AsyncStorage-backed, 5-minute TTL)
// ---------------------------------------------------------------------------

const MEMBERSHIP_CACHE_PREFIX = '@autopilot_membership:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — mobile apps should cache aggressively

async function loadCachedMembership(
  userId: string
): Promise<UserMembership | null> {
  try {
    const raw = await AsyncStorage.getItem(`${MEMBERSHIP_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw) as {
      data: UserMembership;
      timestamp: number;
    };
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch {
    // Corrupt cache entry — treat as miss
  }
  return null;
}

async function persistMembershipCache(
  userId: string,
  data: UserMembership
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${MEMBERSHIP_CACHE_PREFIX}${userId}`,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // Storage error — non-fatal
  }
}

async function clearMembershipCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${MEMBERSHIP_CACHE_PREFIX}${userId}`);
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [membership, setMembership] = useState<UserMembership | null>(null);
  const [isMembershipLoading, setIsMembershipLoading] = useState(false);

  // Prevents duplicate parallel membership fetches within the same render pass
  const fetchingRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);

  // ---------------------------------------------------------------------------
  // fetchMembership — queries org + property memberships, caches result
  // ---------------------------------------------------------------------------
  const fetchMembership = useCallback(
    async (userId: string) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      // Fast path: return cached data without a loading state flash
      const cached = await loadCachedMembership(userId);
      if (cached) {
        // Validate selected property immediately from cache to prevent 403s on stale data
        const currentPropId = useDashboardStore.getState().selectedPropertyId;
        const hasAccess = cached.properties?.some((p: any) => p.id === currentPropId);
        if (!hasAccess && cached.properties && cached.properties.length > 0) {
          useDashboardStore.getState().setSelectedPropertyId(cached.properties[0].id);
        }
        
        setMembership(cached);
        // Even with cache hit, we still fetch in background to refresh,
        // but we don't block the UI.
      }

      setIsMembershipLoading(!cached);

      try {
        // Fetch organisation membership
        const { data: orgData, error: orgError } = await serverApi.query<any>({
          table: 'organization_memberships',
          action: 'select',
          select: `
            role,
            organization:organizations (
              id,
              name
            )
          `,
          filters: [
            { op: 'eq', column: 'user_id', value: userId },
            { op: 'or', expression: 'is_active.eq.true,is_active.is.null' },
          ],
          limit: 1,
          maybeSingle: true,
        });

        if (orgError) {
          console.error('[AuthContext] org membership fetch error:', orgError);
          // If it's a real network/server error, throw to use fallback cache
          throw new Error(`Failed to fetch org membership: ${orgError.message || 'Unknown error'}`);
        }

        // Safely extract org from join result — guard against null/undefined join
        const orgFromJoin = (orgData as any)?.organization;
        const fetchedOrgId = typeof orgFromJoin?.id === 'string' ? orgFromJoin.id : null;

        // Fetch all property memberships for this user
        const { data: propData, error: propError } = await serverApi.query<any[]>({
          table: 'property_memberships',
          action: 'select',
          select: `
            role,
            property:properties (
              id,
              name,
              code,
              image_url
            )
          `,
          filters: [
            { op: 'eq', column: 'user_id', value: userId },
            { op: 'or', expression: 'is_active.eq.true,is_active.is.null' },
          ],
        });

        if (propError) {
          console.error('[AuthContext] property membership fetch error:', propError);
          // Throw to prevent caching an empty array during network failures
          throw new Error(`Failed to fetch properties: ${propError.message || 'Unknown error'}`);
        }

        let builtProperties: PropertyInfo[] = (propData ?? []).reduce<PropertyInfo[]>(
          (acc, p: any) => {
            const prop = p.property as any;
            if (!prop?.id) return acc;

            acc.push({
              id: prop.id as string,
              name: (prop.name as string) ?? '',
              code: (prop.code as string) ?? '',
              role: (p.role as string) ?? 'tenant',
              image_url: (prop.image_url as string) ?? '',
            });
            return acc;
          },
          []
        );

        const fetchedOrgRole = (orgData as any)?.role;
        const ORG_ADMIN_ROLES = ['org_super_admin', 'org_admin', 'owner'];

        if (fetchedOrgId && fetchedOrgRole && ORG_ADMIN_ROLES.includes(fetchedOrgRole)) {
          const { data: orgPropsData } = await serverApi.query<any[]>({
            table: 'properties',
            action: 'select',
            select: 'id, name, code, image_url',
            filters: [{ op: 'eq', column: 'organization_id', value: fetchedOrgId }],
          });
            
          if (orgPropsData) {
            const existingIds = new Set(builtProperties.map(p => p.id));
            const additionalProps = orgPropsData
              .filter(p => !existingIds.has(p.id))
              .map(p => ({
                id: p.id,
                name: p.name || '',
                code: p.code || '',
                role: fetchedOrgRole, // Inherit org role
                image_url: p.image_url || null,
              }));
              
            builtProperties = [...builtProperties, ...additionalProps];
          }
        }

        console.log('[AuthContext] property memberships raw:', JSON.stringify(propData));
        console.log('[AuthContext] builtProperties:', JSON.stringify(builtProperties));

        // PERMANENT FIX: Derive org_id from properties if no org membership exists.
        // This handles property-only users who lack an organization_memberships row.
        let resolvedOrgId = fetchedOrgId;
        if (!resolvedOrgId && builtProperties.length > 0) {
          // Look up the organization_id from the first property's parent org
          const firstPropId = builtProperties[0].id;
          const { data: propOrgData } = await serverApi.query<any>({
            table: 'properties',
            action: 'select',
            select: 'organization_id',
            filters: [{ op: 'eq', column: 'id', value: firstPropId }],
            single: true,
          });
          resolvedOrgId = (propOrgData as any)?.organization_id ?? null;
          console.log('[AuthContext] Derived org_id from property:', resolvedOrgId);
        }

        const membershipData: UserMembership = {
          org_id: resolvedOrgId,
          org_name: orgFromJoin?.name ?? null,
          org_role: (orgData as any)?.role ?? null,
          properties: builtProperties,
        };

        // Validate or initialize dashboardStore selectedPropertyId
        // This overrides any stale persisted propertyId from a previous session,
        // but preserves it if the user still has access.
        if (builtProperties.length > 0) {
          const currentPropId = useDashboardStore.getState().selectedPropertyId;
          const hasAccess = builtProperties.some((p) => p.id === currentPropId);
          if (!hasAccess) {
            useDashboardStore.getState().setSelectedPropertyId(builtProperties[0].id);
          }
        }

        await persistMembershipCache(userId, membershipData);
        setMembership(membershipData);
      } catch (err) {
        console.error('[AuthContext] fetchMembership error:', err);
        // FALLBACK: if network fetch fails but we have stale cached data,
        // keep using it rather than leaving membership null.
        if (cached) {
          console.log('[AuthContext] Using stale cached membership as fallback');
          setMembership(cached);
        }
      } finally {
        fetchingRef.current = false;
        setIsMembershipLoading(false);
      }
    },
    [supabase]
  );

  // ---------------------------------------------------------------------------
  // refreshMembership — clears cache and re-fetches
  // ---------------------------------------------------------------------------
  const refreshMembership = useCallback(async () => {
    if (user?.id) {
      await clearMembershipCache(user.id);
      await fetchMembership(user.id);
    }
  }, [user?.id, fetchMembership]);

  // ---------------------------------------------------------------------------
  // Foreground re-validation — critical security fix for 24h cache gap
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && user?.id) {
        console.log('[AuthContext] App foregrounded — re-validating membership');
        // Re-fetch membership in background; if user was removed,
        // this will clear membership and trigger UI logout gates.
        fetchMembership(user.id);
      }
    });
    return () => subscription.remove();
  }, [user?.id, fetchMembership]);

  // ---------------------------------------------------------------------------
  // Auth state initialisation + onAuthStateChange subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    console.log('[AuthContext] useEffect firing — fetching session...');
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession }, error }) => {
        if (error) {
          console.error('[AuthContext] getSession error:', error.message);
          if (error.message.includes('refresh_token_not_found') || error.message.includes('Invalid Refresh Token')) {
             supabase.auth.signOut().catch(() => {});
             setSession(null);
             setUser(null);
          }
          setIsLoading(false);
          return;
        }

        let activeSession = initialSession;
        // If session exists but JWT is expired or close to expiry (e.g. after 2 days), attempt auto-refresh
        if (activeSession && activeSession.expires_at && activeSession.expires_at * 1000 < Date.now() + 60000) {
          console.log('[AuthContext] Token expired/expiring on boot, refreshing session...');
          const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr && refreshData.session) {
            activeSession = refreshData.session;
          } else if (refreshErr && (refreshErr.message.includes('refresh_token_not_found') || refreshErr.message.includes('Invalid Refresh Token'))) {
            console.error('[AuthContext] Refresh failed, signing out:', refreshErr.message);
            await supabase.auth.signOut().catch(() => {});
            setSession(null);
            setUser(null);
            setIsLoading(false);
            return;
          }
        }

        console.log('[AuthContext] Initial session result:', activeSession ? `user=${activeSession.user?.email}` : 'null session');
        setSession(activeSession);
        setUser(enrichUser(activeSession?.user ?? null));
        if (activeSession?.user) {
          fetchMembership(activeSession.user.id);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('[AuthContext] getSession exception:', err);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(enrichUser(nextSession?.user ?? null));

      if (event === 'SIGNED_IN' && nextSession?.user) {
        fetchMembership(nextSession.user.id);
      } else if (event === 'SIGNED_OUT') {
        setMembership(null);
        clearToken().catch(() => {});
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchMembership]);

  // ---------------------------------------------------------------------------
  // Auth actions
  // ---------------------------------------------------------------------------

  /** Kick off background prefetch for dashboard/tickets after login */
  const triggerPrefetch = useCallback(async (propertyId: string) => {
    try {
      // Immediately warm critical caches (dashboard counts + ticket list)
      await prefetchCriticalOnLogin(propertyId);
      // Defer non-critical screens until UI settles
      setTimeout(() => prefetchImportantOnLogin(propertyId), 2000);
    } catch (err) {
      console.warn('[AuthContext] prefetch error:', err);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        return { data: { user: null, session: null }, error: error.message };
      }

      const enrichedUser = enrichUser(data.session.user);
      setSession(data.session);
      setUser(enrichedUser);

      // fetchMembership sets selectedPropertyId in dashboardStore
      await fetchMembership(data.session.user.id);

      // Trigger prefetch once we have property context
      const propId = useDashboardStore.getState().selectedPropertyId;
      if (propId) {
        triggerPrefetch(propId);
      }

      return { data: { user: enrichedUser, session: data.session }, error: null };
    },
    [supabase, fetchMembership, triggerPrefetch]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        return { user: null, session: null, error: error.message };
      }

      if (data.session) {
        const enrichedUser = enrichUser(data.session.user);
        setSession(data.session);
        setUser(enrichedUser);

        // ─── Create users profile row (mirrors web app auth callback) ───
        // This must exist before onboarding tries to .update() it.
        await serverApi.query({
          table: 'users',
          action: 'upsert',
          values: {
            id: data.session.user.id,
            email: email,
            full_name: fullName,
          },
          mutationOptions: { onConflict: 'id' },
        });

        await fetchMembership(data.session.user.id);
      }

      return {
        user: enrichUser(data.user ?? null),
        session: data.session,
        error: null,
      };
    },
    [supabase, fetchMembership]
  );

  const signOut = useCallback(async () => {
    // 1. Instantly unmount protected components to prevent refetches
    setUser(null);
    setSession(null);
    setMembership(null);

    // 2. Cancel in-flight queries
    queryClient.cancelQueries();

    // 3. Clear caches
    if (user?.id) {
      await clearMembershipCache(user.id);
    }
    useDashboardStore.getState().clearUIState();
    
    // Clear Super Admin store
    const { useSuperAdminStore } = require('@/stores/superAdminStore');
    useSuperAdminStore.getState().clearCache();

    queryClient.removeQueries(); // Completely purge cache rather than just clear()
    queryClient.clear();
    
    // Clear MMKV persisted query cache
    try {
      const { MMKV } = require('react-native-mmkv');
      const mmkvStorage = new MMKV({ id: 'react-query-cache' });
      mmkvStorage.delete('autopilot-react-query-cache');
    } catch (e) {}

    const { resetAnimatedNumber } = require('@/components/ui/AnimatedNumber');
    resetAnimatedNumber();

    await supabase.auth.signOut();
  }, [supabase, user?.id]);

  const resetPassword = useCallback(
    async (email: string) => {
      const resetUrl = Linking.createURL('/reset-password');
      const response = await serverApi.post<{ success: boolean; message: string }>('/api/users/reset-password', {
        email,
        redirectTo: resetUrl,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to send reset email');
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Context value (memoised to prevent unnecessary re-renders)
  // ---------------------------------------------------------------------------
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isLoading,
      membership,
      isMembershipLoading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshMembership,
      triggerPrefetch,
    }),
    [
      user,
      session,
      isLoading,
      membership,
      isMembershipLoading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshMembership,
      triggerPrefetch,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
