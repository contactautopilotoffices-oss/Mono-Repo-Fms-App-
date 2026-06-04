/**
 * PPMCompliance — Compliance metrics for PPM tasks.
 * Shows compliance rate, overdue stats, and trend indicators.
 * Mirrors web app compliance reporting using same ppm_schedules data.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ppmService, PPMStats } from '@/services/ppmService';
import { CheckCircle2, AlertTriangle, TrendingUp, Clock } from 'lucide-react-native';

interface PPMComplianceProps {
  propertyId: string;
  organizationId?: string;
  onViewReport?: () => void;
}

export default function PPMCompliance({
  propertyId,
  organizationId,
  onViewReport,
}: PPMComplianceProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const [stats, setStats] = useState<PPMStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await ppmService.fetchStats(propertyId, organizationId);
        if (res.success && res.data) {
          setStats(res.data);
        }
      } catch (err: any) {
        console.error('[PPMCompliance] error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [propertyId, organizationId]);

  if (loading) {
    return (
      <View style={[styles.container, { borderColor: 'rgba(255,255,255,0.08)' }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!stats) return null;

  const complianceRate = stats.total > 0
    ? Math.round((stats.done / stats.total) * 100)
    : 100;

  const overdueRate = stats.total > 0
    ? Math.round((stats.overdue / stats.total) * 100)
    : 0;

  const getRateColor = (rate: number) => {
    if (rate >= 80) return '#22C55E';
    if (rate >= 60) return '#F59E0B';
    return '#EF4444';
  };

  const rateColor = getRateColor(complianceRate);

  return (
    <View style={[styles.container, { borderColor: 'rgba(255,255,255,0.1)' }]}>
      {/* Compliance Ring */}
      <View style={styles.ringSection}>
        <View style={[styles.ringOuter, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={[styles.ringInner, { backgroundColor: rateColor + '15' }]}>
            <Text style={[styles.ringValue, { color: rateColor }]}>{complianceRate}%</Text>
            <Text style={[styles.ringLabel, { color: colors.textSecondary }]}>Compliance</Text>
          </View>
        </View>
        <View style={styles.ringRight}>
          <View style={[styles.rateBar, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <View style={[styles.rateFill, { width: `${complianceRate}%`, backgroundColor: rateColor }]} />
          </View>
          <Text style={[styles.rateText, { color: colors.textSecondary }]}>
            {stats.done} of {stats.total} tasks completed
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {[
          {
            icon: <CheckCircle2 size={14} color="#22C55E" />,
            label: 'Completed',
            value: stats.done,
            color: '#22C55E',
          },
          {
            icon: <Clock size={14} color="#F59E0B" />,
            label: 'Pending',
            value: stats.pending,
            color: '#F59E0B',
          },
          {
            icon: <AlertTriangle size={14} color="#EF4444" />,
            label: 'Overdue',
            value: stats.overdue,
            color: '#EF4444',
          },
          {
            icon: <TrendingUp size={14} color="#6366F1" />,
            label: 'Postponed',
            value: stats.postponed,
            color: '#6366F1',
          },
        ].map((item) => (
          <View key={item.label} style={[styles.statItem, { borderColor: 'rgba(255,255,255,0.06)' }]}>
            <View style={[styles.statIconWrap, { backgroundColor: item.color + '15' }]}>
              {item.icon}
            </View>
            <Text style={[styles.statNum, { color: item.color }]}>{item.value}</Text>
            <Text style={[styles.statLbl, { color: colors.textTertiary }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Overdue Alert */}
      {stats.overdue > 0 && (
        <View style={[styles.overdueBanner, { backgroundColor: '#EF444415' }]}>
          <AlertTriangle size={14} color="#EF4444" />
          <Text style={styles.overdueText}>
            {stats.overdue} task{stats.overdue !== 1 ? 's' : ''} overdue — immediate action needed
          </Text>
        </View>
      )}

      {/* View Report */}
      {onViewReport && (
        <TouchableOpacity style={[styles.reportBtn, { borderColor: colors.primary }]} onPress={onViewReport}>
          <TrendingUp size={14} color={colors.primary} />
          <Text style={[styles.reportBtnText, { color: colors.primary }]}>View Compliance Report</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  ringSection: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  ringOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 18, fontWeight: '800' },
  ringLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  ringRight: { flex: 1, gap: 8 },
  rateBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 3 },
  rateText: { fontSize: 11, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statItem: { flex: 1, minWidth: '45%', padding: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  statIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 12 },
  overdueText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#EF4444' },
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  reportBtnText: { fontSize: 13, fontWeight: '700' },
});
