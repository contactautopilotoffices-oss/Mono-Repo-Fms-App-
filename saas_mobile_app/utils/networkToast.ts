import Toast from 'react-native-toast-message';

let lastToastTime = 0;
const TOAST_THROTTLE_MS = 4000;

/**
 * Shows a throttled toast when network is unavailable or fails,
 * preventing multiple overlapping toasts.
 */
export function showNetworkErrorToast(detail?: string) {
  const now = Date.now();
  if (now - lastToastTime < TOAST_THROTTLE_MS) return;
  lastToastTime = now;

  Toast.show({
    type: 'error',
    text1: 'Network Connection Issue',
    text2: detail || 'Network is slow or unavailable. Please check your connection.',
    position: 'top',
    visibilityTime: 4000,
    topOffset: 50,
  });
}

/**
 * Shows a toast when connection is slow or taking too long.
 */
export function showSlowNetworkToast() {
  const now = Date.now();
  if (now - lastToastTime < TOAST_THROTTLE_MS) return;
  lastToastTime = now;

  Toast.show({
    type: 'info',
    text1: 'Slow Network Detected',
    text2: 'Data is taking longer than usual to load...',
    position: 'top',
    visibilityTime: 3500,
    topOffset: 50,
  });
}

/**
 * Shows a toast when device goes offline.
 */
export function showOfflineToast() {
  const now = Date.now();
  if (now - lastToastTime < TOAST_THROTTLE_MS) return;
  lastToastTime = now;

  Toast.show({
    type: 'info',
    text1: 'You are Offline',
    text2: 'Cached data is available. Actions will sync once reconnected.',
    position: 'top',
    visibilityTime: 4000,
    topOffset: 50,
  });
}

/**
 * Shows a toast when device comes back online.
 */
export function showOnlineToast() {
  Toast.show({
    type: 'success',
    text1: 'Back Online',
    text2: 'Connection restored successfully.',
    position: 'top',
    visibilityTime: 3000,
    topOffset: 50,
  });
}
