// ============================================
// Auth Service — Direct Supabase Auth
// ============================================
// All auth operations go through Supabase Auth directly.
// For OAuth on mobile, we use expo-linking to handle the redirect.

// ============================================
// MOBILE OAUTH SETUP REQUIRED:
// ============================================
// 1. Add to app.json schemes:
//    "scheme": "autopilot"
//
// 2. For Google OAuth in Supabase:
//    - Enable Google provider in Supabase Dashboard
//    - Add iOS bundle ID and Android package name
//    - SHA-1 fingerprint from Google Cloud Console
//
// 3. Deep link will be: autopilot://callback?code=xxx

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { ApiResponse, User } from '@/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  fullName: string;
  organizationId?: string;
  propertyId?: string;
}

export interface ResetPasswordData {
  email: string;
}

export interface UpdatePasswordData {
  password: string;
}

// Create the OAuth redirect URL for mobile
function getRedirectUrl(): string {
  // For mobile, we use a custom scheme URL that will be caught by expo-router
  return 'autopilot://callback';
}

export const authService = {
  // Login with email/password
  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: User; session: any }>> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });
      if (error) throw error;
      // Fetch the users row to get the app-level User shape
      const { data: userRow } = await serverApi.query<any>({
        table: 'users',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: data.user!.id }],
        maybeSingle: true,
      });
      return { data: { user: userRow as unknown as User, session: data.session }, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 401 };
    }
  },

  // Sign up new user
  async signup(data: SignupData): Promise<ApiResponse<{ user: User }>> {
    try {
      const supabase = createClient();
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { full_name: data.fullName } },
      });
      if (error) throw error;
      const { data: userRow } = await serverApi.query<any>({
        table: 'users',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: authData.user!.id }],
        maybeSingle: true,
      });
      return { data: { user: userRow as unknown as User }, error: null, status: 201 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Logout
  async logout(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },

  // Forgot password
  async forgotPassword(data: ResetPasswordData): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: 'autopilot://reset-password',
      });
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Update password
  async updatePassword(data: UpdatePasswordData): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Get current session
  async getSession(): Promise<ApiResponse<{ user: User | null; session: any }>> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) return { data: { user: null, session: null }, error: null, status: 200 };
      const { data: userRow } = await serverApi.query<any>({
        table: 'users',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: data.session.user.id }],
        maybeSingle: true,
      });
      return { data: { user: userRow as unknown as User, session: data.session }, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 401 };
    }
  },

  // Google OAuth - Mobile version using expo-web-browser
  async signInWithGoogle(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();

      // For mobile, we need to use the async version with proper redirect handling
      const redirectUrl = getRedirectUrl();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, // Important for mobile
        },
      });

      if (error) throw error;

      if (data?.url) {
        // Open the browser for OAuth
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl,
          { showInRecents: true }
        );

        // Handle the result
        if (result.type === 'success' && result.url) {
          // Parse the URL to extract the code
          const url = new URL(result.url);
          const code = url.searchParams.get('code');

          if (code) {
            // Exchange the code for a session
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          }
        } else if (result.type === 'cancel') {
          throw new Error('Authentication was cancelled');
        }
      }

      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Zoho OAuth (mapped to Google provider in Supabase)
  async signInWithZoho(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const redirectUrl = getRedirectUrl();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl,
          { showInRecents: true }
        );

        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');

          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          }
        }
      }

      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Apple OAuth - Mobile version
  async signInWithApple(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const redirectUrl = getRedirectUrl();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl,
          { showInRecents: true }
        );

        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');

          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          }
        }
      }

      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Refresh session
  async refreshSession(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 401 };
    }
  },

  // Check if there's an OAuth callback URL to process
  async handleOAuthCallback(url: string): Promise<ApiResponse<{ user: any }>> {
    try {
      const supabase = createClient();

      // Parse the URL
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      if (error) {
        throw new Error(urlObj.searchParams.get('error_description') || error);
      }

      if (code) {
        // Exchange the code for a session
        const { data: { user }, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        if (sessionError) throw sessionError;

        // Ensure user profile exists
        if (user) {
          await serverApi.query({
            table: 'users',
            action: 'upsert',
            values: {
              id: user.id,
              full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
              email: user.email!,
              phone: user.phone || user.user_metadata?.phone || null,
              metadata: user.user_metadata,
            },
            mutationOptions: { onConflict: 'id' },
          });
        }

        return { data: { user }, error: null, status: 200 };
      }

      throw new Error('No authorization code in callback URL');
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },
};

export default authService;
