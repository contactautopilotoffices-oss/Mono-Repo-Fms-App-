import React, { useState, useMemo, useCallback } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';
import { cafeteriaService } from '@/services/cafeteriaService';
import { CafeteriaRevenueCard } from '@/components/cafeteria/CafeteriaRevenueCard';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Ionicons } from '@expo/vector-icons';
import { UtensilsCrossed, TrendingUp, Clock } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

export default function CafeteriaRevenueScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, membership } = useAuth();

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const monthOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({
        value,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
    return opts;
  }, []);

  // Resolve user's role for this property
  const userRole = useMemo(() => {
    if (!membership || !propertyId) return '';
    const prop = membership.properties.find((p) => p.id === propertyId);
    return prop?.role?.toLowerCase() || '';
  }, [membership, propertyId]);

  const isVendor = userRole === 'vendor';

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useServerQuery(
    [...queryKeys.property.cafeteria(propertyId), month],
    async () => {
      const res = await cafeteriaService.fetchAll(propertyId, month);
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load cafeteria data'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2, refetchOnMount: 'always' }
  );

  const revenues = data?.revenues ?? [];

  // Vendor role: show only the vendor linked to current user
  const visibleVendors = useMemo(() => {
    const vendors = data?.vendors ?? [];
    if (!isVendor) return vendors;
    return vendors.filter((v) => v.user_id === user?.id);
  }, [data?.vendors, isVendor, user?.id]);

  const mtdRevenue = useMemo(() => {
    const revenues = data?.revenues ?? [];
    return revenues.reduce((sum, r) => sum + (r.revenue_amount || 0), 0);
  }, [data?.revenues]);

  const mtdCommission = useMemo(() => {
    const revenues = data?.revenues ?? [];
    return visibleVendors.reduce((sum, v) => {
      const vendorRevenue = revenues
        .filter((r) => r.vendor_id === v.id)
        .reduce((s, r) => s + (r.revenue_amount || 0), 0);
      return sum + (vendorRevenue * (v.commission_rate || 0)) / 100;
    }, 0);
  }, [data?.revenues, visibleVendors]);

  const handleSaveRevenue = useCallback(async (payload: { vendor_id: string; revenue_date: string; revenue_amount: number }) => {
    const res = await cafeteriaService.submitRevenue({
      property_id: propertyId,
      vendor_id: payload.vendor_id,
      revenue_date: payload.revenue_date,
      revenue_amount: payload.revenue_amount,
    });
    if (!res.success) throw new Error(String(res.error || 'Failed to save'));
    queryClient.invalidateQueries({ queryKey: queryKeys.property.cafeteria(propertyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.property.cafeteriaAnalytics(propertyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.property.cafeteriaHistory(propertyId) });
  }, [propertyId, queryClient]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Cafeteria Revenue</Text>
          <TouchableOpacity
            style={[styles.analyticsBtn, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fffbeb' }]}
            onPress={() => router.push(`/property/${propertyId}/cafeteria/analytics` as never)}
          >
            <TrendingUp size={18} color="#F59E0B" />
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
            MTD: ₹{Math.round(mtdRevenue).toLocaleString()}
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
        {/* Revenue Widget */}
        <View style={[styles.widget, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.widgetIconWrap}>
            <UtensilsCrossed size={28} color="#F59E0B" />
          </View>
          <View style={styles.widgetContent}>
            <Text style={[styles.widgetLabel, { color: colors.textSecondary }]}>Month to Date Revenue</Text>
            <Text style={[styles.widgetValue, { color: colors.text }]}>₹{Math.round(mtdRevenue).toLocaleString()}</Text>
            <Text style={[styles.widgetSub, { color: colors.textTertiary }]}>
              Commission: ₹{Math.round(mtdCommission).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(`/property/${propertyId}/cafeteria/history` as never)}
          >
            <Clock size={16} color="#F59E0B" />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(`/property/${propertyId}/cafeteria/analytics` as never)}
          >
            <TrendingUp size={16} color="#0EA5E9" />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>Analytics</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, padding: 16 }}>
            <SkeletonLoader type="list" count={4} />
          </View>
        ) : !isVendor ? (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <TrendingUp size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Cafeteria Analytics</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Use the Analytics and History buttons above to view cafeteria insights.
            </Text>
          </View>
        ) : visibleVendors.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <UtensilsCrossed size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No shop assigned to you</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Contact your property admin to link your vendor account.
            </Text>
          </View>
        ) : (
          visibleVendors.map((vendor) => (
            <CafeteriaRevenueCard
              key={vendor.id}
              vendor={vendor}
              revenues={revenues}
              onSaveRevenue={handleSaveRevenue}
              colors={colors}
              isDark={theme === 'dark'}
            />
          ))
        )}
      </ScrollView>
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
    backgroundColor: 'rgba(245,158,11,0.1)',
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
  },
});
