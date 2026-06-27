/**
 * Persistence Gate
 *
 * PURPOSE:
 * - Block children rendering until React Query cache is restored from MMKV
 * - Prevents: Splash → Loading → Empty UI → Data → Full UI
 * - Ensures: Splash → Full UI (smooth, instant)
 *
 * Flow:
 * 1. App starts, splash visible
 * 2. Wait for React Query cache to restore from MMKV
 * 3. Splash hides via onReady callback
 * 4. Children render with data already available
 */
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, mmkvPersister } from '@/utils/queryClient';

interface PersistGateProps {
  children: React.ReactNode;
  onReady?: () => void; // Called when cache is restored
}

export function PersistGate({ children, onReady }: PersistGateProps) {
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    if (isRestored) {
      console.log('[PersistGate] Cache restored - calling onReady');
      onReady?.();
    }
  }, [isRestored, onReady]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: mmkvPersister,
        dehydrateOptions: {
          shouldDehydrateQuery: (query: any) => {
            return query.state.status === 'success';
          },
        },
      }}
    >
      {/* Wait for cache restoration before rendering children */}
      {isRestored ? (
        children
      ) : (
        <CacheRestorationWaiter onRestored={() => setIsRestored(true)} />
      )}
    </PersistQueryClientProvider>
  );
}

import SkeletonLoader from '@/components/dashboard/lovable/SkeletonLoader';

// Component that waits for cache to be restored
function CacheRestorationWaiter({ onRestored }: { onRestored: () => void }) {
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let mounted = true;
    let timeout: NodeJS.Timeout;

    const checkCache = () => {
      // Check if query client has any cached data
      const queries = queryClient.getQueryCache().getAll();
      const hasCachedData = queries.some(
        (q) => q.state.status === 'success' && q.state.data !== undefined
      );

      if (hasCachedData && mounted) {
        console.log('[CacheRestorationWaiter] Found cached data');
        onRestored();
        return;
      }

      // Retry after delay
      setAttempts((a) => a + 1);
      if (attempts < 50 && mounted) {
        // 50 attempts * 100ms = 5 seconds max wait
        timeout = setTimeout(checkCache, 100);
      } else if (mounted) {
        // Timeout - proceed anyway
        console.log('[CacheRestorationWaiter] Timeout - proceeding without cache');
        onRestored();
      }
    };

    // Start checking after a brief delay (let persistence initialize)
    timeout = setTimeout(checkCache, 500);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [attempts, onRestored]);

  // Render null so the Native Splash Screen stays visible until the app is fully ready.
  return null;
}

// ────────────────────────────────────────────────────────────────
// Loading Screen (if needed)
// ────────────────────────────────────────────────────────────────

export function PersistLoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#708F96" />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
  },
});

export default PersistGate;