import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { mmkvAsyncStorage as AsyncStorage } from '@/utils/storage';
import { mmkvStorage, isMMKVAvailable } from '@/utils/storage';

export type WeatherCondition = 'clear-night' | 'sunny' | 'cloudy' | 'rainy' | 'clear-day' | 'cloudy-day' | 'cloudy-night' | 'cosmic' | 'custom' | string;

interface WeatherBackgroundProps {
  condition: WeatherCondition | undefined | null;
}

const BACKGROUND_IMAGES: Record<string, any> = {
  'sunny': require('@/assets/images/weather-sun.png'),
  'clear-day': require('@/assets/images/weather-sun.png'),
  'clear-night': require('@/assets/images/weather-moon.png'),
  'cloudy': require('@/assets/images/weather-cloud.png'),
  'cloudy-day': require('@/assets/images/weather-cloud.png'),
  'cloudy-night': require('@/assets/images/weather-cloud.png'),
  'rainy': require('@/assets/images/weather-rain.png'),
  'cosmic': require('@/assets/images/weather-moon.png'),
  'custom': require('@/assets/images/launch-bg.png'),
  'default': require('@/assets/images/default-dashboard-bg.png'),
};

const THEME_GRADIENTS: Record<string, readonly [string, string, ...string[]]> = {
  'sunny': ['#f47133', '#e85d1e', '#d14309'],        // Glossy vibrant orange-red
  'clear-day': ['#f47133', '#e85d1e', '#d14309'],
  'clear-night': ['#030712', '#0f172a', '#1e293b'],  // Starry Deep Night
  'cloudy': ['#1e293b', '#334155', '#475569'],       // Elegant Slate Cloudy
  'cloudy-day': ['#1e293b', '#334155', '#475569'],
  'cloudy-night': ['#090d16', '#121824', '#1b2333'],
  'rainy': ['#0f172a', '#1e293b', '#334155'],        // Deep Stormy Rain
  'cosmic': ['#0a0a1a', '#1a1040', '#0d1b3e'],       // Deep cosmic purple-blue
  'custom': ['#0a0a1a', '#1a1040', '#0d1b3e'],       // Matching launch-bg gradient
  'default': ['#0a0a1a', '#1a1040', '#0d1b3e'],       // Matching launch-bg gradient
};

export default function WeatherBackground({ condition }: WeatherBackgroundProps) {
  const [overrideCondition, setOverrideCondition] = useState<string | null | undefined>(() => {
    // Synchronously read from MMKV if available to prevent flash
    if (isMMKVAvailable) {
      try {
        const val = mmkvStorage.getString('fms_dashboard_background');
        return val ?? null;
      } catch (e) {
        return undefined;
      }
    }
    return undefined;
  });

  useEffect(() => {
    if (overrideCondition !== undefined) return; // Already loaded synchronously

    const loadPref = async () => {
      try {
        const pref = await AsyncStorage.getItem('fms_dashboard_background');
        setOverrideCondition(pref || null);
      } catch (e) {
        setOverrideCondition(null);
      }
    };
    loadPref();
  }, [condition, overrideCondition]);

  if (overrideCondition === undefined) {
    // Prevent flash of default night image while async storage resolves
    return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0f172a' }]} />;
  }

  // Handle custom image URIs
  const isCustomUri = overrideCondition && (
    overrideCondition.startsWith('file://') || 
    overrideCondition.startsWith('http://') || 
    overrideCondition.startsWith('https://') || 
    overrideCondition.startsWith('data:image')
  );

  // Default to the app-wide default backdrop unless a weather-based preset was explicitly chosen
  const mappedCondition = (overrideCondition && !isCustomUri)
    ? overrideCondition.toLowerCase()
    : 'default';
      
  const backgroundImage = isCustomUri 
    ? { uri: overrideCondition }
    : (BACKGROUND_IMAGES[mappedCondition] || BACKGROUND_IMAGES['clear-night']);
  const gradientColors = THEME_GRADIENTS[mappedCondition] || THEME_GRADIENTS['clear-night'];

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View key={mappedCondition} style={StyleSheet.absoluteFillObject}>
        {/* Base Climate-tailored Gradient */}
        <LinearGradient
          colors={gradientColors}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <Image
          source={backgroundImage}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}
