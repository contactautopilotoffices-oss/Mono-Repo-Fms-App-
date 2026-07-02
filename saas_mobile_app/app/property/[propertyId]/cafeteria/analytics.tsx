import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useGlobalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { cafeteriaService } from '@/services/cafeteriaService';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Ionicons } from '@expo/vector-icons';
import { IndianRupee, TrendingUp, Calendar, Store } from 'lucide-react-native';
import { CustomDatePicker } from '@/components/shared/CustomDatePicker';

export default function CafeteriaAnalyticsScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState<'7D' | '30D'>('7D');

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useServerQuery(
    queryKeys.property.cafeteriaAnalytics(propertyId),
    async () => {
      const res = await cafeteriaService.fetchAnalytics(
        propertyId,
        isCustomRange && dateFrom ? dateFrom : undefined,
        isCustomRange && dateTo ? dateTo : undefined
      );
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load analytics'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2, refetchOnMount: 'always' }
  );

  const totalRevenue = data?.total_revenue ?? 0;
  const totalCommission = data?.total_commission ?? 0;
  const activeVendors = data?.active_vendors ?? 0;
  const vendorBreakdown = data?.vendor_breakdown ?? [];

  const chartData = useMemo(() => {
    if (isCustomRange && dateFrom && dateTo) {
      const result: { date: string; revenue: number; commission: number }[] = [];
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      const dayMs = 24 * 60 * 60 * 1000;
      const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(start.getTime() + i * dayMs);
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        const dayData = (data?.trend ?? []).find(t => t.date === dateStr);
        result.push({ date: label, revenue: dayData?.revenue || 0, commission: dayData?.commission || 0 });
      }
      return result;
    }

    const days = trendPeriod === '7D' ? 7 : 30;
    const result: { date: string; revenue: number; commission: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      const dayData = (data?.trend ?? []).find(t => t.date === dateStr);
      result.push({ date: label, revenue: dayData?.revenue || 0, commission: dayData?.commission || 0 });
    }
    return result;
  }, [data?.trend, isCustomRange, dateFrom, dateTo, trendPeriod]);

  const maxChartValue = useMemo(() => {
    return Math.max(...chartData.map(d => d.revenue), 1);
  }, [chartData]);

  const fmtCost = (val: number) => `₹${Math.round(val || 0).toLocaleString()}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Cafeteria Analytics</Text>
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
        {isLoading ? (
          <View style={{ flex: 1, padding: 16 }}>
            <SkeletonLoader type="grid" count={4} />
          </View>
        ) : (
          <>
            {/* Summary Tiles */}
            <View style={styles.tilesRow}>
              <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.tileIcon, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                  <IndianRupee size={18} color="#F59E0B" />
                </View>
                <Text style={[styles.tileValue, { color: colors.text }]}>{fmtCost(totalRevenue)}</Text>
                <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>
                  {isCustomRange ? 'Custom Revenue' : 'This Month'}
                </Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.tileIcon, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                  <TrendingUp size={18} color="#10B981" />
                </View>
                <Text style={[styles.tileValue, { color: colors.text }]}>{fmtCost(totalCommission)}</Text>
                <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>
                  {isCustomRange ? 'Custom Commission' : 'This Month Fee'}
                </Text>
              </View>
            </View>

            <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 20 }]}>
              <View style={styles.tileHeader}>
                <View style={[styles.tileIcon, { backgroundColor: 'rgba(14,165,233,0.1)' }]}>
                  <Store size={18} color="#0EA5E9" />
                </View>
                <View>
                  <Text style={[styles.tileValue, { color: colors.text }]}>{activeVendors}</Text>
                  <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>Active Vendors</Text>
                </View>
              </View>
            </View>

            {/* Custom Date Range */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 20 }]}>
              <View style={styles.cardHeader}>
                <Calendar size={18} color={colors.textSecondary} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Custom Range</Text>
                <TouchableOpacity
                  style={[styles.customToggle, { backgroundColor: isCustomRange ? '#F59E0B' : colors.border }]}
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
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 20 }]}>
              <View style={styles.cardHeader}>
                <TrendingUp size={18} color="#F59E0B" />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Revenue Trend</Text>
                {!isCustomRange && (
                  <View style={styles.periodToggle}>
                    <TouchableOpacity
                      style={[styles.periodBtn, trendPeriod === '7D' && { backgroundColor: '#F59E0B' }]}
                      onPress={() => setTrendPeriod('7D')}
                    >
                      <Text style={{ color: trendPeriod === '7D' ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>7D</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.periodBtn, trendPeriod === '30D' && { backgroundColor: '#F59E0B' }]}
                      onPress={() => setTrendPeriod('30D')}
                    >
                      <Text style={{ color: trendPeriod === '30D' ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>30D</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.chartContainer}>
                {chartData.map((item, index) => {
                  const heightPercent = Math.max((item.revenue / maxChartValue) * 100, 4);
                  return (
                    <View key={index} style={styles.chartColumn}>
                      <View style={[styles.bar, { height: `${heightPercent}%`, backgroundColor: '#F59E0B' }]} />
                      <Text style={[styles.chartLabel, { color: colors.textTertiary }]} numberOfLines={1}>{item.date}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Vendor Breakdown */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Store size={18} color="#F59E0B" />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Vendor Breakdown</Text>
              </View>
              {vendorBreakdown.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No vendor data available.</Text>
              ) : (
                vendorBreakdown.map((vendor) => (
                  <View key={vendor.vendor_id} style={[styles.breakdownRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.breakdownName, { color: colors.text }]} numberOfLines={1}>{vendor.vendor_name}</Text>
                      <Text style={[styles.breakdownMeta, { color: colors.textSecondary }]}>
                        {vendor.entry_count} entries · {vendor.commission_rate}% fee
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>{fmtCost(vendor.total_revenue)}</Text>
                      <Text style={[styles.breakdownCommission, { color: '#F59E0B' }]}>{fmtCost(vendor.total_commission)} fee</Text>
                    </View>
                  </View>
                ))
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
  tilesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  tile: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
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
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
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
    fontSize: 14,
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
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingTop: 20,
    gap: 4,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  bar: {
    width: '80%',
    borderRadius: 4,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 6,
    transform: [{ rotate: '-45deg' }],
    width: 40,
    textAlign: 'right',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  breakdownName: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  breakdownMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  breakdownCommission: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
