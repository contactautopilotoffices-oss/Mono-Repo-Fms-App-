/**
 * BiometricGate — wraps the entire app. When locked, renders an opaque overlay
 * over all content (so nothing sensitive is visible) and auto-prompts for
 * biometric/passcode authentication.
 *
 * No-op when the lock is disabled or unavailable: children render untouched.
 */

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useBiometricLock } from '@/hooks/useBiometricLock';

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { locked, unlock } = useBiometricLock();

  // Auto-present the biometric prompt the moment we become locked.
  useEffect(() => {
    if (locked) {
      unlock();
    }
  }, [locked, unlock]);

  return (
    <View style={styles.flex}>
      {children}
      {locked && (
        <View style={styles.overlay} pointerEvents="auto">
          <Text style={styles.icon}>🔒</Text>
          <Text style={styles.title}>Autopilot is locked</Text>
          <Text style={styles.subtitle}>Authenticate to continue</Text>
          <TouchableOpacity style={styles.btn} onPress={unlock} activeOpacity={0.85}>
            <Text style={styles.btnText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B0F1A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: '#9CA3AF', fontSize: 14, marginBottom: 28 },
  btn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});

export default BiometricGate;
