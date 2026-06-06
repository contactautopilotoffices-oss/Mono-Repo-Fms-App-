import React, { useEffect, useRef, useState } from 'react';
import { Text, TextProps } from 'react-native';

interface Props extends TextProps {
  value: number;
  duration?: number;
}

// Global flag to track if the initial load animation has occurred.
// This ensures the animation only runs once when coming from login/splash.
let globalHasAnimated = false;

export function resetAnimatedNumber() {
  globalHasAnimated = false;
}

export function AnimatedNumber({ value, duration = 1000, style, ...props }: Props) {
  // If globalHasAnimated is true, start at the target value immediately to skip animation.
  const [displayValue, setDisplayValue] = useState(() => globalHasAnimated ? value : 0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const change = value - startValue;

    // After the first render, mark that we've animated.
    // We use a small timeout to allow all initial numbers on the dashboard to mount and animate together.
    const timer = setTimeout(() => {
      globalHasAnimated = true;
    }, 500);

    if (change === 0) {
      setDisplayValue(value);
      return () => clearTimeout(timer);
    }

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      setDisplayValue(Math.round(startValue + change * easeProgress));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
      }
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      clearTimeout(timer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  // If value changes from parent after animation is done, we might want to animate it,
  // or just snap to it. The user specifically asked to skip animation "every time in app".
  // The current logic will snap to it if globalHasAnimated was true on mount (because change === 0).
  // If the value updates dynamically while looking at the screen, it will animate the delta!
  
  // Wait, if value updates, `displayValue` is the old value, so `change !== 0`, and it WILL animate!
  // This is PERFECT! It only skips the initial 0 -> X mounting animation.

  return <Text style={style} {...props}>{displayValue}</Text>;
}
