import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Skeleton } from '@/components/shared/Skeleton';
import { useTheme } from '@/context';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TicketDetailSkeleton() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const bg = isDark ? '#0F1521' : '#F5F0E8';
  const cardBg = isDark ? '#343538' : 'rgba(255,255,255,0.88)';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <SafeBlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerTop}>
          <Skeleton width={40} height={40} borderRadius={12} isDark={isDark} />
          <Skeleton width={120} height={24} isDark={isDark} />
          <Skeleton width={40} height={40} borderRadius={12} isDark={isDark} />
        </View>
      </SafeBlurView>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title Area */}
        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Skeleton width="80%" height={24} isDark={isDark} style={{ marginBottom: 12 }} />
          <Skeleton width="40%" height={16} isDark={isDark} style={{ marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Skeleton width={80} height={24} borderRadius={12} isDark={isDark} />
            <Skeleton width={100} height={24} borderRadius={12} isDark={isDark} />
          </View>
        </View>

        {/* Description Area */}
        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Skeleton width={100} height={16} isDark={isDark} style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height={14} isDark={isDark} style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={14} isDark={isDark} style={{ marginBottom: 6 }} />
          <Skeleton width="70%" height={14} isDark={isDark} />
        </View>

        {/* Media Area */}
        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Skeleton width={100} height={16} isDark={isDark} style={{ marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton width={120} height={120} borderRadius={12} isDark={isDark} />
            <Skeleton width={120} height={120} borderRadius={12} isDark={isDark} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
});
