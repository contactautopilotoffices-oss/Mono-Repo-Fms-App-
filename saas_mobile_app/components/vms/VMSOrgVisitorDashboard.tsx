/**
 * VMSOrgVisitorDashboard — Org-wide visitor view for Super Admins / Org Admins.
 * Shows aggregated visitor logs across all properties in the organization.
 * Uses the same visitor_logs table via server API.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { serverApi } from '@/lib/serverApi';
import { Search, Users, User, Building2, Truck, ChevronRight } from 'lucide-react-native';

interface VisitorLog {
  id: string;
  visitor_id: string;
  property_id: string;
  name: string;
  mobile: string | null;
  category: string;
  coming_from: string | null;
  whom_to_meet: string;
  purpose: string | null;
  photo_url: string | null;
  checkin_time: string;
  checkout_time: string | null;
  status: 'checked_in' | 'checked_out';
}

interface VMSOrgVisitorDashboardProps {
  organizationId: string;
  onVisitorPress?: (visitor: VisitorLog) => void;
}

const CATEGORY_CONFIG: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  visitor: { bg: '#3B82F620', text: '#3B82F6', icon: <User size={10} color="#3B82F6" /> },
  vendor: { bg: '#F59E0B20', text: '#F59E0B', icon: <Truck size={10} color="#F59E0B" /> },
  delivery: { bg: '#8B5CF620', text: '#8B5CF6', icon: <Building2 size={10} color="#8B5CF6" /> },
};

export default function VMSOrgVisitorDashboard({ organizationId, onVisitorPress }: VMSOrgVisitorDashboardProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];

  const [visitors, setVisitors] = useState<VisitorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, checked_in: 0, checked_out: 0 });

  const fetchVisitors = useCallback(async () => {
    try {
      const propRes = await serverApi.query<{ id: string }[]>({
        table: 'properties',
        action: 'select',
        select: 'id',
        filters: [{ op: 'eq', column: 'organization_id', value: organizationId }],
      });

      if (propRes.error || !propRes.data?.length) {
        setVisitors([]);
        return;
      }

      const propertyIds = propRes.data.map((p) => p.id);
      const todayStr = new Date().toISOString().split('T')[0];

      const { data, error } = await serverApi.query<VisitorLog[]>({
        table: 'visitor_logs',
        action: 'select',
        select: '*',
        filters: [
          { op: 'in', column: 'property_id', values: propertyIds },
          { op: 'gte', column: 'checkin_time', value: `${todayStr}T00:00:00.000Z` },
          { op: 'lte', column: 'checkin_time', value: `${todayStr}T23:59:59.999Z` },
        ],
        orders: [{ column: 'checkin_time', ascending: false }],
      });

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as VisitorLog[];
      setStats({
        total: rows.length,
        checked_in: rows.filter((v) => v.status === 'checked_in').length,
        checked_out: rows.filter((v) => v.status === 'checked_out').length,
      });
      setVisitors(rows);
    } catch (err: any) {
      console.error('[VMSOrg] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchVisitors();
  };

  const filtered = search
    ? visitors.filter(
        (v) =>
          v.name.toLowerCase().includes(search.toLowerCase()) ||
          v.whom_to_meet.toLowerCase().includes(search.toLowerCase()) ||
          (v.mobile ?? '').includes(search)
      )
    : visitors;

  const getDuration = (checkin: string, checkout: string | null) => {
    const start = new Date(checkin);
    const end = checkout ? new Date(checkout) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 60000);
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const renderVisitor = ({ item }: { item: VisitorLog }) => {
    const cat = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.visitor;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }]}
        onPress={() => onVisitorPress?.(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          <View style={[styles.avatar, { backgroundColor: cat.bg }]}>
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.avatarImg} />
            ) : (
              <User size={20} color={cat.text} />
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.visitorName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.visitorMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              Meeting {item.whom_to_meet} · {item.mobile || 'no phone'}
            </Text>
            <Text style={[styles.visitorTime, { color: colors.textTertiary }]}>
              {new Date(item.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {item.checkout_time
                ? ` → ${new Date(item.checkout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ` · ${getDuration(item.checkin_time, null)}`}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
              {cat.icon}
              <Text style={[styles.catText, { color: cat.text }]}>{item.category}</Text>
            </View>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: item.status === 'checked_in' ? '#22C55E' : '#64748B' },
              ]}
            />
            <ChevronRight size={14} color={colors.textTertiary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>All Visitors</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          {stats.checked_in} on premise · {stats.total} today
        </Text>
      </View>

      <View style={styles.statsRow}>
        {[
          { label: 'Total', value: stats.total, color: colors.primary },
          { label: 'Checked In', value: stats.checked_in, color: '#22C55E' },
          { label: 'Checked Out', value: stats.checked_out, color: '#64748B' },
        ].map((s) => (
          <View
            key={s.label}
            style={[styles.statBox, { borderColor: 'rgba(255,255,255,0.08)' }]}
          >
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderColor: 'rgba(255,255,255,0.1)',
          },
        ]}
      >
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search visitor, host..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Users size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No visitors today</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderVisitor}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  card: { padding: 12, borderRadius: 14, borderWidth: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  cardInfo: { flex: 1 },
  visitorName: { fontSize: 15, fontWeight: '600' },
  visitorMeta: { fontSize: 11, marginTop: 2 },
  visitorTime: { fontSize: 11, marginTop: 2 },
  cardRight: { alignItems: 'center', gap: 6 },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  catText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
