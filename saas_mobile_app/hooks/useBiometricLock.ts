/**
 * useBiometricLock — app-wide lock state machine.
 *
 * Locks when ALL of these hold:
 *   - native platform (not web)
 *   - the user has an authenticated session (never locks the login screen)
 *   - the user enabled the lock AND a biometric is enrolled
 *
 * Re-locks on cold start and when the app returns from background after a
 * short grace period (so a quick app-switch doesn't demand re-auth every time).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import {
  authenticate,
  isBiometricAvailable,
  isBiometricLockEnabled,
} from '@/lib/biometric';

// Re-lock only if the app was in the background longer than this.
const BACKGROUND_LOCK_THRESHOLD_MS = 30_000;

export function useBiometricLock() {
  const { session, isLoading } = useAuth();
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const backgroundedAt = useRef<number | null>(null);
  const gatedRef = useRef(false); // is the lock active for this session?

  // Resolve whether the lock should apply for the current session.
  const resolveGate = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    if (!session) return false;
    const [enabled, available] = await Promise.all([
      isBiometricLockEnabled(),
      isBiometricAvailable(),
    ]);
    const gate = enabled && available;
    gatedRef.current = gate;
    return gate;
  }, [session]);

  // Cold start / session change: lock immediately if gated.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isLoading) return;
      const gate = await resolveGate();
      if (cancelled) return;
      setLocked(gate);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, resolveGate]);

  // Re-lock after returning from background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        if (!gatedRef.current || !session) return;
        const elapsed = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        if (elapsed > BACKGROUND_LOCK_THRESHOLD_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [session]);

  const unlock = useCallback(async (): Promise<boolean> => {
    const ok = await authenticate();
    if (ok) setLocked(false);
    return ok;
  }, []);

  return { locked, checking, unlock };
}
