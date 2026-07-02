import { useEffect, useRef, useCallback, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from './useAuth';
import { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import { mmkvAsyncStorage } from '@/utils/storage';
import { useDashboardStore } from '@/stores/dashboardStore';

// Try to load @react-native-firebase/messaging (optional - for native builds)
let firebaseApp: any = null;
let firebaseMessaging: any = null;
let firebaseInitialized = false;

async function initializeFirebaseApp(): Promise<boolean> {
  if (firebaseInitialized) return true;

  try {
    const rnfbApp = require('@react-native-firebase/app');
    // @react-native-firebase/app auto-initializes from google-services.json
    // at NATIVE BUILD TIME via the com.google.gms.google-services gradle plugin.
    // It is NOT possible to initialize it from JS at runtime.
    // If getApp() throws, the APK was built WITHOUT the google-services plugin.
    // Use modular getApp if available, otherwise fallback to default namespace
    const app = typeof rnfbApp.getApp === 'function' ? rnfbApp.getApp() : (rnfbApp.default ? rnfbApp.default.app() : rnfbApp.app());
    console.log('[Push] ✅ Firebase native app ready:', app?.name || 'default');
    firebaseApp = rnfbApp;
    firebaseInitialized = true;
    return true;
  } catch (err: any) {
    console.warn(
      '[Push] ❌ Firebase native app not initialized. ' +
      'Your APK was built before the google-services plugin was configured. ' +
      'Rebuild with: npx expo prebuild --clean && cd android && ./gradlew assembleDebug'
    );
  }

  firebaseInitialized = true; // Don't retry
  return false;
}

function tryLoadFirebaseNative(): boolean {
  if (firebaseMessaging) return true;

  try {
    firebaseMessaging = require('@react-native-firebase/messaging');
    console.log('[Push] ✅ @react-native-firebase/messaging loaded');
    return true;
  } catch (err) {
    console.log('[Push] ❌ @react-native-firebase/messaging not available');
    return false;
  }
}

// ------------------------------------------------------------------
// Foreground notification banner state (shared across app)
// ------------------------------------------------------------------
export interface ForegroundNotification {
  id: string;
  title: string;
  body: string;
  data: Record<string, any>;
  timestamp: number;
}

let bannerListeners: ((notif: ForegroundNotification | null) => void)[] = [];

export function addBannerListener(cb: (notif: ForegroundNotification | null) => void) {
  bannerListeners.push(cb);
  return () => {
    bannerListeners = bannerListeners.filter((l) => l !== cb);
  };
}

export function showBanner(notification: ForegroundNotification) {
  bannerListeners.forEach((cb) => cb(notification));
}

export function hideBanner() {
  bannerListeners.forEach((cb) => cb(null));
}

// ------------------------------------------------------------------
// Notification handler config
// ------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    } as Notifications.NotificationBehavior),
});

// ------------------------------------------------------------------
// Token registration
// ------------------------------------------------------------------
async function registerForPushNotificationsAsync(): Promise<string | null> {
  console.log('[Push] Starting token registration...');

  if (!Device.isDevice) {
    console.log('[Push] ❌ Must use physical device for push notifications');
    return null;
  }

  console.log('[Push] Checking notification permissions...');
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus !== 'granted') {
    console.log('[Push] Permission not granted, requesting...');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('[Push] ❌ Notification permission denied');
      return null;
    }
    console.log('[Push] ✅ Permission granted');
  } else {
    console.log('[Push] ✅ Permission already granted');
  }

  let token: string | null = null;

  // Initialize Firebase first (required for native builds)
  await initializeFirebaseApp();

  // Try native Firebase first (for development builds with google-services)
  if (firebaseInitialized && tryLoadFirebaseNative()) {
    try {
      console.log('[Push] Trying @react-native-firebase/messaging...');
      let fcmToken;
      const getToken = firebaseMessaging.getToken || firebaseMessaging.default?.getToken;
      if (typeof getToken === 'function') {
        // V22+ Modular API
        fcmToken = await getToken();
      } else {
        // V21 and below
        const factory = firebaseMessaging.default || firebaseMessaging;
        const instance = factory();
        if (instance) {
          fcmToken = await instance.getToken();
        }
      }
      if (fcmToken) {
        token = fcmToken;
        console.log('[Push] ✅ FCM Token (native):', token?.substring(0, 20) + '...');
      }
    } catch (err: any) {
      console.warn('[Push] Native FCM error:', err.message);
    }
  } else if (!firebaseInitialized) {
    console.log('[Push] Skipping native FCM — Firebase app not initialized in this build');
  }

  // Exponent push token fallback removed because the backend exclusively uses raw FCM tokens.
  // Expo Push tokens ("ExponentPushToken[...]") are incompatible with direct Firebase Admin SDK sending.
  if (!token && Platform.OS !== 'web') {
    console.log('[Push] Falling back to expo-notifications getDevicePushTokenAsync (raw FCM/APNs token)...');
    try {
      const deviceTokenResult = await Notifications.getDevicePushTokenAsync();
      if (deviceTokenResult?.data) {
        token = deviceTokenResult.data;
        console.log('[Push] ✅ Device Push Token (raw):', token?.substring(0, 40) + '...');
      }
    } catch (err: any) {
      console.warn('[Push] Device push token error:', err.message);
    }
  }

  if (!token) {
    console.log('[Push] ❌ No push token could be obtained');
    console.log('[Push] 💡 Tip: Run "npx expo prebuild --platform android" to enable native FCM');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });

    await Notifications.setNotificationChannelAsync('critical', {
      name: 'Critical Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#EF4444',
      sound: 'default',
    });
  }

  return token;
}

async function storePushToken(
  userId: string,
  token: string,
  propertyId?: string | null,
  organizationId?: string | null
): Promise<boolean> {
  try {
    console.log('[Push] Storing token for user:', userId);
    console.log('[Push] Token:', token?.substring(0, 30) + '...');

    // Primary: upsert via /api/query (goes through serverApi with auth)
    const { error } = await serverApi.query({
      table: 'push_tokens',
      action: 'upsert',
      values: {
        user_id: userId,
        token,
        property_id: propertyId || null,
        device_info: `${Platform.OS} ${Device.modelName || 'unknown'}`,
        browser: `fcm-${Platform.OS}`,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      mutationOptions: { onConflict: 'token' },
    });

    if (error) {
      console.warn('[Push] Primary store failed, trying /api/push-tokens/register:', error.message);

      // Fallback: use serverApi.post() — this attaches the bearer token automatically
      const { error: fallbackError } = await serverApi.post<{ success: boolean }>(
        '/api/push-tokens/register',
        {
          userId,
          token,
          propertyId,
          organizationId,
          deviceInfo: `${Platform.OS} ${Device.modelName || 'unknown'}`,
        }
      );

      if (fallbackError) {
        if (fallbackError.message?.includes('401') || fallbackError.message?.includes('Missing bearer token')) {
          console.warn('[Push] Mobile server store failed (unauthenticated):', fallbackError.message);
        } else {
          console.error('[Push] ❌ Mobile server store failed:', fallbackError.message);
        }
        return false;
      }
    }

    console.log('[Push] ✅ Token stored successfully!');
    
    // --- ONE-TIME WELCOME PUSH NOTIFICATION ---
    const hasSentWelcome = await mmkvAsyncStorage.getItem('welcome_push_sent');
    if (!hasSentWelcome) {
      console.log('[Push] Sending one-time welcome notification...');
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Welcome to the App! 🎉',
          body: 'You are all set to receive important updates and notifications.',
          sound: true,
        },
        trigger: null, // trigger immediately
      });
      await mmkvAsyncStorage.setItem('welcome_push_sent', 'true');
    }
    // ------------------------------------------
    
    return true;
  } catch (err: any) {
    console.error('[Push] ❌ Token storage exception:', err);
    return false;
  }
}

// ------------------------------------------------------------------
// Deep link extraction from push data
// ------------------------------------------------------------------
function extractRouteFromData(data: Record<string, any>): string | null {
  if (data?.ticket_id) {
    return `/property/${data.property_id || 'all'}/tickets/${data.ticket_id}`;
  }
  if (data?.deep_link) {
    const dl = data.deep_link as string;
    if (dl.includes('/procurement')) {
      return `/property/${data.property_id || 'all'}/stock`;
    }
    if (dl.includes('/security')) {
      return `/property/${data.property_id || 'all'}/security`;
    }
    if (dl.includes('/visitors')) {
      return `/property/${data.property_id || 'all'}/visitors`;
    }
    if (dl.includes('/tickets/')) {
      const match = dl.match(/\/tickets\/([^?]+)/);
      if (match) return `/property/${data.property_id || 'all'}/tickets/${match[1]}`;
    }
  }
  if (data?.screen) {
    return data.screen as string;
  }
  return null;
}

// ------------------------------------------------------------------
// Main Hook
// ------------------------------------------------------------------
export function usePushNotifications() {
  if (Platform.OS === 'web') return { lastTappedNotification: null };
  const { user, membership } = useAuth();
  const registeredRef = useRef(false);
  const tokenRef = useRef<string | null>(null);

  const [lastTappedNotification, setLastTappedNotification] = useState<ForegroundNotification | null>(null);

  // Get selected property from dashboard store
  const loadedPropertyId = useDashboardStore((state) => state.loadedPropertyId);
  const propertyId = loadedPropertyId || membership?.properties?.[0]?.id;
  const organizationId = membership?.org_id;

  const register = useCallback(async () => {
    if (!user?.id) return;

    // Phase 5: Defer registration until the user has completed PermissionOnboarding
    const permissionsRequested = await hasRequestedPermissions();
    if (!permissionsRequested) {
      console.log('[Push] Skipping token registration — PermissionOnboarding not yet completed');
      return;
    }

    // Phase 5: On-shift check — only register for push if the user is marked available
    // This prevents offline/off-shift staff from receiving ticket assignment notifications
    try {
      const { data: resolverStat } = await serverApi.query<{ is_available: boolean }>({
        table: 'resolver_stats',
        action: 'select',
        select: 'is_available',
        filters: [{ column: 'user_id', op: 'eq', value: user.id }],
        maybeSingle: true,
      });

      if (resolverStat && resolverStat.is_available === false) {
        console.log('[Push] Skipping token registration — user is off-shift (resolver_stats.is_available=false)');
        // If we had a previous token, deactivate it so off-shift staff aren't pinged
        if (tokenRef.current) {
          await serverApi.query({
            table: 'push_tokens',
            action: 'update',
            values: { is_active: false },
            filters: [
              { column: 'token', op: 'eq', value: tokenRef.current },
              { column: 'user_id', op: 'eq', value: user.id },
            ],
          });
          tokenRef.current = null;
          registeredRef.current = false;
        }
        return;
      }
    } catch (shiftErr) {
      // Non-blocking — if the check fails, proceed with registration
      console.warn('[Push] On-shift check failed (non-critical):', shiftErr);
    }

    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) return;

      if (tokenRef.current === token && registeredRef.current) {
        return;
      }

      const success = await storePushToken(user.id, token, propertyId, organizationId);
      if (success) {
        tokenRef.current = token;
        registeredRef.current = true;
        console.log('[Push] Token registered:', token.slice(0, 20) + '...');

        // Trigger welcome notification for the first time
        const hasSentWelcome = await mmkvAsyncStorage.getItem('welcome_push_sent');
        if (!hasSentWelcome) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Welcome to Autopilot! 🚀',
                body: 'Push notifications are successfully enabled. You will now receive important updates here.',
                sound: true,
              },
              trigger: null, // Send immediately
            });
            await mmkvAsyncStorage.setItem('welcome_push_sent', 'true');
          } catch (notifErr) {
            console.warn('[Push] Could not send welcome notification:', notifErr);
          }
        }
      }
    } catch (err) {
      console.error('[Push] Registration failed:', err);
    }
  }, [user?.id, propertyId, organizationId]);

  // Register on mount / login
  useEffect(() => {
    register();

    // Listen to token refreshes from Firebase (only if native Firebase is ready)
    let unsubscribe = () => {};
    (async () => {
      try {
        if (firebaseInitialized && tryLoadFirebaseNative()) {
          const onTokenRefresh = firebaseMessaging.onTokenRefresh || firebaseMessaging.default?.onTokenRefresh;
          if (typeof onTokenRefresh === 'function') {
            // V22+ Modular API
            unsubscribe = onTokenRefresh(async (newToken: string) => {
              console.log('[Push] Token refreshed via Firebase:', newToken);
              if (user?.id) {
                storePushToken(user.id, newToken, propertyId, organizationId);
                tokenRef.current = newToken;
              }
            });
          } else {
            // V21 and below
            const factory = firebaseMessaging.default || firebaseMessaging;
            const instance = factory();
            if (instance) {
              unsubscribe = instance.onTokenRefresh(async (newToken: string) => {
                console.log('[Push] Token refreshed via Firebase:', newToken);
                if (user?.id) {
                  storePushToken(user.id, newToken, propertyId, organizationId);
                  tokenRef.current = newToken;
                }
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Push] Failed to subscribe to token refresh:', err);
      }
    })();

    return () => unsubscribe();
  }, [register, user?.id]);

  // Re-register when app comes to foreground (handles token refresh)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && user?.id) {
        register();
      }
    });

    return () => subscription.remove();
  }, [user?.id, register]);

  // Deactivate token on logout
  useEffect(() => {
    if (!user && tokenRef.current) {
      serverApi
        .query({
          table: 'push_tokens',
          action: 'update',
          values: { is_active: false },
          filters: [{ column: 'token', op: 'eq', value: tokenRef.current }],
        })
        .then(() => {
          console.log('[Push] Token deactivated on logout');
          tokenRef.current = null;
          registeredRef.current = false;
        })
        .catch((err: any) => {
          if (err.message?.includes('401') || err.message?.includes('Missing bearer token')) {
            console.warn('[Push] Token deactivation skipped (no session)');
          } else {
            console.error('[Push] Token deactivation error:', err);
          }
        });
    }
  }, [user]);

  // Foreground notification listener — show in-app banner
  useEffect(() => {
    if (Platform.OS === 'web') return;
    
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      console.log('[Push] Foreground notification:', content);

      showBanner({
        id: notification.request.identifier,
        title: content.title || 'Notification',
        body: content.body || '',
        data: (content.data as Record<string, any>) || {},
        timestamp: Date.now(),
      });
    });

    return () => subscription.remove();
  }, []);

  // Notification tap listener (background / quit → foreground)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, any>;
        const title = response.notification.request.content.title || '';
        const body = response.notification.request.content.body || '';

        console.log('[Push] Notification tapped:', data);

        setLastTappedNotification({
          id: response.notification.request.identifier,
          title,
          body,
          data: data || {},
          timestamp: Date.now(),
        });
      }
    );

    return () => responseSubscription.remove();
  }, []);

  // Check for notification that launched the app (cold start)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const data = response.notification.request.content.data as Record<string, any>;
        const title = response.notification.request.content.title || '';
        const body = response.notification.request.content.body || '';

        console.log('[Push] App launched from notification:', data);

        setLastTappedNotification({
          id: response.notification.request.identifier,
          title,
          body,
          data: data || {},
          timestamp: Date.now(),
        });
      }
    });
  }, []);

  return {
    lastTappedNotification,
    extractRouteFromData,
    clearLastTapped: () => setLastTappedNotification(null),
  };
}
