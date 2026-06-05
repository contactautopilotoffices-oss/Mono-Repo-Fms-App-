/**
 * Biometric helpers — app-wide Face ID / Fingerprint lock.
 *
 * Design principle: biometric is a LOCAL gate. It authenticates the user to the
 * DEVICE and unlocks access to the already-stored session — it is NOT a server
 * auth factor. The server still validates the session token independently.
 *
 * Lockout-safe: authenticate() allows device-passcode fallback, so a failed or
 * unavailable fingerprint never permanently locks a user out.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ENABLED_KEY = 'biometric_lock_enabled';

/** True only if the device has biometric hardware AND the user has enrolled a biometric. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/** Human label for the available modality, for UI copy. */
export async function getBiometricLabel(): Promise<string> {
  if (Platform.OS === 'web') return 'Biometrics';
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Fingerprint';
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'Iris';
    return 'Biometrics';
  } catch {
    return 'Biometrics';
  }
}

/** Whether the user has turned on the app lock (default: OFF until explicitly enabled). */
export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

/** Turn the app lock on/off. Call from a Settings toggle. */
export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // best-effort; if SecureStore write fails the lock simply stays in its prior state
  }
}

/**
 * Prompt the user for biometric (or device passcode) authentication.
 * Returns true on success. Device-passcode fallback is enabled to prevent lockout.
 */
export async function authenticate(reason = 'Unlock Autopilot'): Promise<boolean> {
  if (Platform.OS === 'web') return true; // no native biometrics on web — do not block
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // allow PIN/passcode fallback → never lock the user out
    });
    return result.success;
  } catch {
    return false;
  }
}
