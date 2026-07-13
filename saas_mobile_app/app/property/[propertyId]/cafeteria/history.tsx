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
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';
import { cafeteriaService, CafeteriaRevenue } from '@/services/cafeteriaService';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Trash2, ChevronDown, UtensilsCrossed } from 'lucide-react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';

export default function CafeteriaHistoryScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const { user, membership } = useAuth();

  const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
  const [showVendorPicker, setShowVendorPicker] = useState(false);

  const userRole = useMemo(() => {
    if (!membership || !propertyId) return '';
    const prop = membership.properties.find((p) => p.id === propertyId);
    return prop?.role?.toLowerCase() || '';
  }, [membership, propertyId]);

  const isVendor = userRole === 'vendor';

  const {
    data: vendorsData,
    isLoading: vendorsLoading,
  } = useServerQuery(
    queryKeys.property.cafeteria(propertyId),
    async () => {
      const res = await cafeteriaService.fetchAll(propertyId);
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load cafeteria data'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2, refetchOnMount: 'always' }
  );

  const vendors = useMemo(() => {
    const all = vendorsData?.vendors ?? [];
    if (!isVendor) return all;
    return all.filter((v) => v.user_id === user?.id);
  }, [vendorsData, isVendor, user?.id]);

  const {
    data: revenues,
    isLoading: revenuesLoading,
    isFetching: revenuesFetching,
    refetch: refetchRevenues,
  } = useServerQuery(
    [...queryKeys.property.cafeteriaHistory(propertyId), selectedVendorId],
    async () => {
      const res = await cafeteriaService.fetchRevenues(propertyId, {
        vendorId: selectedVendorId === 'all' ? undefined : selectedVendorId,
      });
      if (!res.success || !res.data) throw new Error(String(res.error || 'Failed to load revenue history'));
      return res.data;
    },
    { staleTime: 1000 * 60 * 2, refetchOnMount: 'always' }
  );

  const filteredRevenues = useMemo(() => {
    return (revenues ?? []).slice().sort((a, b) =>
      (b.revenue_date || '').localeCompare(a.revenue_date || '')
    );
  }, [revenues]);

  const handleDelete = (revenue: CafeteriaRevenue) => {
    Alert.alert(
      'Delete Revenue?',
      `Delete entry for ${revenue.revenue_date}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await cafeteriaService.deleteRevenue(revenue.id);
            if (!res.success) Alert.alert('Error', String(res.error));
            refetchRevenues();
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: CafeteriaRevenue }) => {
    const vendorName = item.vendor?.shop_name || vendors.find(v => v.id === item.vendor_id)?.shop_name || 'Unknown';
    const commissionRate = item.vendor?.commission_rate || vendors.find(v => v.id === item.vendor_id)?.commission_rate || 0;
    const commission = Math.round((item.revenue_amount || 0) * (commissionRate / 100) * 100) / 100;

    return (
      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowDate, { color: colors.text }]}>
            {new Date(item.revenue_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
          <Text style={[styles.rowVendor, { color: colors.textSecondary }]}>{vendorName}</Text>
        </View>
        <View style={styles.rowRight}>
          <View style={styles.rowMeta}>
            <Text style={[styles.rowAmount, { color: colors.text }]}>₹{Math.round(item.revenue_amount || 0).toLocaleString()}</Text>
            <Text style={[styles.rowCommission, { color: '#F59E0B' }]}>Fee: ₹{commission.toLocaleString()}</Text>
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
          <Text style={[styles.headerTitle, { color: colors.text }]}>Cafeteria History</Text>
          <View style={styles.backBtn} />
        </View>
      </View>

      <View style={styles.filterWrap}>
        <TouchableOpacity
          style={[styles.vendorPicker, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowVendorPicker(!showVendorPicker)}
        >
          <Text style={[styles.vendorPickerText, { color: colors.text }]}>
            {selectedVendorId === 'all' ? 'All Vendors' : vendors.find(v => v.id === selectedVendorId)?.shop_name || 'Select Vendor'}
          </Text>
          <ChevronDown size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        {showVendorPicker && (
          <View style={[styles.pickerDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.pickerOption, selectedVendorId === 'all' && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              onPress={() => { setSelectedVendorId('all'); setShowVendorPicker(false); }}
            >
              <Text style={[styles.pickerOptionText, { color: colors.text }]}>All Vendors</Text>
            </TouchableOpacity>
            {vendors.map(v => (
              <TouchableOpacity
                key={v.id}
                style={[styles.pickerOption, selectedVendorId === v.id && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                onPress={() => { setSelectedVendorId(v.id); setShowVendorPicker(false); }}
              >
                <Text style={[styles.pickerOptionText, { color: colors.text }]}>{v.shop_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {vendorsLoading || revenuesLoading ? (
        <View style={{ flex: 1, padding: 16 }}>
          <SkeletonLoader type="list" count={5} />
        </View>
      ) : (
        <FlashList
          data={filteredRevenues}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          estimatedItemSize={80}
          refreshControl={
            <RefreshControl
              refreshing={revenuesFetching && !revenuesLoading}
              onRefresh={() => refetchRevenues()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <UtensilsCrossed size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No revenue entries found.</Text>
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
  vendorPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  vendorPickerText: {
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
  rowVendor: {
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
  rowAmount: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  rowCommission: {
    fontSize: 13,
    fontWeight: '700',
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
    marginTop: 12,
  },
});
