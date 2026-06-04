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

/**
 * Enhanced SkeletonItem with shimmer wave effect
 * Creates a left-to-right shimmer that feels premium
 */
const SkeletonItem = ({ style, delay = 0 }: { style: any; delay?: number }) => {
  const shimmerX = useSharedValue(-100);

  useEffect(() => {
    shimmerX.value = withDelay(
      delay,
      withRepeat(
        withTiming(width + 100, { duration: 1500, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, [shimmerX, delay]);

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shimmerX.value, [-100, width + 100], [-50, 50]);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View style={[styles.skeletonBase, style]}>
      {/* Shimmer overlay */}
      <Animated.View style={[styles.shimmer, shimmerStyle]} />
    </View>
  );
};

export default function SkeletonLoader() {
  return (
    <View style={styles.container}>
      {/* Header Skeleton */}
      <View style={styles.header}>
        <View>
          <SkeletonItem style={styles.title} delay={0} />
          <SkeletonItem style={styles.subtitle} delay={100} />
        </View>
        <SkeletonItem style={styles.avatar} delay={50} />
      </View>

      {/* Stats Row Skeleton */}
      <View style={styles.statsRow}>
        <SkeletonItem style={styles.statCard} delay={150} />
        <SkeletonItem style={styles.statCard} delay={200} />
      </View>

      {/* KPI Cards Skeleton */}
      {[1, 2].map((i) => (
        <SkeletonItem key={i} style={styles.kpiCard} delay={250 + i * 50} />
      ))}

      {/* List Items Skeleton */}
      {[1, 2, 3].map((i) => (
        <SkeletonItem key={i} style={styles.listItem} delay={350 + i * 80} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  skeletonBase: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: 'rgba(255,255,255,0.15)',
    transform: [{ skewX: '-20deg' }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 12,
  },
  title: {
    width: 140,
    height: 28,
    marginBottom: 8,
    borderRadius: 8,
  },
  subtitle: {
    width: 180,
    height: 14,
    borderRadius: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    height: 90,
    borderRadius: 16,
  },
  kpiCard: {
    width: '100%',
    height: 140,
    borderRadius: 20,
    marginBottom: 14,
  },
  listItem: {
    width: '100%',
    height: 72,
    borderRadius: 16,
    marginBottom: 10,
  },
});
