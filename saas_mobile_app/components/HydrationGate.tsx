/**
 * Global Hydration Gate
 *
 * PURPOSE:
 * - Keeps splash visible until first data is ready
 * - Prevents: Splash → Loading → Empty UI → Data → Full UI
 * - Ensures: Splash → Full UI (smooth, instant)
 *
 * LOGIC:
 * 1. Splash stays visible
 * 2. Wait for React Query cache to be restored from MMKV OR first fetch completes
 * 3. When data is ready, call onReady() which hides splash
 * 4. Children render with data already available
 */
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useQueryClient, Query, QueryState } from '@tanstack/react-query';

interface HydrationContextValue {
  isReady: boolean;
  hasCache: boolean;
}

const HydrationContext = createContext<HydrationContextValue>({
  isReady: false,
  hasCache: false,
});

export function useHydration(): HydrationContextValue {
  return useContext(HydrationContext);
}

// ────────────────────────────────────────────────────────────────
// Hydration Gate
// ────────────────────────────────────────────────────────────────

interface HydrationGateProps {
  children: React.ReactNode;
  onReady?: () => void; // Call this when hydration is complete
}

export function HydrationGate({ children, onReady }: HydrationGateProps) {
  const queryClient = useQueryClient();
  const [isReady, setIsReady] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const onReadyCalledRef = useRef(false);

  const callOnReady = () => {
    if (onReadyCalledRef.current) return;
    onReadyCalledRef.current = true;
    console.log('[HydrationGate] Calling onReady - data is ready');
    onReady?.();
  };

  useEffect(() => {
    let mounted = true;

    const checkAndResolve = () => {
      if (!mounted) return;

      // Check if React Query has any cached data (from MMKV persistence)
      const queries = queryClient.getQueryCache().getAll();

      // If we have queries with data, we're ready
      const hasData = queries.some((q: Query) => {
        const data = q.state.data;
        return data !== undefined && data !== null && data !== '';
      });

      // Also check if data is currently being fetched
      const isFetching = queries.some((q: Query) => q.state.fetchStatus === 'fetching');

      if (hasData && !isFetching) {
        setHasCache(true);
        setIsReady(true);
        callOnReady();
        return true;
      }

      return false;
    };

    // Initial check
    if (checkAndResolve()) {
      return;
    }

    // Subscribe to query cache changes
    const unsubscribe = queryClient.getQueryCache().subscribe((listener) => {
      // Debounce checks
      setTimeout(() => {
        checkAndResolve();
      }, 100);
    });

    // Fallback: If no cache after 5 seconds, force ready (may need to fetch)
    const timeout = setTimeout(() => {
      console.log('[HydrationGate] Timeout - forcing ready state');
      setIsReady(true);
      callOnReady();
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [queryClient]);

  const contextValue = { isReady, hasCache };

  return (
    <HydrationContext.Provider value={contextValue}>
      {children}
    </HydrationContext.Provider>
  );
}

// ────────────────────────────────────────────────────────────────
// Loading Screen (for during hydration)
// ────────────────────────────────────────────────────────────────

export function HydrationLoader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color="#708F96" />
      <Text style={styles.loaderText}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loaderText: {
    marginTop: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
  },
});

export default HydrationGate;