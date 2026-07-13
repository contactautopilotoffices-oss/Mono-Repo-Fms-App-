// @ts-nocheck
import React from 'react';
import { StyleSheet, View, Image } from 'react-native';

export default function DashboardBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Image
        source={require('@/assets/images/weather-moon.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
    </View>
  );
}
