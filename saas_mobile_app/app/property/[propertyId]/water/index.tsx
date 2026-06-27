import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  RefreshControl,
  Alert,
} from 'react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useGlobalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { waterService, WaterSource, WaterTariff } from '@/services/waterService';
import { WaterLoggerCard } from '@/components/water/WaterLoggerCard';
import { WaterSourceModal } from '@/components/water/WaterSourceModal';
import { WaterTariffModal } from '@/components/water/WaterTariffModal';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Ionicons } from '@expo/vector-icons';
import { Droplets, TrendingUp, Plus, Coins, Clock } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

export default function WaterLoggerScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [editingSource, setEditingSource] = useState<WaterSource | null>(null);
  const [showTariffModal, setShowTariffModal] = useState(false);

  const monthOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = d.toISOString().slice(0, 7);
      opts.push({
        value,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
    return opts;
  }, []);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useServerQuery(
    [...queryKeys.property.water(propertyId), month],
    async () => {
      const res = await waterService.fetchAll(propertyId, month);
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load water data'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2 }
  );

  // Extract tariffs from sources (embedded) + flatten
  const sources = data?.sources ?? [];
  const readings = data?.readings ?? [];
  const tariffs = useMemo<WaterTariff[]>(() => {
    const list: WaterTariff[] = [];
    sources.forEach((s: WaterSource) => {
      if (s.water_tariffs) list.push(...s.water_tariffs);
    });
    return list;
  }, [sources]);

  const mtdExpense = useMemo(() => {
    return readings.reduce((sum, r) => sum + (r.computed_cost || 0), 0);
  }, [readings]);

  const mtdQuantity = useMemo(() => {
    return readings.reduce((sum, r) => sum + (r.quantity || 0), 0);
  }, [readings]);

  const handleSaveReading = useCallback(async (payload: { source_id: string; reading_date: string; quantity: number }) => {
    const res = await waterService.submitReading({
      property_id: propertyId,
      source_id: payload.source_id,
      reading_date: payload.reading_date,
      quantity: payload.quantity,
    });
    if (!res.success) throw new Error(String(res.error || 'Failed to save'));
    queryClient.invalidateQueries({ queryKey: queryKeys.property.water(propertyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.property.waterAnalytics(propertyId) });
  }, [propertyId, queryClient]);

  const handleSaveSource = async (payload: Partial<WaterSource>) => {
    if (editingSource) {
      const res = await waterService.updateSource(editingSource.id, payload);
      if (!res.success) throw new Error(String(res.error));
    } else {
      const res = await waterService.createSource({ ...payload, property_id: propertyId });
      if (!res.success) throw new Error(String(res.error));
    }
    setEditingSource(null);
    setShowSourceModal(false);
    refetch();
  };

  const handleDeleteSource = (sourceId: string) => {
    Alert.alert(
      'Delete Source?',
      'This will deactivate the water source. Existing readings will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await waterService.deleteSource(sourceId);
            if (!res.success) Alert.alert('Error', String(res.error));
            refetch();
          }
        }
      ]
    );
  };

  const handleSaveTariff = async (payload: { source_id: string; rate_per_unit: number; effective_from: string; property_id: string }) => {
    const res = await waterService.createTariff(payload);
    if (!res.success) throw new Error(String(res.error));
    setShowTariffModal(false);
    refetch();
  };

  const openAddSource = () => {
    setEditingSource(null);
    setShowSourceModal(true);
  };

  const openEditSource = (source: WaterSource) => {
    setEditingSource(source);
    setShowSourceModal(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Water Logger</Text>
          <TouchableOpacity
            style={[styles.analyticsBtn, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}
            onPress={() => router.push(`/property/${propertyId}/water/analytics` as any)}
          >
            <TrendingUp size={18} color="#0EA5E9" />
          </TouchableOpacity>
        </View>

        <View style={styles.headerMeta}>
          <TouchableOpacity
            style={[styles.monthPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowMonthPicker(!showMonthPicker)}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.monthText, { color: colors.text }]}>
              {monthOptions.find(m => m.value === month)?.label || month}
            </Text>
            <Ionicons name={showMonthPicker ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          {showMonthPicker && (
            <View style={[styles.monthDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {monthOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.monthOption, opt.value === month && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                  onPress={() => { setMonth(opt.value); setShowMonthPicker(false); }}
                >
                  <Text style={[styles.monthOptionText, { color: colors.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={[styles.mtdLabel, { color: colors.textSecondary }]}>
            MTD: ₹{mtdExpense.toLocaleString()}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {/* Expense Widget */}
        <View style={[styles.widget, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.widgetIconWrap}>
            <Droplets size={28} color="#0EA5E9" />
          </View>
          <View style={styles.widgetContent}>
            <Text style={[styles.widgetLabel, { color: colors.textSecondary }]}>Month to Date Expense</Text>
            <Text style={[styles.widgetValue, { color: colors.text }]}>₹{mtdExpense.toLocaleString()}</Text>
            <Text style={[styles.widgetSub, { color: colors.textTertiary }]}>
              {mtdQuantity.toLocaleString()} units logged
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={openAddSource}
          >
            <Plus size={16} color="#0EA5E9" />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>Source</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowTariffModal(true)}
          >
            <Coins size={16} color="#10B981" />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>Costs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(`/property/${propertyId}/water/history` as any)}
          >
            <Clock size={16} color="#F59E0B" />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Loading / Empty */}
        {isLoading ? (
          <View style={{ flex: 1, padding: 16 }}>
            <SkeletonLoader type="list" count={4} />
          </View>
        ) : sources.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <Droplets size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No water sources configured</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Add a source to start logging daily water entries.
            </Text>
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: '#0EA5E9' }]} onPress={openAddSource}>
              <Text style={styles.emptyBtnText}>Add Water Source</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sources.map((source) => (
            <WaterLoggerCard
              key={source.id}
              source={source}
              readings={readings}
              tariffs={tariffs}
              onSaveReading={handleSaveReading}
              onDelete={handleDeleteSource}
              onEdit={openEditSource}
              colors={colors}
              isDark={theme === 'dark'}
            />
          ))
        )}
      </ScrollView>

      <WaterSourceModal
        visible={showSourceModal}
        onClose={() => { setShowSourceModal(false); setEditingSource(null); }}
        propertyId={propertyId}
        source={editingSource}
        onSave={handleSaveSource}
        colors={colors}
        isDark={theme === 'dark'}
      />

      <WaterTariffModal
        visible={showTariffModal}
        onClose={() => setShowTariffModal(false)}
        propertyId={propertyId}
        sources={sources}
        onSave={handleSaveTariff}
        colors={colors}
        isDark={theme === 'dark'}
      />
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
    marginBottom: 12,
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
    flex: 1,
    textAlign: 'center',
  },
  analyticsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 50,
  },
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  monthText: {
    fontSize: 14,
    fontWeight: '700',
  },
  monthDropdown: {
    position: 'absolute',
    top: 44,
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    zIndex: 100,
    overflow: 'hidden',
  },
  monthOption: {
    padding: 12,
    paddingHorizontal: 16,
  },
  monthOptionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  mtdLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  widget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  widgetIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(14,165,233,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  widgetContent: {
    flex: 1,
  },
  widgetLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  widgetValue: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 2,
  },
  widgetSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  loader: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
