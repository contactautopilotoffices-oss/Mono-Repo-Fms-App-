import React from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function DashboardBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={['#030712', '#0f172a', '#1e293b']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <Image 
        source={require('@/assets/images/weather-moon.png')}
        style={StyleSheet.absoluteFillObject} 
        resizeMode="cover"
      />
      {/* Dark backdrop overlay to ensure text readability */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(10, 10, 15, 0.70)' }]} />
    </View>
  );
}
