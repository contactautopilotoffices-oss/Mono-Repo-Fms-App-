// @ts-nocheck
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useGlobalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { waterService, WaterReading, computeReadingCost } from '@/services/waterService';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Trash2, ChevronDown } from 'lucide-react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';

export default function WaterHistoryScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useServerQuery(
    queryKeys.property.water(propertyId),
    async () => {
      const res = await waterService.fetchAll(propertyId);
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load water data'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2, refetchOnMount: 'always' }
  );

  const sources = data?.sources ?? [];

  const {
    data: readings,
    isLoading: readingsLoading,
    isFetching: readingsFetching,
    refetch: refetchReadings,
  } = useServerQuery(
    [...queryKeys.property.water(propertyId), 'history', selectedSourceId],
    async () => {
      const res = await waterService.fetchReadings(propertyId, {
        sourceId: selectedSourceId === 'all' ? undefined : selectedSourceId,
      });
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load readings'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2, refetchOnMount: 'always' }
  );

  const filteredReadings = useMemo(() => {
    return (readings ?? []).slice().sort((a, b) =>
      (b.reading_date || '').localeCompare(a.reading_date || '')
    );
  }, [readings]);

  const handleDelete = (reading: WaterReading) => {
    Alert.alert(
      'Delete Reading?',
      `Delete entry for ${reading.reading_date}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await waterService.deleteReading(reading.id);
            if (!res.success) Alert.alert('Error', String(res.error));
            refetchReadings();
            refetch();
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: WaterReading }) => {
    const sourceName = item.source?.name || sources.find(s => s.id === item.source_id)?.name || 'Unknown';
    // Recompute display cost so existing readings with computed_cost=0 still show a value when a tariff exists.
    const displayCost = computeReadingCost(item, sources.flatMap(s => s.water_tariffs ?? []));
    return (
      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowDate, { color: colors.text }]}>
            {new Date(item.reading_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
          <Text style={[styles.rowSource, { color: colors.textSecondary }]}>
            {sourceName}
            {(item as any).user?.full_name ? ` · ${(item as any).user.full_name}` : ''}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <View style={styles.rowMeta}>
            <Text style={[styles.rowQty, { color: colors.text }]}>{item.quantity} units</Text>
            <Text style={[styles.rowCost, { color: '#10B981' }]}>₹{Math.round(displayCost).toLocaleString()}</Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
            <Trash2 size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Water History</Text>
          <View style={styles.backBtn} />
        </View>
      </View>

      <View style={styles.filterWrap}>
        <TouchableOpacity
          style={[styles.sourcePicker, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowSourcePicker(!showSourcePicker)}
        >
          <Text style={[styles.sourcePickerText, { color: colors.text }]}>
            {selectedSourceId === 'all' ? 'All Sources' : sources.find(s => s.id === selectedSourceId)?.name || 'Select Source'}
          </Text>
          <ChevronDown size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        {showSourcePicker && (
          <View style={[styles.pickerDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.pickerOption, selectedSourceId === 'all' && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              onPress={() => { setSelectedSourceId('all'); setShowSourcePicker(false); }}
            >
              <Text style={[styles.pickerOptionText, { color: colors.text }]}>All Sources</Text>
            </TouchableOpacity>
            {sources.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.pickerOption, selectedSourceId === s.id && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                onPress={() => { setSelectedSourceId(s.id); setShowSourcePicker(false); }}
              >
                <Text style={[styles.pickerOptionText, { color: colors.text }]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {isLoading || readingsLoading ? (
        <View style={{ flex: 1, padding: 16 }}>
          <SkeletonLoader type="list" count={5} />
        </View>
      ) : (
        <FlashList
          data={filteredReadings}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          estimatedItemSize={80}
          refreshControl={
            <RefreshControl
              refreshing={(readingsFetching && !readingsLoading) || (isFetching && !isLoading)}
              onRefresh={() => { refetch(); refetchReadings(); }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No readings found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  filterWrap: {
    padding: 16,
    zIndex: 10,
  },
  sourcePicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  sourcePickerText: {
    fontSize: 15,
    fontWeight: '700',
  },
  pickerDropdown: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    overflow: 'hidden',
  },
  pickerOption: {
    padding: 12,
    paddingHorizontal: 16,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  rowLeft: {
    flex: 1,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  rowSource: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowMeta: {
    alignItems: 'flex-end',
  },
  rowQty: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  rowCost: {
    fontSize: 15,
    fontWeight: '800',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
