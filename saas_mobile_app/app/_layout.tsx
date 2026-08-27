// @ts-nocheck
import React, { useEffect, Component, ReactNode, useState, useCallback, useRef } from 'react';
import { initSentry, Sentry } from '@/lib/sentry';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, ThemeProvider } from '@/context';
import { useColorScheme, View, Text, StyleSheet, AppState } from 'react-native';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import NotificationBanner from '@/components/notifications/NotificationBanner';
import { PersistGate } from '@/components/PersistGate';
import { focusManager } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { AnimatedSplash } from '@/components/splash/AnimatedSplash';
import { useAuth } from '@/hooks/useAuth';
import '@/utils/fontScaling';
import { showNetworkErrorToast } from '@/utils/networkToast';
import { useNetworkMonitor } from '@/hooks/useNetworkMonitor';
import { useOfflineMediaSync } from '@/hooks/useOfflineMediaSync';

// Initialize Sentry crash reporting before anything else
initSentry();

// Global error handler to catch silent crashes and network glitches
if (typeof window !== 'undefined') {
  const originalOnError = window.onerror;
  window.onerror = (msg, src, line, col, err) => {
    console.log('[GLOBAL ERROR]', msg, 'at', src, 'line:', line, 'col:', col, err?.stack);
    const msgStr = String(msg || err?.message || '').toLowerCase();
    if (msgStr.includes('network') || msgStr.includes('failed to fetch') || msgStr.includes('timeout') || msgStr.includes('aborted')) {
      showNetworkErrorToast('Network connection is slow or unavailable.');
      return true; // Suppress crash for network glitches
    }
    if (originalOnError) return originalOnError(msg, src, line, col, err);
    return false;
  };
  const originalOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (e: PromiseRejectionEvent) => {
    console.log('[UNHANDLED REJECTION]', e.reason);
    const reasonStr = String(e?.reason?.message || e?.reason || '').toLowerCase();
    if (reasonStr.includes('network') || reasonStr.includes('failed to fetch') || reasonStr.includes('timeout') || reasonStr.includes('aborted')) {
      showNetworkErrorToast('Network connection is slow or unavailable.');
      return undefined; // Suppress unhandled network promise rejection crash
    }
    if (originalOnUnhandledRejection) return originalOnUnhandledRejection.call(window, e);
    return undefined;
  };
}

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

// Error boundary to catch crashes and convert network errors to non-intrusive toasts
class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout') || msg.includes('aborted')) {
      showNetworkErrorToast('Network is slow or disconnected.');
      return { hasError: false };
    }
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.log('[ErrorBoundary] Caught:', error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>App Error</Text>
          <Text style={styles.errorMsg}>{this.state.error?.message}</Text>
          <Text style={styles.errorStack}>{this.state.error?.stack?.slice(0, 500)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: { flex: 1, backgroundColor: '#ffcccc', padding: 20, justifyContent: 'center' },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#cc0000', marginBottom: 8 },
  errorMsg: { fontSize: 14, color: '#333', marginBottom: 8 },
  errorStack: { fontSize: 10, color: '#666', fontFamily: 'monospace' },
});

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const [appReady, setAppReady] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [splashAnimationComplete, setSplashAnimationComplete] = useState(false);

  console.log('[RootLayout] Rendering...');

  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState<Error | null>(null);

  // Load custom fonts (Consistently on both Web and Native with try-catch safety)
  useEffect(() => {
    async function loadFonts() {
      try {
        await Promise.race([
          Font.loadAsync({
            'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
            'Poppins-Medium': require('../assets/fonts/Poppins-Medium.ttf'),
            'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
            'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
            'Urbanist-Regular': require('../assets/fonts/Urbanist.ttf'),
            'Urbanist-Medium': require('../assets/fonts/Urbanist.ttf'),
            'Urbanist-SemiBold': require('../assets/fonts/Urbanist.ttf'),
            'Urbanist-Bold': require('../assets/fonts/Urbanist.ttf'),
            'PressStart2P': require('../assets/fonts/PressStart2P.ttf'),
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Font loading timed out after 3000ms')), 3000)
          ),
        ]);
        setFontsLoaded(true);
      } catch (err: any) {
        console.warn('[RootLayout] Font loading failed or timed out, using system fallback fonts:', err.message);
        setFontError(err);
        setFontsLoaded(true); // Proceed with system font fallbacks to prevent crash
      }
    }
    loadFonts();
  }, []);

  // Wire up React Query focus manager to AppState changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  // Mark app ready when fonts are loaded (or errored)
  useEffect(() => {
    if (fontsLoaded || fontError) {
      setAppReady(true);
    }
  }, [fontsLoaded, fontError]);

  // Track hydration completion from PersistGate
  const handleHydrationComplete = useCallback(() => {
    setIsHydrated(true);
  }, []);

  return (
    <ErrorBoundary>
      <PersistGate onReady={handleHydrationComplete}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ThemeProvider>
              <AuthProvider>
                <BottomSheetModalProvider>
                  <AppContent
                    colorScheme={colorScheme}
                    appReady={appReady}
                    isHydrated={isHydrated}
                    splashAnimationComplete={splashAnimationComplete}
                    setSplashAnimationComplete={setSplashAnimationComplete}
                  />
                </BottomSheetModalProvider>
              </AuthProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </PersistGate>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayoutInner);

interface AppContentProps {
  colorScheme: any;
  appReady: boolean;
  isHydrated: boolean;
  splashAnimationComplete: boolean;
  setSplashAnimationComplete: (value: boolean) => void;
}

function AppContent({
  colorScheme,
  appReady,
  isHydrated,
  splashAnimationComplete,
  setSplashAnimationComplete,
}: AppContentProps) {
  // Register push notifications inside AuthProvider context
  usePushNotifications();
  // Register offline media sync for checklists
  useOfflineMediaSync();
  // Monitor real-time network connectivity changes with toast notifications
  useNetworkMonitor();

  const { isLoading: isAuthLoading, isMembershipLoading } = useAuth();

  // Track whether the app has been backgrounded so we can skip the animated splash on resume
  const hasBeenInactive = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        hasBeenInactive.current = true;
      } else if (nextAppState === 'active' && hasBeenInactive.current) {
        // Warm resume from background: hide splash immediately instead of replaying it.
        setSplashAnimationComplete(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [setSplashAnimationComplete]);

  // Handle animated splash completion - this is when we finally hide the animated splash
  const handleAnimatedSplashComplete = useCallback(() => {
    console.log('[RootLayout] Animated splash complete');
    setSplashAnimationComplete(true);
  }, [setSplashAnimationComplete]);

  // Show animated splash while app is initializing and until animation finishes
  const showAnimatedSplash = !splashAnimationComplete;

  // Splash stays until fonts, hydration, and auth/membership are all resolved
  const startupComplete = appReady && isHydrated && !isAuthLoading && !isMembershipLoading;

  return (
    <>
      <NotificationBanner />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Toast />

      {/* Premium Animated Splash - renders over the app until startup completes
          and the logo zoom-out animation finishes */}
      {showAnimatedSplash && (
        <AnimatedSplash
          startupComplete={startupComplete}
          onAnimationComplete={handleAnimatedSplashComplete}
        />
      )}
    </>
  );
}
