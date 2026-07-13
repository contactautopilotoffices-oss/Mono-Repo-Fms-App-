/**
 * AnimatedSplash - Premium Animated Splash Screen
 *
 * Shows the Autopilot logo centered, zooms it in, then fades away
 * to reveal the app underneath. During the splash, auth state is resolved
 * and the user's dashboard is prefetched in the background for a smooth,
 * professional cold-start experience.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardStore } from '@/stores/dashboardStore';
import { prefetchDashboard, prefetchImportantOnLogin } from '@/services/prefetchService';

const MIN_DISPLAY_MS = 600; // Total minimum time before exiting
const HOLD_DURATION = 150;  // Initial hold time to ensure perfect handoff
const EXIT_DURATION = 350;  // Snappy fade-out duration
const SCALE_INITIAL = 1.0;
const GROW_SCALE = 1.12;    // Scale to grow to during the subtle phase
const EXIT_SCALE = 1.25;    // Scale out when finishing
const EXIT_TRANSLATE_Y = 0; // Keep centered

interface AnimatedSplashProps {
  onAnimationComplete: () => void;
  startupComplete: boolean;
}

export function AnimatedSplash({ onAnimationComplete, startupComplete }: AnimatedSplashProps) {
  const { user, isLoading: isAuthLoading, membership, isMembershipLoading } = useAuth();

  const [phase, setPhase] = useState<'mounting' | 'holding' | 'animating' | 'prefetching' | 'exiting' | 'done'>('mounting');
  const splashStartTime = useRef(Date.now());
  const hasCompletedRef = useRef(false);
  const hasPrefetchedRef = useRef(false);

  // Animation values
  const scale = useSharedValue(SCALE_INITIAL);
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  // Sync handoff: Hide native splash precisely when we render our first frame
  const onLayout = useCallback(() => {
    if (phase !== 'mounting') return;
    
    // requestAnimationFrame ensures we wait until the UI thread actually paints
    requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {});
      setPhase('holding');
    });
  }, [phase]);

  // Stage 1 -> Stage 2: Hold then begin subtle premium scale/fade
  useEffect(() => {
    if (phase === 'holding') {
      const timer = setTimeout(() => {
        setPhase('animating');
        
        // Stage 2: Smooth spring scale
        scale.value = withSpring(GROW_SCALE, {
          damping: 20,
          stiffness: 90,
          mass: 1,
        });

        // Stage 3: Very subtle opacity drop
        opacity.value = withTiming(0.98, { duration: 800 });

      }, HOLD_DURATION);
      return () => clearTimeout(timer);
    }
  }, [phase, scale, opacity]);

  const runExitAnimation = useCallback(() => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    setPhase('exiting');
    
    // Haptic feedback as we exit to dashboard
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Stage 4: Zoom out and crossfade
    scale.value = withTiming(EXIT_SCALE, {
      duration: EXIT_DURATION,
      easing: Easing.in(Easing.ease),
    });

    translateY.value = withTiming(EXIT_TRANSLATE_Y, {
      duration: EXIT_DURATION,
      easing: Easing.out(Easing.ease),
    });

    opacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: Easing.out(Easing.ease),
    }, (finished) => {
      if (finished) {
        runOnJS(onAnimationComplete)();
      }
    });
  }, [onAnimationComplete, opacity, scale, translateY]);

  // Background prefetch
  useEffect(() => {
    if (hasPrefetchedRef.current) return;
    if (isAuthLoading || isMembershipLoading) return;
    if (!user || !membership?.properties?.length) return;

    hasPrefetchedRef.current = true;
    const propertyId = useDashboardStore.getState().selectedPropertyId || membership.properties[0].id;
    if (!propertyId) return;

    Promise.allSettled([
      prefetchDashboard(propertyId),
      prefetchImportantOnLogin(propertyId),
    ]).then(() => {
      console.log('[AnimatedSplash] Background prefetch complete');
    });
  }, [isAuthLoading, isMembershipLoading, user, membership]);

  // Trigger exit
  useEffect(() => {
    if (phase === 'exiting' || phase === 'done' || phase === 'mounting' || phase === 'holding') return;

    if (!startupComplete) return;
    if (isAuthLoading || isMembershipLoading) return;

    const elapsed = Date.now() - splashStartTime.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    const timer = setTimeout(() => {
      runExitAnimation();
    }, remaining);

    return () => clearTimeout(timer);
  }, [startupComplete, isAuthLoading, isMembershipLoading, phase, runExitAnimation]);

  // Safety fallback
  useEffect(() => {
    const maxTimer = setTimeout(() => {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        opacity.value = 0;
        onAnimationComplete();
      }
    }, 8000);
    return () => clearTimeout(maxTimer);
  }, [onAnimationComplete, opacity]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }] as [{ scale: number }, { translateY: number }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none" onLayout={onLayout}>
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Image
          source={require('../../assets/images/autopilot-logo-new.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  logoContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});

export default AnimatedSplash;
