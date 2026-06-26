import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/shared/Skeleton';
import { useTheme } from '@/context';

export default function TicketListItemSkeleton() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <View style={styles.cardWrapper}>
      <View style={[styles.card, { backgroundColor: isDark ? '#343538' : 'rgba(255,255,255,0.65)' }]}>
        <View style={styles.priorityBar} />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Skeleton width={80} height={12} isDark={isDark} />
            <Skeleton width={60} height={12} isDark={isDark} />
          </View>
          
          <Skeleton width="90%" height={16} isDark={isDark} style={{ marginTop: 4, marginBottom: 2 }} />
          <Skeleton width="60%" height={16} isDark={isDark} />
          
          <View style={styles.badgesRow}>
            <Skeleton width={70} height={20} borderRadius={10} isDark={isDark} />
            <Skeleton width={60} height={20} borderRadius={10} isDark={isDark} />
          </View>
          
          <View style={styles.assigneeRow}>
            <Skeleton width={20} height={20} borderRadius={10} isDark={isDark} />
            <Skeleton width={100} height={12} isDark={isDark} />
          </View>
        </View>
        
        <View style={styles.rightSide}>
          <Skeleton width={16} height={16} isDark={isDark} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  card: {
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  priorityBar: {
    width: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  content: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  rightSide: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 12,
  },
});
