/**
 * AMCContracts — AMC (Annual Maintenance Contract) contract management component.
 * Shows all AMC contracts for a property with expiry alerts.
 * Uses same amc_contracts table as web app.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ppmService, AMCContract } from '@/services/ppmService';
import { Building2, Clock, AlertTriangle, FileText, Phone, User, CheckCircle2 } from 'lucide-react-native';

interface AMCContractsProps {
  propertyId: string;
  organizationId?: string;
  onContractPress?: (contract: AMCContract) => void;
  onAddContract?: () => void;
}

function normalizeDate(value?: string | null): string {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return '';
}

function daysUntil(dateStr: string): number {
  const norm = normalizeDate(dateStr);
  if (!norm) return 999;
  const target = new Date(norm + 'T12:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  const norm = normalizeDate(dateStr);
  if (!norm) return '-';
  return new Date(norm + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  expiring_soon: { label: 'Expiring Soon', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  expired: { label: 'Expired', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  renewed: { label: 'Renewed', color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
};

function ContractCard({
  contract,
  onPress,
  colors,
}: {
  contract: AMCContract;
  onPress: () => void;
  colors: typeof Colors.light;
}) {
  const status = STATUS_CONFIG[contract.status] ?? STATUS_CONFIG.active;
  const days = daysUntil(contract.contract_end_date);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: status.bg }]}>
          <Building2 size={18} color={status.color} />
        </View>
        <View style={styles.cardTitleArea}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {contract.system_name}
          </Text>
          <Text style={[styles.cardVendor, { color: colors.textSecondary }]}>
            {contract.vendor_name}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      {/* Expiry alert */}
      {(contract.status === 'expiring_soon' || contract.status === 'expired') && (
        <View style={[styles.expiryAlert, { backgroundColor: status.bg }]}>
          <AlertTriangle size={12} color={status.color} />
          <Text style={[styles.expiryText, { color: status.color }]}>
            {contract.status === 'expired'
              ? `Expired ${Math.abs(days)} days ago`
              : `Expires in ${days} days`}
          </Text>
        </View>
      )}

      {/* Date range */}
      <View style={styles.dateRow}>
        <View style={styles.dateItem}>
          <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>Start</Text>
          <Text style={[styles.dateValue, { color: colors.text }]}>
            {formatDate(contract.contract_start_date)}
          </Text>
        </View>
        <View style={[styles.dateDivider, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
        <View style={styles.dateItem}>
          <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>End</Text>
          <Text
            style={[
              styles.dateValue,
              { color: contract.status === 'expired' ? '#EF4444' : colors.text },
            ]}
          >
            {formatDate(contract.contract_end_date)}
          </Text>
        </View>
        {contract.contract_value != null && (
          <>
            <View style={[styles.dateDivider, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
            <View style={styles.dateItem}>
              <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>Value</Text>
              <Text style={[styles.dateValue, { color: colors.text }]}>
                ₹{(contract.contract_value).toLocaleString()}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Contact info */}
      {contract.vendor_contact && (
        <View style={styles.contactRow}>
          <User size={12} color={colors.textTertiary} />
          <Text style={[styles.contactText, { color: colors.textSecondary }]}>
            {contract.vendor_contact}
          </Text>
        </View>
      )}

      {contract.scope_of_work && (
        <Text
          style={[styles.scopeText, { color: colors.textTertiary }]}
          numberOfLines={2}
        >
          {contract.scope_of_work}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function AMCContracts({
  propertyId,
  organizationId,
  onContractPress,
  onAddContract,
}: AMCContractsProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];

  const [contracts, setContracts] = useState<AMCContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await ppmService.fetchContracts(propertyId, organizationId);
      if (res.success && res.data) {
        setContracts(res.data);
      }
    } catch (err: any) {
      console.error('[AMCContracts] error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId, organizationId]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchContracts();
  };

  const expiring = contracts.filter((c) => c.status === 'expiring_soon' || c.status === 'expired');
  const active = contracts.filter((c) => c.status === 'active');

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryItem, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[styles.summaryNum, { color: colors.primary }]}>{contracts.length}</Text>
          <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Total</Text>
        </View>
        <View style={[styles.summaryItem, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[styles.summaryNum, { color: '#22C55E' }]}>{active.length}</Text>
          <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Active</Text>
        </View>
        <View style={[styles.summaryItem, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[styles.summaryNum, { color: expiring.length > 0 ? '#EF4444' : colors.textTertiary }]}>
            {expiring.length}
          </Text>
          <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Attention</Text>
        </View>
      </View>

      {/* Expiring Banner */}
      {expiring.length > 0 && (
        <View style={[styles.expiringBanner, { backgroundColor: '#F59E0B15' }]}>
          <AlertTriangle size={14} color="#F59E0B" />
          <Text style={styles.expiringBannerText}>
            {expiring.length} contract{expiring.length !== 1 ? 's' : ''} expiring soon
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={contracts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContractCard
            contract={item}
            onPress={() => onContractPress?.(item)}
            colors={colors}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FileText size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No AMC contracts</Text>
            <Text style={[styles.emptySub, { color: colors.textTertiary }]}>
              Add AMC contracts to track maintenance vendors
            </Text>
            {onAddContract && (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={onAddContract}
              >
                <Text style={styles.addBtnText}>Add Contract</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 12 },
  summaryItem: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  summaryNum: { fontSize: 20, fontWeight: '800' },
  summaryLbl: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  expiringBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, padding: 10, borderRadius: 10, marginBottom: 12 },
  expiringBannerText: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },
  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  cardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitleArea: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardVendor: { fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  expiryAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 8 },
  expiryText: { fontSize: 11, fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dateItem: { flex: 1, alignItems: 'center' },
  dateDivider: { width: 1, height: 30 },
  dateLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateValue: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  contactText: { fontSize: 11 },
  scopeText: { fontSize: 11, lineHeight: 16 },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  addBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
