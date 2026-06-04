/**
 * PPMReports — Compliance report view for PPM.
 * Shows monthly compliance score, task breakdown, and overdue items.
 * Mirrors web app audit report logic using same ppm_schedules table.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ppmService, PPMSchedule, PPMStats } from '@/services/ppmService';
import { CheckCircle2, AlertTriangle, Clock, TrendingUp, X } from 'lucide-react-native';

interface PPMReportsProps {
  propertyId: string;
  organizationId?: string;
  month?: number; // 0-11, defaults to current
  year?: number;
  onClose?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeDate(value?: string | null): string {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return '';
}

function isOverdue(s: PPMSchedule): boolean {
  if (s.status === 'done') return false;
  const norm = normalizeDate(s.planned_date);
  if (!norm) return false;
  const target = new Date(norm + 'T12:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000) < 0;
}

function getScoreLabel(rate: number): { label: string; color: string } {
  if (rate >= 90) return { label: 'Excellent', color: '#22C55E' };
  if (rate >= 75) return { label: 'Good', color: '#10B981' };
  if (rate >= 60) return { label: 'Fair', color: '#F59E0B' };
  if (rate >= 40) return { label: 'Poor', color: '#EF4444' };
  return { label: 'Critical', color: '#DC2626' };
}

export default function PPMReports({
  propertyId,
  organizationId,
  month,
  year,
  onClose,
}: PPMReportsProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const now = new Date();
  const effectiveMonth = month ?? now.getMonth();
  const effectiveYear = year ?? now.getFullYear();

  const [schedules, setSchedules] = useState<PPMSchedule[]>([]);
  const [stats, setStats] = useState<PPMStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'overdue' | 'completed'>('overview');

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [schedRes, statsRes] = await Promise.all([
          ppmService.fetchSchedules(propertyId, { organizationId }),
          ppmService.fetchStats(propertyId, organizationId),
        ]);

        if (schedRes.success && schedRes.data) {
          setSchedules(schedRes.data);
        }
        if (statsRes.success && statsRes.data) {
          setStats(statsRes.data);
        }
      } catch (err: any) {
        console.error('[PPMReports] error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [propertyId, organizationId]);

  // Filter to current month
  const monthPrefix = `${effectiveYear}-${String(effectiveMonth + 1).padStart(2, '0')}`;
  const monthSchedules = useMemo(
    () => schedules.filter((s) => normalizeDate(s.planned_date).startsWith(monthPrefix)),
    [schedules, monthPrefix]
  );

  const monthStats = useMemo(() => {
    const total = monthSchedules.length;
    const done = monthSchedules.filter((s) => s.status === 'done').length;
    const overdue = monthSchedules.filter(isOverdue).length;
    const pending = monthSchedules.filter((s) => s.status === 'pending').length;
    const postponed = monthSchedules.filter((s) => s.status === 'postponed').length;
    const skipped = monthSchedules.filter((s) => s.status === 'skipped').length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 100;
    return { total, done, overdue, pending, postponed, skipped, rate };
  }, [monthSchedules]);

  const overdueItems = useMemo(
    () => monthSchedules.filter((s) => isOverdue(s)),
    [monthSchedules]
  );

  const completedItems = useMemo(
    () => monthSchedules.filter((s) => s.status === 'done'),
    [monthSchedules]
  );

  const scoreInfo = getScoreLabel(monthStats.rate);

  if (loading) {
    return (
      <View style={[styles.container, { borderColor: 'rgba(255,255,255,0.1)' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const HeaderRow = () => (
    <View style={[styles.reportHeader, { borderColor: 'rgba(255,255,255,0.08)' }]}>
      <View>
        <Text style={[styles.reportTitle, { color: colors.text }]}>
          PPM Compliance Report
        </Text>
        <Text style={[styles.reportSubtitle, { color: colors.textSecondary }]}>
          {MONTH_NAMES[effectiveMonth]} {effectiveYear}
        </Text>
      </View>
      {onClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <X size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  const ScoreCard = () => (
    <View style={[styles.scoreCard, { backgroundColor: scoreInfo.color + '15', borderColor: scoreInfo.color + '30' }]}>
      <View style={[styles.scoreCircle, { borderColor: scoreInfo.color }]}>
        <Text style={[styles.scoreValue, { color: scoreInfo.color }]}>{monthStats.rate}%</Text>
      </View>
      <View style={styles.scoreInfo}>
        <Text style={[styles.scoreLabel, { color: scoreInfo.color }]}>{scoreInfo.label}</Text>
        <Text style={[styles.scoreSub, { color: colors.textSecondary }]}>
          {monthStats.done} of {monthStats.total} tasks completed
        </Text>
      </View>
      <View style={styles.scoreBreakdown}>
        <View style={styles.breakdownItem}>
          <CheckCircle2 size={12} color="#22C55E" />
          <Text style={[styles.breakdownNum, { color: colors.text }]}>{monthStats.done}</Text>
        </View>
        <View style={styles.breakdownItem}>
          <Clock size={12} color="#F59E0B" />
          <Text style={[styles.breakdownNum, { color: colors.text }]}>{monthStats.pending}</Text>
        </View>
        <View style={styles.breakdownItem}>
          <AlertTriangle size={12} color="#EF4444" />
          <Text style={[styles.breakdownNum, { color: colors.text }]}>{monthStats.overdue}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { borderColor: 'rgba(255,255,255,0.1)' }]}>
      <HeaderRow />
      <ScoreCard />

      {/* Tab Selector */}
      <View style={styles.tabRow}>
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'overdue', label: `Overdue (${overdueItems.length})` },
          { key: 'completed', label: `Completed (${completedItems.length})` },
        ] as const).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.key ? '#fff' : colors.textSecondary }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {activeTab === 'overview' && (
          <View style={styles.overviewGrid}>
            {[
              { label: 'Total Tasks', value: monthStats.total, color: colors.primary },
              { label: 'Completed', value: monthStats.done, color: '#22C55E' },
              { label: 'Pending', value: monthStats.pending, color: '#F59E0B' },
              { label: 'Overdue', value: monthStats.overdue, color: '#EF4444' },
              { label: 'Postponed', value: monthStats.postponed, color: '#6366F1' },
              { label: 'Skipped', value: monthStats.skipped, color: '#94A3B8' },
            ].map((item) => (
              <View key={item.label} style={[styles.overviewCard, { borderColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={[styles.overviewValue, { color: item.color }]}>{item.value}</Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'overdue' && (
          <>
            {overdueItems.length === 0 ? (
              <View style={styles.emptyState}>
                <CheckCircle2 size={32} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No overdue tasks</Text>
              </View>
            ) : (
              overdueItems.map((s) => (
                <View key={s.id} style={[styles.listItem, { borderColor: 'rgba(255,255,255,0.06)' }]}>
                  <AlertTriangle size={14} color="#EF4444" />
                  <View style={styles.listItemInfo}>
                    <Text style={[styles.listItemName, { color: colors.text }]}>{s.system_name}</Text>
                    <Text style={[styles.listItemMeta, { color: colors.textSecondary }]}>
                      {normalizeDate(s.planned_date)} · {s.frequency}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'completed' && (
          <>
            {completedItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Clock size={32} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No completed tasks</Text>
              </View>
            ) : (
              completedItems.map((s) => (
                <View key={s.id} style={[styles.listItem, { borderColor: 'rgba(255,255,255,0.06)' }]}>
                  <CheckCircle2 size={14} color="#22C55E" />
                  <View style={styles.listItemInfo}>
                    <Text style={[styles.listItemName, { color: colors.text }]}>{s.system_name}</Text>
                    <Text style={[styles.listItemMeta, { color: colors.textSecondary }]}>
                      {normalizeDate(s.planned_date)} · {normalizeDate(s.done_date ?? '')}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  reportTitle: { fontSize: 16, fontWeight: '700' },
  reportSubtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  scoreCard: { margin: 16, padding: 16, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 16, fontWeight: '800' },
  scoreInfo: { flex: 1 },
  scoreLabel: { fontSize: 16, fontWeight: '800' },
  scoreSub: { fontSize: 11, marginTop: 2 },
  scoreBreakdown: { gap: 6 },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breakdownNum: { fontSize: 12, fontWeight: '700' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabText: { fontSize: 11, fontWeight: '700' },
  scrollArea: { maxHeight: 300, paddingHorizontal: 16 },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overviewCard: { width: '31%', padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  overviewValue: { fontSize: 20, fontWeight: '800' },
  overviewLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  listItemInfo: { flex: 1 },
  listItemName: { fontSize: 13, fontWeight: '600' },
  listItemMeta: { fontSize: 11, marginTop: 2 },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 14, fontWeight: '600' },
});
