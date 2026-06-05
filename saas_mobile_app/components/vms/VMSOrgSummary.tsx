/**
 * VMSOrgSummary — Org-wide VMS summary card for Super Admin / Org Admin dashboards.
 * Shows aggregated stats across all properties.
 * Uses same visitor_logs table via server API.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { serverApi } from '@/lib/serverApi';
import { Users, LogIn, LogOut, Building2 } from 'lucide-react-native';

interface VMSOrgSummaryProps {
  organizationId: string;
  onPress?: () => void;
}

interface Stats {
  total_today: number;
  checked_in: number;
  checked_out: number;
  total_properties: number;
}

export default function VMSOrgSummary({ organizationId, onPress }: VMSOrgSummaryProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const [stats, setStats] = useState<Stats>({
    total_today: 0,
    checked_in: 0,
    checked_out: 0,
    total_properties: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Get all properties for org
        const propRes = await serverApi.query<{ id: string }[]>({
          table: 'properties',
          action: 'select',
          select: 'id',
          filters: [{ op: 'eq', column: 'organization_id', value: organizationId }],
        });

        if (propRes.error || !propRes.data?.length) return;

        const propertyIds = propRes.data.map((p) => p.id);
        const todayStr = new Date().toISOString().split('T')[0];

        const { data, error } = await serverApi.query<{ status: string }[]>({
          table: 'visitor_logs',
          action: 'select',
          select: 'status',
          filters: [
            { op: 'in', column: 'property_id', values: propertyIds },
            { op: 'gte', column: 'checkin_time', value: `${todayStr}T00:00:00.000Z` },
            { op: 'lte', column: 'checkin_time', value: `${todayStr}T23:59:59.999Z` },
          ],
        });

        if (error) throw new Error(error.message);

        const rows = data ?? [];
        setStats({
          total_today: rows.length,
          checked_in: rows.filter((r) => r.status === 'checked_in').length,
          checked_out: rows.filter((r) => r.status === 'checked_out').length,
          total_properties: propertyIds.length,
        });
      } catch (err: any) {
        console.error('[VMSOrgSummary] error:', err);
      }
    };

    fetchStats();
  }, [organizationId]);

  return (
    <TouchableOpacity
      style={[styles.container, { borderColor: 'rgba(255,255,255,0.1)' }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20' }]}>
          <Building2 size={18} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Visitor Management</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Users size={16} color={colors.primary} />
          <Text style={[styles.statNum, { color: colors.primary }]}>{stats.total_today}</Text>
          <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Today</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
        <View style={styles.statItem}>
          <LogIn size={16} color="#22C55E" />
          <Text style={[styles.statNum, { color: '#22C55E' }]}>{stats.checked_in}</Text>
          <Text style={[styles.statLbl, { color: colors.textSecondary }]}>On Premise</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
        <View style={styles.statItem}>
          <LogOut size={16} color={colors.textTertiary} />
          <Text style={[styles.statNum, { color: colors.textTertiary }]}>{stats.checked_out}</Text>
          <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Checked Out</Text>
        </View>
      </View>

      <Text style={[styles.footer, { color: colors.primary }]}>
        View All Visitors →
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLbl: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  divider: { width: 1, height: 40 },
  footer: { fontSize: 13, fontWeight: '600', marginTop: 14, textAlign: 'center' },
});
