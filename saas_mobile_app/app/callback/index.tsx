/**
 * OAuth Callback Handler
 *
 * This screen handles the redirect from Google OAuth after authentication.
 * Supabase's OAuth flow redirects back to `autopilot://callback?code=xxx`
 *
 * On mobile, this deep link is caught by Expo Router and this component runs.
 */

import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createClient } from '@/utils/supabase/client';

// Configure WebBrowser to complete the OAuth session
WebBrowser.maybeCompleteAuthSession();

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Processing authentication...');

  useEffect(() => {
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

        // Check for auth code
        const code = params.code as string;
        if (!code) {
          console.error('[OAuth Callback] No code in params');
          console.log('[OAuth Callback] Params:', JSON.stringify(params));
          if (isMounted) {
            setError('Authentication failed - no authorization code received');
            setStatus('Please try again...');
          }
          setTimeout(() => router.replace('/(auth)/login'), 3000);
          return;
        }

        console.log('[OAuth Callback] Exchanging code for session...');
        if (isMounted) setStatus('Completing sign in...');

        // Exchange the code for a session
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

        const user = data?.user;
        if (!user) {
          console.error('[OAuth Callback] No user after OAuth');
          if (isMounted) {
            setError('Authentication failed - no user found');
            setStatus('Please try again...');
          }
          setTimeout(() => router.replace('/(auth)/login'), 3000);
          return;
        }

        console.log('[OAuth Callback] Success! User:', user.id);

        if (isMounted) setStatus('Setting up your account...');

        // Ensure user profile exists in our users table
        const { error: profileError } = await supabase
          .from('users')
          .upsert({
            id: user.id,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            phone: user.phone || user.user_metadata?.phone || null,
            user_photo_url: user.user_metadata?.avatar_url || null,
            metadata: user.user_metadata,
          }, {
            onConflict: 'id',
          });

        if (profileError) {
          console.error('[OAuth Callback] Profile upsert error:', profileError);
          // Don't fail the login for this
        }

        // Fetch user profile and memberships
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        // Fetch organization memberships
        const { data: orgMems } = await supabase
          .from('organization_memberships')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .eq('is_active', true);

        // Fetch property memberships
        const { data: propMems } = await supabase
          .from('property_memberships')
          .select('property_id, organization_id, role')
          .eq('user_id', user.id)
          .eq('is_active', true);

        const hasOrgAccess = (orgMems || []).length > 0;
        const hasPropertyAccess = (propMems || []).length > 0;

        console.log('[OAuth Callback] Org memberships:', orgMems?.length, 'Property memberships:', propMems?.length);

        // Route based on membership
        if (hasOrgAccess) {
          const mem = (orgMems || [])[0];
          if (mem.role === 'org_super_admin' || mem.role === 'super_tenant') {
            router.replace('/super-admin');
            return;
          }

          // Get org properties
          const { data: orgProps } = await supabase
            .from('properties')
            .select('id, name')
            .eq('organization_id', mem.organization_id);

          if (orgProps && orgProps.length > 0) {
            if (orgProps.length === 1) {
              router.replace(`/property/${orgProps[0].id}`);
            } else {
              const propsParam = encodeURIComponent(JSON.stringify(
                orgProps.map((p: any) => ({ id: p.id, role: mem.role }))
              ));
              router.replace(`/(auth)/property-selection?properties=${propsParam}`);
            }
          } else {
            router.replace('/(auth)/property-selection');
          }
          return;
        }

        if (hasPropertyAccess) {
          const mem = (propMems || [])[0];
          router.replace(`/property/${mem.property_id}`);
          return;
        }

        // New user - go to onboarding
        router.replace('/(auth)/onboarding');

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
