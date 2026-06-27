import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { MaterialIcons } from '@expo/vector-icons';
import { useGlobalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { waterService, WaterReading, WaterSource } from '@/services/waterService';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Ionicons } from '@expo/vector-icons';
import { Droplets, IndianRupee, Calendar, ChevronDown, TrendingUp, Activity } from 'lucide-react-native';
import { CustomDatePicker } from '@/components/shared/CustomDatePicker';

export default function WaterAnalyticsScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<'combined' | 'source'>('combined');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState<'7D' | '30D'>('7D');

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useServerQuery(
    queryKeys.property.waterAnalytics(propertyId),
    async () => {
      const res = await waterService.fetchAnalytics(
        propertyId,
        isCustomRange && dateFrom ? dateFrom : undefined,
        isCustomRange && dateTo ? dateTo : undefined
      );
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load analytics'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2 }
  );

  const sources = data?.sources ?? [];
  const rawReadings = data ?? { today: [], month: [], prevMonth: [], trend: [], custom: [] };

  const filterFn = useCallback((r: WaterReading) => {
    if (viewMode === 'combined') return true;
    return r.source_id === selectedSourceId;
  }, [viewMode, selectedSourceId]);

  const calc = useCallback((readings: WaterReading[]) => {
    return readings.filter(filterFn).reduce(
      (acc, r) => ({ cost: acc.cost + (r.computed_cost || 0), quantity: acc.quantity + (r.quantity || 0) }),
      { cost: 0, quantity: 0 }
    );
  }, [filterFn]);

  const avgCalc = useCallback((readings: WaterReading[]) => {
    const uniqueDays = new Set(readings.filter(filterFn).map(r => r.reading_date)).size || 1;
    const totals = calc(readings);
    return { cost: totals.cost / uniqueDays, quantity: totals.quantity / uniqueDays };
  }, [filterFn, calc]);

  const metrics = useMemo(() => {
    const today = calc(rawReadings.today);
    const month = calc(rawReadings.month);
    const prevMonth = calc(rawReadings.prevMonth);
    const custom = calc(rawReadings.custom);
    const monthAvgs = avgCalc(rawReadings.month);
    const customAvgs = isCustomRange ? avgCalc(rawReadings.custom) : monthAvgs;
    return { today, month, prevMonth, custom, averages: isCustomRange ? customAvgs : monthAvgs };
  }, [rawReadings, calc, avgCalc, isCustomRange]);

  const displayCost = isCustomRange ? metrics.custom.cost : metrics.month.cost;
  const displayQty = isCustomRange ? metrics.custom.quantity : metrics.month.quantity;

  const chartData = useMemo(() => {
    const relevantReadings = isCustomRange && dateFrom && dateTo
      ? rawReadings.custom.filter(filterFn)
      : rawReadings.trend.filter(filterFn);

    if (isCustomRange && dateFrom && dateTo) {
      const result: { date: string; cost: number; quantity: number }[] = [];
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      const dayMs = 24 * 60 * 60 * 1000;
      const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(start.getTime() + i * dayMs);
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        const dayTotals = relevantReadings.filter(r => r.reading_date === dateStr).reduce(
          (acc, r) => ({ cost: acc.cost + (r.computed_cost || 0), quantity: acc.quantity + (r.quantity || 0) }),
          { cost: 0, quantity: 0 }
        );
        result.push({ date: label, ...dayTotals });
      }
      return result;
    }

    const days = trendPeriod === '7D' ? 7 : 30;
    const result: { date: string; cost: number; quantity: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      const dayTotals = relevantReadings.filter(r => r.reading_date === dateStr).reduce(
        (acc, r) => ({ cost: acc.cost + (r.computed_cost || 0), quantity: acc.quantity + (r.quantity || 0) }),
        { cost: 0, quantity: 0 }
      );
      result.push({ date: label, ...dayTotals });
    }
    return result;
  }, [rawReadings, filterFn, isCustomRange, dateFrom, dateTo, trendPeriod]);

  const maxChartValue = useMemo(() => {
    return Math.max(...chartData.map(d => d.cost), 1);
  }, [chartData]);

  const fmtCost = (val: number) => `₹${Math.round(val || 0).toLocaleString()}`;
  const fmtQty = (val: number) => `${(val || 0).toFixed(val % 1 === 0 ? 0 : 1)}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Water Analytics</Text>
          <View style={styles.backBtn} />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {/* Scope Toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'combined' && { backgroundColor: '#0EA5E9' }]}
            onPress={() => setViewMode('combined')}
          >
            <Text style={[styles.toggleText, { color: viewMode === 'combined' ? '#fff' : colors.text }]}>Combined</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'source' && { backgroundColor: '#0EA5E9' }]}
            onPress={() => setViewMode('source')}
          >
            <Text style={[styles.toggleText, { color: viewMode === 'source' ? '#fff' : colors.text }]}>By Source</Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'source' && (
          <View style={styles.sourcePickerWrap}>
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
        )}

        {/* Summary Tiles */}
        {isLoading ? (
          <View style={{ flex: 1, padding: 16 }}>
            <SkeletonLoader type="grid" count={4} />
          </View>
        ) : (
          <>
            <View style={styles.tilesRow}>
              <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.tileIcon, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                  <IndianRupee size={18} color="#F59E0B" />
                </View>
                <Text style={[styles.tileValue, { color: colors.text }]}>{fmtCost(displayCost)}</Text>
                <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>
                  {isCustomRange ? 'Custom Range' : 'This Month'}
                </Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.tileIcon, { backgroundColor: 'rgba(14,165,233,0.1)' }]}>
                  <Droplets size={18} color="#0EA5E9" />
                </View>
                <Text style={[styles.tileValue, { color: colors.text }]}>{fmtQty(displayQty)}</Text>
                <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>
                  {isCustomRange ? 'Custom Qty' : 'This Month Qty'}
                </Text>
              </View>
            </View>

            <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 20 }]}>
              <View style={styles.tileHeader}>
                <View style={[styles.tileIcon, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                  <Activity size={18} color="#10B981" />
                </View>
                <View>
                  <Text style={[styles.tileValue, { color: colors.text }]}>{fmtCost(metrics.averages.cost)}</Text>
                  <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>Avg Daily Cost</Text>
                </View>
              </View>
            </View>

            {/* Custom Date Range */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 20 }]}>
              <View style={styles.cardHeader}>
                <Calendar size={18} color={colors.textSecondary} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Custom Range</Text>
                <TouchableOpacity
                  style={[styles.customToggle, { backgroundColor: isCustomRange ? '#0EA5E9' : colors.border }]}
                  onPress={() => setIsCustomRange(!isCustomRange)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{isCustomRange ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
              {isCustomRange && (
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.dateBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setShowFromPicker(true)}
                  >
                    <Text style={[styles.dateBtnText, { color: colors.text }]}>
                      {dateFrom ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'From'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>→</Text>
                  <TouchableOpacity
                    style={[styles.dateBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setShowToPicker(true)}
                  >
                    <Text style={[styles.dateBtnText, { color: colors.text }]}>
                      {dateTo ? new Date(dateTo + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'To'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Trend Chart */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <TrendingUp size={18} color="#0EA5E9" />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Cost Trend</Text>
                <View style={styles.periodToggle}>
                  <TouchableOpacity
                    style={[styles.periodBtn, trendPeriod === '7D' && { backgroundColor: '#0EA5E9' }]}
                    onPress={() => setTrendPeriod('7D')}
                  >
                    <Text style={{ color: trendPeriod === '7D' ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>7D</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.periodBtn, trendPeriod === '30D' && { backgroundColor: '#0EA5E9' }]}
                    onPress={() => setTrendPeriod('30D')}
                  >
                    <Text style={{ color: trendPeriod === '30D' ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>30D</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {chartData.length === 0 ? (
                <Text style={[styles.emptyChart, { color: colors.textTertiary }]}>No data for selected range</Text>
              ) : (
                <View style={styles.chart}>
                  {chartData.map((point, idx) => {
                    const heightPct = (point.cost / maxChartValue) * 100;
                    return (
                      <View key={idx} style={styles.barColumn}>
                        <View style={styles.barWrap}>
                          <View style={[styles.bar, { height: `${Math.max(heightPct, 4)}%`, backgroundColor: '#0EA5E9' }]} />
                        </View>
                        <Text style={[styles.barLabel, { color: colors.textTertiary }]} numberOfLines={1}>{point.date}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <CustomDatePicker
        visible={showFromPicker}
        selectedDate={dateFrom || new Date().toISOString().split('T')[0]}
        onSelect={(date) => { setDateFrom(date); setShowFromPicker(false); }}
        onClose={() => setShowFromPicker(false)}
        colors={colors}
      />
      <CustomDatePicker
        visible={showToPicker}
        selectedDate={dateTo || new Date().toISOString().split('T')[0]}
        onSelect={(date) => { setDateTo(date); setShowToPicker(false); }}
        onClose={() => setShowToPicker(false)}
        colors={colors}
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
  content: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '800',
  },
  sourcePickerWrap: {
    marginBottom: 16,
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
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  tile: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  tileValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  customToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  dateBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  periodToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  emptyChart: {
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
    fontWeight: '600',
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingTop: 10,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barWrap: {
    width: '60%',
    height: '85%',
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: 6,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 6,
    transform: [{ rotate: '-45deg' }],
  },
});
