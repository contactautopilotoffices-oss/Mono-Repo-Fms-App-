// @ts-nocheck
/**
 * OAuth Callback Handler
 *
 * This screen handles the redirect from Google OAuth after authentication.
 * Supabase's OAuth flow redirects back to `autopilot://callback?code=xxx`
 *
 * On mobile, this deep link is caught by Expo Router and this component runs.
 */

import { useEffect, useState, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';

// Configure WebBrowser to complete the OAuth session
WebBrowser.maybeCompleteAuthSession();

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Processing authentication...');
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) return;
    hasAttempted.current = true;
    let isMounted = true;

    async function handleCallback() {
      try {
        const supabase = createClient();

        // Check for error in params
        const errorParam = params.error as string;
        const errorDescription = params.error_description as string;

        if (errorParam) {
          console.error('[OAuth Callback] Error:', errorParam, errorDescription);
          if (isMounted) {
            setError(errorDescription || errorParam);
            setStatus('Authentication failed. Redirecting...');
          }
          setTimeout(() => router.replace('/(auth)/login'), 3000);
          return;
        }

        // 1. Try to get code/token from Expo Router params
        let code = params.code as string;
        let accessToken = params.access_token as string;
        let refreshToken = params.refresh_token as string;

        // 2. If missing, manually parse the raw URL (Expo Router sometimes misses deep link params)
        if (!code && !accessToken) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            console.log('[OAuth Callback] Manually parsing URL:', initialUrl);
            const parsed = Linking.parse(initialUrl);
            
            // Check query params (PKCE flow)
            if (parsed.queryParams?.code) code = parsed.queryParams.code as string;
            
            // Check hash fragment (Implicit flow fallback)
            // Linking.parse might put hash params into queryParams depending on format
            if (parsed.queryParams?.access_token) accessToken = parsed.queryParams.access_token as string;
            if (parsed.queryParams?.refresh_token) refreshToken = parsed.queryParams.refresh_token as string;
            
            // Sometimes the entire URL fragment is in parsed.fragment
            if (parsed.queryParams && typeof parsed.queryParams === 'object') {
              // Extract from raw URL if needed
              const urlObj = new URL(initialUrl);
              const hash = urlObj.hash.substring(1);
              const hashParams = new URLSearchParams(hash);
              if (hashParams.get('access_token')) accessToken = hashParams.get('access_token') as string;
              if (hashParams.get('refresh_token')) refreshToken = hashParams.get('refresh_token') as string;
            }
          }
        }

        // 3. Check for auth code or access token
        if (!code && !accessToken) {
          console.error('[OAuth Callback] No code or access_token found');
          console.log('[OAuth Callback] Router Params:', JSON.stringify(params));
          if (isMounted) {
            setError('Authentication failed - no authorization code received');
            setStatus('Please try again...');
          }
          setTimeout(() => router.replace('/(auth)/login'), 3000);
          return;
        }

        console.log('[OAuth Callback] Exchanging code or setting session...');
        if (isMounted) setStatus('Completing sign in...');

        let sessionUser = null;

        if (code) {
          // Exchange the code for a session (PKCE Flow)
          const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          if (sessionError) {
            console.error('[OAuth Callback] Session error:', sessionError);
            if (isMounted) {
              setError(sessionError.message);
              setStatus('Session error. Redirecting...');
            }
            setTimeout(() => router.replace('/(auth)/login'), 3000);
            return;
          }
          sessionUser = data?.user;
        } else if (accessToken && refreshToken) {
          // Manually set session (Implicit Flow)
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) {
            console.error('[OAuth Callback] Session error (implicit):', sessionError);
            if (isMounted) {
              setError(sessionError.message);
              setStatus('Session error. Redirecting...');
            }
            setTimeout(() => router.replace('/(auth)/login'), 3000);
            return;
          }
          sessionUser = data?.user;
        }

        if (!sessionUser) {
          console.error('[OAuth Callback] No user after OAuth');
          if (isMounted) {
            setError('Authentication failed - no user found');
            setStatus('Please try again...');
          }
          setTimeout(() => router.replace('/(auth)/login'), 3000);
          return;
        }

        console.log('[OAuth Callback] Success! User:', sessionUser.id);

        if (isMounted) setStatus('Setting up your account...');

        // Ensure user profile exists in our users table
        const { error: profileError } = await serverApi.query({
          table: 'users',
          action: 'upsert',
          values: {
            id: sessionUser.id,
            full_name: sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'User',
            email: sessionUser.email || '',
            phone: sessionUser.phone || sessionUser.user_metadata?.phone || null,
            user_photo_url: sessionUser.user_metadata?.avatar_url || null,
            metadata: sessionUser.user_metadata,
          },
          mutationOptions: { onConflict: 'id' },
        });

        if (profileError) {
          console.error('[OAuth Callback] Profile upsert error:', profileError);
          // Don't fail the login for this
        }

        // Fetch user profile and memberships
        const { data: profile } = await serverApi.query<any>({
          table: 'users',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'id', value: sessionUser.id }],
          single: true,
        });

        // Fetch organization memberships
        const { data: orgMems } = await serverApi.query<any[]>({
          table: 'organization_memberships',
          action: 'select',
          select: 'organization_id, role',
          filters: [
            { op: 'eq', column: 'user_id', value: sessionUser.id },
            { op: 'eq', column: 'is_active', value: true },
          ],
        });

        // Fetch property memberships
        const { data: propMems } = await serverApi.query<any[]>({
          table: 'property_memberships',
          action: 'select',
          select: 'property_id, organization_id, role',
          filters: [
            { op: 'eq', column: 'user_id', value: sessionUser.id },
            { op: 'eq', column: 'is_active', value: true },
          ],
        });

        const hasOrgAccess = (orgMems || []).length > 0;
        const hasPropertyAccess = (propMems || []).length > 0;
        const onboardingCompleted = sessionUser.user_metadata?.onboarding_completed === true;

        console.log('[OAuth Callback] Org memberships:', orgMems?.length, 'Property memberships:', propMems?.length);

        // Route based on membership
        if (hasOrgAccess) {
          const mem = (orgMems || [])[0];

          if (mem.role === 'org_super_admin') {
            router.replace('/super-admin');
            return;
          }

          // Get org properties
          const { data: orgProps } = await serverApi.query<any[]>({
            table: 'properties',
            action: 'select',
            select: 'id, name',
            filters: [{ op: 'eq', column: 'organization_id', value: mem.organization_id }],
          });

          if (orgProps && orgProps.length === 1) {
            router.replace(`/property/${orgProps[0].id}`);
            return;
          }


          if (orgProps && orgProps.length > 0) {
            const propsParam = encodeURIComponent(JSON.stringify(
              orgProps.map((p: any) => ({ id: p.id, role: mem.role }))
            ));
            router.replace(`/(auth)/property-selection?properties=${propsParam}`);
          } else {
            router.replace('/(auth)/property-selection');
          }
          return;
        }

        if (hasPropertyAccess) {
          if (propMems && propMems.length === 1) {
            const mem = propMems[0];
            router.replace(`/property/${mem.property_id}`);
            return;
          } 
          

          if (propMems && propMems.length > 1) {
            const isPropertyAdminOnAny = propMems.some((p: any) => 
              ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager'].includes(p.role?.toLowerCase() || '')
            );
            if (isPropertyAdminOnAny) {
              router.replace('/super-admin');
              return;
            }

            const propsParam = encodeURIComponent(JSON.stringify(
              propMems.map((p: any) => ({ id: p.property_id, role: p.role }))
            ));
            router.replace(`/(auth)/property-selection?properties=${propsParam}`);
          }
          return;
        }

        // Fallback for users with no access
        if (!onboardingCompleted) {
          console.log('[OAuth Callback] User has no memberships and has not completed onboarding. Redirecting to onboarding...');
          router.replace('/(auth)/onboarding');
        } else {
          // If they have completed onboarding but have no access, show them the "no properties assigned" screen
          router.replace('/');
        }

      } catch (err: any) {
        console.error('[OAuth Callback] Error:', err);
        if (isMounted) {
          setError(err.message || 'An unexpected error occurred');
          setStatus('Redirecting...');
        }
        setTimeout(() => router.replace('/(auth)/login'), 3000);
      }
    }

    handleCallback();

    return () => {
      isMounted = false;
    };
  }, [params, router]);

  // Prevent back button during callback
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backHandler.remove();
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Authentication Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Text style={styles.redirectText}>Redirecting to login...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#708F96" />
      <Text style={styles.processingText}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1521',
    padding: 24,
  },
  processingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#708F96',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF6B6B',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#A0AEC0',
    textAlign: 'center',
    marginBottom: 16,
  },
  redirectText: {
    fontSize: 14,
    color: '#708F96',
  },
});
