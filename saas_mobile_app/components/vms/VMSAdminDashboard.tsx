/**
 * VMSAdminDashboard — Property-level VMS admin dashboard.
 * Shows today's stats, checked-in visitors, quick check-out, and kiosk launch.
 * Uses same visitor_logs table via vmsService.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { vmsService, VisitorLog, VisitorStats, DateFilter } from '@/services/vmsService';
import { Users, LogIn, LogOut, Monitor, User, Truck, Building2, ChevronRight, RefreshCw } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

interface VMSAdminDashboardProps {
  propertyId: string;
}

const CATEGORY_CONFIG: Record<string, { bg: string; text: string }> = {
  visitor: { bg: '#3B82F620', text: '#3B82F6' },
  vendor: { bg: '#F59E0B20', text: '#F59E0B' },
  delivery: { bg: '#8B5CF620', text: '#8B5CF6' },
};

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.statBox, { borderColor: 'rgba(255,255,255,0.08)' }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function VisitorRow({
  visitor,
  onCheckOut,
  loadingId,
  colors,
}: {
  visitor: VisitorLog;
  onCheckOut: (id: string) => void;
  loadingId: string | null;
  colors: typeof Colors.light;
}) {
  const cat = CATEGORY_CONFIG[visitor.category] ?? CATEGORY_CONFIG.visitor;
  const isActive = visitor.status === 'checked_in';

  const getDuration = () => {
    const start = new Date(visitor.checkin_time);
    const end = isActive ? new Date() : visitor.checkout_time ? new Date(visitor.checkout_time) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 60000);
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <View style={[styles.visitorRow, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }]}>
      <View style={[styles.visitorAvatar, { backgroundColor: cat.bg }]}>
        {visitor.photo_url ? (
          <Image source={{ uri: visitor.photo_url }} style={styles.visitorAvatarImg} />
        ) : (
          <User size={18} color={cat.text} />
        )}
      </View>
      <View style={styles.visitorInfo}>
        <Text style={[styles.visitorName, { color: colors.text }]} numberOfLines={1}>
          {visitor.name}
        </Text>
        <Text style={[styles.visitorMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {visitor.whom_to_meet} · {getDuration()}
        </Text>
      </View>
      {isActive ? (
        <TouchableOpacity
          style={[styles.checkoutBtn, { backgroundColor: '#EF444420' }]}
          onPress={() => onCheckOut(visitor.id)}
          disabled={loadingId === visitor.id}
        >
          {loadingId === visitor.id ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <LogOut size={14} color="#EF4444" />
          )}
        </TouchableOpacity>
      ) : (
        <View style={[styles.checkedOutBadge, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <Text style={[styles.checkedOutText, { color: colors.textTertiary }]}>Out</Text>
        </View>
      )}
    </View>
  );
}

export default function VMSAdminDashboard({ propertyId }: VMSAdminDashboardProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const router = useRouter();

  const [visitors, setVisitors] = useState<VisitorLog[]>([]);
  const [stats, setStats] = useState<VisitorStats>({ total_today: 0, checked_in: 0, checked_out: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await vmsService.fetchVisitors(propertyId, { dateFilter: 'today' });
      if (res.success && res.data) {
        setVisitors(res.data.visitors);
        setStats(res.data.stats);
      }
    } catch (err: any) {
      console.error('[VMSAdmin] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCheckOut = async (visitorId: string) => {
    setCheckoutLoading(visitorId);
    try {
      const res = await vmsService.checkOut(visitorId, propertyId);
      if (res.success) {
        fetchData();
      }
    } catch (err: any) {
      console.error('[VMSAdmin] checkout error:', err);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const onPremiseVisitors = visitors.filter((v) => v.status === 'checked_in');

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        <StatBox label="Today's Total" value={stats.total_today} color={colors.primary} />
        <StatBox label="On Premise" value={stats.checked_in} color="#22C55E" />
        <StatBox label="Checked Out" value={stats.checked_out} color={colors.textTertiary} />
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/property/${propertyId}/visitors` as any)}
        >
          <Users size={16} color="#fff" />
          <Text style={styles.actionBtnText}>View All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1 }]}
          onPress={() => router.push(`/property/${propertyId}/visitors` as any)}
        >
          <Monitor size={16} color={colors.primary} />
          <Text style={[styles.actionBtnTextSecondary, { color: colors.primary }]}>Kiosk Mode</Text>
        </TouchableOpacity>
      </View>

      {/* On-Premise Visitors */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          On Premise ({onPremiseVisitors.length})
        </Text>
        <TouchableOpacity onPress={handleRefresh}>
          <RefreshCw size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : onPremiseVisitors.length === 0 ? (
        <View style={styles.emptyWrap}>
          <User size={32} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No visitors on premise</Text>
        </View>
      ) : (
        <FlatList
          data={onPremiseVisitors}
          renderItem={({ item }) => (
            <VisitorRow
              visitor={item}
              onCheckOut={handleCheckOut}
              loadingId={checkoutLoading}
              colors={colors}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 12 },
  statBox: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#94A3B8', marginTop: 2 },
  actionsRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionBtnTextSecondary: { fontSize: 13, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  listContent: { paddingHorizontal: 12, paddingBottom: 80 },
  visitorRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 12 },
  visitorAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  visitorAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  visitorInfo: { flex: 1 },
  visitorName: { fontSize: 14, fontWeight: '600' },
  visitorMeta: { fontSize: 12, marginTop: 2 },
  checkoutBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  checkedOutBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  checkedOutText: { fontSize: 10, fontWeight: '700' },
});
