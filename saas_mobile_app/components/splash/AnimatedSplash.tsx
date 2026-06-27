/**
 * AnimatedSplash - Premium Animated Splash Screen
 *
 * Provides a smooth, enterprise-grade animated logo reveal during app startup.
 * Runs in parallel with critical initialization tasks.
 *
 * Animation: Logo scales from 85% to 100% with ease-out curve over 700-900ms
 * If startup is slow (>2s), a subtle loading indicator appears below the logo
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const ANIMATION_DURATION = 800;
const SCALE_INITIAL = 0.85;
const SCALE_FINAL = 1;
const SLOW_STARTUP_THRESHOLD = 2000;

interface AnimatedSplashProps {
  onAnimationComplete: () => void;
  startupComplete: boolean;
}

export function AnimatedSplash({ onAnimationComplete, startupComplete }: AnimatedSplashProps) {
  const [showLoader, setShowLoader] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const splashStartTime = useRef(Date.now());

  // Animation values
  const scale = useSharedValue(SCALE_INITIAL);
  const opacity = useSharedValue(0);
  const loaderOpacity = useSharedValue(0);

  // Track if we've already called onAnimationComplete
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    // Start entrance animation immediately
    // Fade in + scale up
    opacity.value = withTiming(1, {
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.ease),
    });

    scale.value = withSpring(SCALE_FINAL, {
      damping: 15,
      stiffness: 100,
      mass: 1,
    });

    // Set ready state for transition
    const readyTimeout = setTimeout(() => {
      setIsReady(true);
    }, 100);

    // Show loader if startup is slow
    const loaderTimeout = setTimeout(() => {
      if (!startupComplete) {
        setShowLoader(true);
        loaderOpacity.value = withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        });
      }
    }, SLOW_STARTUP_THRESHOLD);

    return () => {
      clearTimeout(readyTimeout);
      clearTimeout(loaderTimeout);
    };
  }, []);

  // Handle startup completion
  useEffect(() => {
    if (startupComplete && isReady && !hasCompletedRef.current) {
      hasCompletedRef.current = true;

      // Let animation finish naturally, then transition
      const transitionDelay = Math.max(0, ANIMATION_DURATION - (Date.now() - splashStartTime.current));

      setTimeout(() => {
        // Fade out splash
        opacity.value = withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        }, (finished) => {
          if (finished) {
            runOnJS(onAnimationComplete)();
          }
        });
      }, transitionDelay);
    }
  }, [startupComplete, isReady, onAnimationComplete]);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const loaderStyle = useAnimatedStyle(() => ({
    opacity: loaderOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <Image
            source={require('../../assets/images/autopilot-logo-new.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {showLoader && (
          <Animated.View style={[styles.loaderContainer, loaderStyle]}>
            <ActivityIndicator size="small" color="#708F96" />
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F1521',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: width * 0.5,
    height: width * 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  loaderContainer: {
    marginTop: 32,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AnimatedSplash;
