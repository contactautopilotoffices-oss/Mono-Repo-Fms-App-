import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { showOfflineToast, showOnlineToast } from '@/utils/networkToast';

/**
 * Global network connectivity listener that automatically notifies the user
 * with graceful toast messages when network state changes.
 */
export function useNetworkMonitor() {
  const isFirstMount = useRef(true);
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Skip the very first initial check unless the device is truly disconnected
      const isOffline = state.isConnected === false || state.isInternetReachable === false;

      if (isFirstMount.current) {
        isFirstMount.current = false;
        if (isOffline) {
          wasOffline.current = true;
          showOfflineToast();
        }
        return;
      }

      if (isOffline) {
        if (!wasOffline.current) {
          wasOffline.current = true;
          showOfflineToast();
        }
      } else {
        if (wasOffline.current) {
          wasOffline.current = false;
          showOnlineToast();
        }
      }
    });

    return () => unsubscribe();
  }, []);
}
