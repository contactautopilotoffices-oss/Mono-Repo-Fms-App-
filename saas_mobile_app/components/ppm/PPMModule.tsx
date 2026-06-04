/**
 * PPMModule — Full PPM module wrapper component.
 * Embeds the complete PPM dashboard: calendar, schedules, stats, and AMC.
 * Can be embedded inside any parent screen or used standalone.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ppmService, PPMSchedule, AMCContract, PPMStats } from '@/services/ppmService';
import PPMCalendar from './PPMCalendar';
import PPMCompliance from './PPMCompliance';
import PPMReports from './PPMReports';
import AMCContracts from './AMCContracts';
import {
  Wrench,
  CalendarDays,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ChevronRight,
} from 'lucide-react-native';

interface PPMModuleProps {
  propertyId: string;
  organizationId?: string;
  embedded?: boolean;
  onSchedulePress?: (schedule: PPMSchedule) => void;
  onContractPress?: (contract: AMCContract) => void;
}

type TabKey = 'calendar' | 'schedules' | 'amc';

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

function daysUntil(dateStr: string): number {
  const norm = normalizeDate(dateStr);
  if (!norm) return 999;
  const target = new Date(norm + 'T12:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export default function PPMModule({
  propertyId,
  organizationId,
  embedded = false,
  onSchedulePress,
  onContractPress,
}: PPMModuleProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('calendar');
  const [schedules, setSchedules] = useState<PPMSchedule[]>([]);
  const [contracts, setContracts] = useState<AMCContract[]>([]);
  const [stats, setStats] = useState<PPMStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Calendar navigation
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const fetchData = useCallback(async () => {
    try {
      const [schedRes, contractsRes, statsRes] = await Promise.all([
        ppmService.fetchSchedules(propertyId, { organizationId }),
        ppmService.fetchContracts(propertyId, organizationId),
        ppmService.fetchStats(propertyId, organizationId),
      ]);
      if (schedRes.success && schedRes.data) setSchedules(schedRes.data);
      if (contractsRes.success && contractsRes.data) setContracts(contractsRes.data);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
    } catch (err: any) {
      console.error('[PPMModule] error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId, organizationId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const overdueSchedules = schedules.filter(isOverdue);
  const expiringContracts = contracts.filter(
    (c) => c.status === 'expiring_soon' || c.status === 'expired'
  );

  const selectedDaySchedules = selectedDate
    ? schedules.filter((s) => normalizeDate(s.planned_date) === selectedDate)
    : [];

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const handleSchedulePress = (s: PPMSchedule) => {
    if (onSchedulePress) onSchedulePress(s);
    else router.push(`/property/${propertyId}/ppm?scheduleId=${s.id}` as any);
  };

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading PPM...</Text>
      </View>
    );
  }

  const TABS: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'calendar', label: 'Calendar', icon: <CalendarDays size={14} /> },
    { key: 'schedules', label: 'Schedules', icon: <Wrench size={14} />, badge: overdueSchedules.length || undefined },
    { key: 'amc', label: 'AMC', icon: <FileText size={14} />, badge: expiringContracts.length || undefined },
  ];

  return (
    <View style={[styles.container, !embedded && { paddingTop: 0 }]}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: embedded ? 'transparent' : colors.card, borderColor: embedded ? 'transparent' : colors.border }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <View style={{ marginRight: 4 }}>
              {React.cloneElement(tab.icon as React.ReactElement, { color: activeTab === tab.key ? '#fff' : colors.textSecondary })}
            </View>
            <Text style={[styles.tabText, { color: activeTab === tab.key ? '#fff' : colors.textSecondary }]}>
              {tab.label}
            </Text>
            {tab.badge && tab.badge > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.tabBadgeText}>{tab.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <>
            {/* Stats + Compliance Row */}
            <PPMCompliance propertyId={propertyId} organizationId={organizationId} onViewReport={() => setShowReport(true)} />

            {/* Month Navigator */}
            <View style={styles.monthNav}>
              <TouchableOpacity style={styles.monthNavBtn} onPress={prevMonth}>
                <ChevronRight size={18} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>
              <Text style={[styles.monthNavTitle, { color: colors.text }]}>
                {MONTH_NAMES[calMonth]} {calYear}
              </Text>
              <TouchableOpacity style={styles.monthNavBtn} onPress={nextMonth}>
                <ChevronRight size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <PPMCalendar
              year={calYear}
              month={calMonth}
              schedules={schedules}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            {/* Legend */}
            <View style={styles.legendRow}>
              {[
                { color: '#EF4444', label: 'Overdue' },
                { color: '#F59E0B', label: 'Pending' },
                { color: '#22C55E', label: 'Done' },
              ].map((l) => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>{l.label}</Text>
                </View>
              ))}
            </View>

            {/* Selected Day */}
            {selectedDate && (
              <View style={styles.selectedDaySection}>
                <Text style={[styles.selectedDayTitle, { color: colors.text }]}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                {selectedDaySchedules.length === 0 ? (
                  <View style={[styles.emptyDay, { backgroundColor: colors.card }]}>
                    <CheckCircle2 size={20} color={colors.textTertiary} />
                    <Text style={[styles.emptyDayText, { color: colors.textTertiary }]}>No tasks for this day</Text>
                  </View>
                ) : (
                  selectedDaySchedules.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.scheduleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => handleSchedulePress(s)}
                    >
                      <View style={[styles.scheduleIcon, { backgroundColor: isOverdue(s) ? colors.errorBg : colors.warningBg }]}>
                        <Wrench size={14} color={isOverdue(s) ? colors.error : colors.warning} />
                      </View>
                      <View style={styles.scheduleInfo}>
                        <Text style={[styles.scheduleName, { color: colors.text }]} numberOfLines={1}>{s.system_name}</Text>
                        <Text style={[styles.scheduleMeta, { color: colors.textSecondary }]}>
                          {s.detail_name || s.scope_of_work || 'No details'} · {s.frequency}
                        </Text>
                      </View>
                      <View style={[styles.scheduleStatus, {
                        backgroundColor: isOverdue(s) ? colors.errorBg : s.status === 'done' ? colors.successBg : colors.warningBg
                      }]}>
                        <Text style={[styles.scheduleStatusText, {
                          color: isOverdue(s) ? colors.error : s.status === 'done' ? colors.success : colors.warning
                        }]}>
                          {isOverdue(s) ? 'OVERDUE' : s.status === 'done' ? 'DONE' : 'PENDING'}
                        </Text>
                      </View>
                      <ChevronRight size={14} color={colors.textTertiary} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* Overdue Alert */}
            {overdueSchedules.length > 0 && (
              <View style={[styles.overdueBanner, { backgroundColor: '#EF444415' }]}>
                <AlertTriangle size={14} color="#EF4444" />
                <Text style={styles.overdueBannerText}>{overdueSchedules.length} overdue task{overdueSchedules.length !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </>
        )}

        {/* Schedules Tab */}
        {activeTab === 'schedules' && (
          <>
            {overdueSchedules.length > 0 && (
              <View style={[styles.overdueBanner, { backgroundColor: '#EF444415', marginBottom: 12 }]}>
                <AlertTriangle size={14} color="#EF4444" />
                <Text style={styles.overdueBannerText}>{overdueSchedules.length} overdue task{overdueSchedules.length !== 1 ? 's' : ''}</Text>
              </View>
            )}
            {schedules.length === 0 ? (
              <View style={styles.emptyState}>
                <Wrench size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No PPM schedules</Text>
              </View>
            ) : (
              schedules.map((s) => {
                const days = daysUntil(s.planned_date);
                const overdue = isOverdue(s);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.scheduleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handleSchedulePress(s)}
                  >
                    <View style={[styles.scheduleIcon, { backgroundColor: overdue ? colors.errorBg : s.status === 'done' ? colors.successBg : colors.warningBg }]}>
                      <Wrench size={14} color={overdue ? colors.error : s.status === 'done' ? colors.success : colors.warning} />
                    </View>
                    <View style={styles.scheduleInfo}>
                      <Text style={[styles.scheduleName, { color: colors.text }]} numberOfLines={1}>{s.system_name}</Text>
                      <Text style={[styles.scheduleMeta, { color: colors.textSecondary }]}>
                        {normalizeDate(s.planned_date)} · {s.frequency}
                      </Text>
                    </View>
                    <View style={[styles.scheduleStatus, { backgroundColor: overdue ? colors.errorBg : s.status === 'done' ? colors.successBg : colors.warningBg }]}>
                      <Text style={[styles.scheduleStatusText, { color: overdue ? colors.error : s.status === 'done' ? colors.success : colors.warning }]}>
                        {overdue ? 'OVERDUE' : s.status.toUpperCase()}
                      </Text>
                    </View>
                    <ChevronRight size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {/* AMC Tab */}
        {activeTab === 'amc' && (
          <AMCContracts
            propertyId={propertyId}
            organizationId={organizationId}
            onContractPress={onContractPress}
          />
        )}
      </ScrollView>

      {/* Report Modal */}
      <Modal visible={showReport} animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={[styles.reportModalWrap, { backgroundColor: colors.background, paddingTop: 40 }]}>
          <PPMReports
            propertyId={propertyId}
            organizationId={organizationId}
            month={calMonth}
            year={calYear}
            onClose={() => setShowReport(false)}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  scrollArea: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 100 },
  tabBar: { flexDirection: 'row', padding: 6, borderRadius: 14, gap: 4, marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 4 },
  tabText: { fontSize: 12, fontWeight: '700' },
  tabBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthNavBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  monthNavTitle: { fontSize: 16, fontWeight: '700' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600' },
  selectedDaySection: { marginTop: 12 },
  selectedDayTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  emptyDay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 12 },
  emptyDayText: { fontSize: 13 },
  overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10 },
  overdueBannerText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 10 },
  scheduleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scheduleInfo: { flex: 1 },
  scheduleName: { fontSize: 14, fontWeight: '700' },
  scheduleMeta: { fontSize: 11, marginTop: 2 },
  scheduleStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  scheduleStatusText: { fontSize: 9, fontWeight: '800' },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  reportModalWrap: { flex: 1, padding: 16 },
});
