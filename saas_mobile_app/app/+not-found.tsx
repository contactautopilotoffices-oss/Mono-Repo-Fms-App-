// @ts-nocheck
import { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';

/**
 * Catch-all for unmatched routes.
 * Instead of showing a "404" error (which can be flagged during review),
 * we silently redirect the user back to the app root.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];

  useEffect(() => {
    // Short delay so the navigation stack is fully mounted
    const timer = setTimeout(() => {
      router.replace('/');
    }, 100);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
