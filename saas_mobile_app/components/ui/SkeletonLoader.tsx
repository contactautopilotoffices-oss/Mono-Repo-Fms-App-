import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Skeleton from './Skeleton';

interface SkeletonLoaderProps {
  type?: 'list' | 'grid' | 'detail' | 'dashboard' | 'notification';
  count?: number;
}

export default function SkeletonLoader({ type = 'list', count = 5 }: SkeletonLoaderProps) {
  const renderItem = (index: number) => {
    switch (type) {
      case 'grid':
        return (
          <View key={index} style={styles.gridItem}>
            <Skeleton height={120} borderRadius={12} />
            <Skeleton height={16} width="80%" style={{ marginTop: 8 }} />
            <Skeleton height={14} width="50%" style={{ marginTop: 4 }} />
          </View>
        );
      case 'dashboard':
        return (
          <View key={index} style={styles.dashboardItem}>
            <View style={styles.dashboardRow}>
              <Skeleton width={40} height={40} borderRadius={20} />
              <View style={styles.listContent}>
                <Skeleton height={16} width="40%" />
                <Skeleton height={24} width="60%" style={{ marginTop: 8 }} />
              </View>
            </View>
            <View style={styles.dashboardRow}>
              <Skeleton width="48%" height={80} borderRadius={12} />
              <Skeleton width="48%" height={80} borderRadius={12} />
            </View>
          </View>
        );
      case 'detail':
        return (
          <View key={index} style={styles.detailContainer}>
            <Skeleton height={200} borderRadius={12} />
            <Skeleton height={24} width="60%" style={{ marginTop: 16 }} />
            <Skeleton height={16} width="40%" style={{ marginTop: 8 }} />
            <Skeleton height={16} width="90%" style={{ marginTop: 24 }} />
            <Skeleton height={16} width="85%" style={{ marginTop: 8 }} />
            <Skeleton height={16} width="90%" style={{ marginTop: 8 }} />
          </View>
        );
      case 'notification':
        return (
          <View key={index} style={styles.notificationItem}>
            <Skeleton width={44} height={44} borderRadius={12} />
            <View style={styles.notificationContent}>
              <View style={styles.notificationHeader}>
                <Skeleton height={16} width="60%" />
                <Skeleton width={8} height={8} borderRadius={4} style={{ marginLeft: 8 }} />
              </View>
              <Skeleton height={14} width="90%" style={{ marginTop: 6 }} />
              <Skeleton height={14} width="70%" style={{ marginTop: 4 }} />
              <Skeleton height={12} width="20%" style={{ marginTop: 8 }} />
            </View>
          </View>
        );
      case 'list':
      default:
        return (
          <View key={index} style={styles.listItem}>
            <Skeleton width={50} height={50} borderRadius={8} />
            <View style={styles.listContent}>
              <Skeleton height={16} width="70%" />
              <Skeleton height={14} width="40%" style={{ marginTop: 8 }} />
            </View>
          </View>
        );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={type === 'grid' ? styles.gridContainer : styles.listContainer} showsVerticalScrollIndicator={false}>
      {Array.from({ length: count }).map((_, index) => renderItem(index))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
    gap: 16,
  },
  gridContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
  },
  listContent: {
    flex: 1,
    marginLeft: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
  },
  notificationContent: {
    flex: 1,
    marginLeft: 12,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridItem: {
    width: '47%',
    marginBottom: 16,
  },
  detailContainer: {
    padding: 16,
  },
  dashboardItem: {
    padding: 16,
    gap: 16,
  },
  dashboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
