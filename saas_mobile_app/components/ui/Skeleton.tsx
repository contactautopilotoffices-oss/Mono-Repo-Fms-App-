import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
  isDark?: boolean;
}

export default function Skeleton({ width = '100%', height = 20, borderRadius = 8, style, isDark = true }: SkeletonProps) {
  const animatedValue = useSharedValue(0);
  const [layoutWidth, setLayoutWidth] = React.useState<number>(0);

  useEffect(() => {
    animatedValue.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      animatedValue.value,
      [0, 1],
      [-layoutWidth || -300, layoutWidth || 300]
    );

    return {
      transform: [{ translateX }],
    };
  });

  const baseColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const highlightColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';

  return (
    <View 
      style={[{ width, height, borderRadius, backgroundColor: baseColor, overflow: 'hidden' }, style]}
      onLayout={(e: LayoutChangeEvent) => setLayoutWidth(e.nativeEvent.layout.width)}
    >
      {layoutWidth > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <LinearGradient
            colors={['transparent', highlightColor, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}
