import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { offlineMediaQueue } from '@/utils/offlineMediaQueue';

export function useOfflineMediaSync() {
  useEffect(() => {
    // Attempt to process queue immediately on mount
    offlineMediaQueue.processQueue().catch(console.error);

    // Listen for network state changes
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        offlineMediaQueue.processQueue().catch(console.error);
      }
    });

    // Poll every 30 seconds just in case
    const interval = setInterval(() => {
      offlineMediaQueue.processQueue().catch(console.error);
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);
}
