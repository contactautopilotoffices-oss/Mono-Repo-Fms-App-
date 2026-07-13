// @ts-nocheck
import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

import { LinearGradient } from 'expo-linear-gradient';

/**
 * Shimmer item – same effect as SkeletonLoader but used for content-only skeleton
 */
const SkeletonItem = ({ style, delay = 0 }: { style: any; delay?: number }) => {
  const shimmerX = useSharedValue(0);

  useEffect(() => {
    shimmerX.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
        -1,
        false
      )
    );
  }, [shimmerX, delay]);

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shimmerX.value, [0, 1], [-width, width]);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View style={[styles.skeletonBase, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle, { width: width * 1.5 }]}>
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0.04)',
            'rgba(255,255,255,0.12)',
            'rgba(255,255,255,0.04)',
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

/**
 * ContentSkeletonLoader – renders skeleton placeholders for the dashboard
 * content area only (no header). Used when the header shell renders instantly
 * from cached membership data, while dashboard API data is still loading.
 */
export default function ContentSkeletonLoader() {
  return (
    <View style={styles.container}>
      {/* "PROPERTY OVERVIEW" title placeholder */}
      <SkeletonItem style={styles.sectionTitle} delay={0} />

      {/* Tickets card placeholder */}
      <SkeletonItem style={styles.bigCard} delay={80} />

      {/* Needs Attention header placeholder */}
      <View style={styles.attentionHeader}>
        <SkeletonItem style={styles.attentionTitle} delay={150} />
        <SkeletonItem style={styles.attentionLink} delay={180} />
      </View>

      {/* Attention cards */}
      {[1, 2, 3].map((i) => (
        <SkeletonItem key={i} style={styles.attentionCard} delay={200 + i * 60} />
      ))}

      {/* Additional KPI cards */}
      <SkeletonItem style={styles.kpiCard} delay={400} />
      <SkeletonItem style={styles.kpiCard} delay={460} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  skeletonBase: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    width: 200,
    height: 26,
    borderRadius: 8,
    marginBottom: 20,
  },
  bigCard: {
    width: '100%',
    height: 160,
    borderRadius: 20,
    marginBottom: 20,
  },
  attentionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  attentionTitle: {
    width: 160,
    height: 14,
    borderRadius: 4,
  },
  attentionLink: {
    width: 60,
    height: 14,
    borderRadius: 4,
  },
  attentionCard: {
    width: '100%',
    height: 80,
    borderRadius: 16,
    marginBottom: 10,
  },
  kpiCard: {
    width: '100%',
    height: 130,
    borderRadius: 20,
    marginBottom: 14,
  },
});
