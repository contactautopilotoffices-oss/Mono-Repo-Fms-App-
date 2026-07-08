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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardStore } from '@/stores/dashboardStore';
import { prefetchDashboard, prefetchImportantOnLogin } from '@/services/prefetchService';

const MIN_DISPLAY_MS = 100; // Minimum time logo is visible
const ENTRANCE_DURATION = 100; // Almost instant entrance
const EXIT_DURATION = 300;      // Snappy fade-out duration
const SCALE_INITIAL = 1.0;     // Match native splash size exactly
const SCALE_FINAL = 1.0;        // Stay at native size
const EXIT_SCALE = 1.2;         // Subtle grow while fading out
const EXIT_TRANSLATE_Y = 0;     // Keep centered while zooming out

interface AnimatedSplashProps {
  onAnimationComplete: () => void;
  startupComplete: boolean;
}

export function AnimatedSplash({ onAnimationComplete, startupComplete }: AnimatedSplashProps) {
  const { user, isLoading: isAuthLoading, membership, isMembershipLoading } = useAuth();

  const [phase, setPhase] = useState<'entering' | 'holding' | 'prefetching' | 'exiting' | 'done'>('entering');
  const splashStartTime = useRef(Date.now());
  const hasCompletedRef = useRef(false);
  const hasPrefetchedRef = useRef(false);
  const hasHapticTriggered = useRef(false);

  // Animation values
  const scale = useSharedValue(SCALE_INITIAL);
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  const runExitAnimation = useCallback(() => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    setPhase('exiting');

    // Zoom the logo out completely + fade away
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

  // Entrance animation: camera zooms into the logo (small -> fills screen)
  useEffect(() => {
    if (phase !== 'entering') return;

    // Subtle hardware vibration as the zoom begins
    if (!hasHapticTriggered.current) {
      hasHapticTriggered.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }

    scale.value = withTiming(SCALE_FINAL, {
      duration: ENTRANCE_DURATION,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) {
        runOnJS(setPhase)('holding');
      }
    });
  }, [phase, scale]);

  // Background prefetch while the splash is visible
  useEffect(() => {
    if (hasPrefetchedRef.current) return;
    if (isAuthLoading || isMembershipLoading) return;
    if (!user || !membership?.properties?.length) return;

    hasPrefetchedRef.current = true;
    setPhase('prefetching');

    const propertyId = useDashboardStore.getState().selectedPropertyId || membership.properties[0].id;
    if (!propertyId) return;

    // Start prefetch in parallel; don't block the exit animation
    Promise.allSettled([
      prefetchDashboard(propertyId),
      prefetchImportantOnLogin(propertyId),
    ]).then(() => {
      console.log('[AnimatedSplash] Background prefetch complete');
    });
  }, [isAuthLoading, isMembershipLoading, user, membership]);

  // Trigger exit once startup is complete and minimum display time has passed
  useEffect(() => {
    if (phase === 'exiting' || phase === 'done' || phase === 'entering') return;

    const checkReady = () => {
      if (!startupComplete) return;
      if (isAuthLoading || isMembershipLoading) return;

      const elapsed = Date.now() - splashStartTime.current;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

      const timer = setTimeout(() => {
        runExitAnimation();
      }, remaining);

      return () => clearTimeout(timer);
    };

    const cleanup = checkReady();
    return cleanup;
  }, [startupComplete, isAuthLoading, isMembershipLoading, phase, runExitAnimation]);

  // Safety: force exit after a max duration so the splash never traps the user
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
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <View style={styles.content}>
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <Image
            source={require('../../assets/images/autopilot-logo-new.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
    tintColor: '#000000',
  },
});

export default AnimatedSplash;
