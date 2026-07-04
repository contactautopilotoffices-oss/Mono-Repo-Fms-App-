import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Skeleton } from '@/components/shared/Skeleton';
import { useTheme } from '@/context';

export default function ChecklistSkeleton({ count = 6 }: { count?: number }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.itemCard, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }]}>
          <View style={styles.itemRow}>
            <Skeleton width={36} height={36} borderRadius={18} isDark={isDark} />
            <View style={styles.itemContent}>
              <Skeleton height={16} width="85%" isDark={isDark} />
              <Skeleton height={12} width="40%" isDark={isDark} style={{ marginTop: 8 }} />
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  itemContent: { 
    flex: 1, 
    paddingTop: 4 
  },
});
