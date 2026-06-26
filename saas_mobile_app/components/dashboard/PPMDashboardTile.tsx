/**
 * PPMDashboardTile — Compact PPM calendar + upcoming tasks for dashboard.
 * Shows mini calendar with dots and list of upcoming tasks.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassTile } from './DashboardComponents';
import { PPMSchedule } from '@/hooks/useDashboardQuery';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  done: '#22C55E',
  postponed: '#F43F5E',
  skipped: '#94A3B8',
};

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

interface Props {
  propertyId: string;
  delay?: number;
  schedules: PPMSchedule[];
  loading?: boolean;
}

export default function PPMDashboardTile({ propertyId, delay = 220, schedules, loading = false }: Props) {
  const router = useRouter();

  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Stats
  const stats = useMemo(() => {
    const total = schedules.length;
    const done = schedules.filter(s => s.status === 'done').length;
    const overdue = schedules.filter(isOverdue).length;
    const pending = schedules.filter(s => s.status === 'pending' && !isOverdue(s)).length;
    return { total, done, overdue, pending };
  }, [schedules]);

  // Calendar data
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();

  // Date map for dots
  const dateMap = useMemo(() => {
    const map: Record<string, PPMSchedule[]> = {};
    for (const s of schedules) {
      const d = normalizeDate(s.planned_date);
      if (!d) continue;
      if (!map[d]) map[d] = [];
      map[d].push(s);
    }
    return map;
  }, [schedules]);

  // Upcoming tasks (next 7 days, sorted by date)
  const upcomingTasks = useMemo(() => {
    return schedules
      .filter(s => {
        if (s.status === 'done') return false;
        const days = daysUntil(s.planned_date);
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => {
        const dateA = new Date(normalizeDate(a.planned_date)).getTime();
        const dateB = new Date(normalizeDate(b.planned_date)).getTime();
        return dateA - dateB;
      })
      .slice(0, 5);
  }, [schedules]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const getDots = (day: number): string[] => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const daySchedules = dateMap[dateStr] ?? [];
    const dotSet = new Set<string>();
    for (const s of daySchedules) {
      if (isOverdue(s)) dotSet.add('#EF4444');
      else dotSet.add(STATUS_COLORS[s.status] ?? '#F59E0B');
    }
    return Array.from(dotSet).slice(0, 3);
  };

  const hasOverdue = stats.overdue > 0;

  return (
    <GlassTile
      label="PPM Schedule"
      icon="calendar-outline"
      delay={delay}
      status={hasOverdue ? 'watch' : 'optimal'}
      onPress={() => router.push(`/property/${propertyId}/ppm`)}
    >
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={{ alignItems: 'flex-start' }}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>TOTAL</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.overdue}</Text>
          <Text style={styles.statLabel}>OVERDUE</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>PENDING</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.statValue, { color: '#22C55E' }]}>{stats.done}</Text>
          <Text style={styles.statLabel}>DONE</Text>
        </View>
      </View>

      {/* Mini Calendar */}
      <View style={styles.calendarSection}>
        {/* Month Navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
            <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTH_NAMES[calMonth]} {calYear}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {/* Day Headers */}
        <View style={styles.dayHeaderRow}>
          {DAY_NAMES.map((d, i) => (
            <View key={i} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {/* Empty cells for first day offset */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.calendarCell} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = selectedDate === dateStr;
            const dots = getDots(day);
            const hasDots = dots.length > 0;

            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.calendarCell,
                  isToday && styles.todayCell,
                  isSelected && styles.selectedCell,
                ]}
                onPress={() => {
                  if (hasDots) {
                    setSelectedDate(isSelected ? null : dateStr);
                  }
                }}
                activeOpacity={hasDots ? 0.7 : 1}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.todayText,
                    isSelected && styles.selectedText,
                  ]}
                >
                  {day}
                </Text>
                {hasDots && (
                  <View style={styles.dotsRow}>
                    {dots.map((color, idx) => (
                      <View key={idx} style={[styles.dot, { backgroundColor: color }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Overdue</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendText}>Pending</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendText}>Done</Text>
          </View>
        </View>
      </View>

      {/* Selected Day Tasks */}
      {selectedDate && (
        <View style={styles.selectedDaySection}>
          {(() => {
            const daySchedules = dateMap[selectedDate] ?? [];
            return (
              <>
                <Text style={styles.selectedDayTitle}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
                {daySchedules.slice(0, 3).map(s => (
                  <View key={s.id} style={styles.taskRow}>
                    <View style={[styles.taskIcon, { backgroundColor: isOverdue(s) ? 'rgba(239,68,68,0.2)' : s.status === 'done' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)' }]}>
                      <Ionicons
                        name={isOverdue(s) ? 'warning' : s.status === 'done' ? 'checkmark-circle' : 'time-outline'}
                        size={12}
                        color={isOverdue(s) ? '#EF4444' : s.status === 'done' ? '#22C55E' : '#F59E0B'}
                      />
                    </View>
                    <Text style={styles.taskName} numberOfLines={1}>{s.system_name}</Text>
                  </View>
                ))}
                {daySchedules.length > 3 && (
                  <Text style={styles.moreTasks}>+{daySchedules.length - 3} more</Text>
                )}
              </>
            );
          })()}
        </View>
      )}

      {/* Upcoming Tasks */}
      {upcomingTasks.length > 0 && (
        <View style={styles.upcomingSection}>
          <Text style={styles.upcomingTitle}>Upcoming (7 days)</Text>
          {upcomingTasks.map(s => {
            const days = daysUntil(s.planned_date);
            const overdue = isOverdue(s);
            return (
              <View key={s.id} style={styles.upcomingRow}>
                <View style={styles.upcomingLeft}>
                  <Text style={styles.upcomingDate}>
                    {MONTH_NAMES[new Date(normalizeDate(s.planned_date)).getMonth()]} {new Date(normalizeDate(s.planned_date)).getDate()}
                  </Text>
                </View>
                <View style={[styles.upcomingStatus, {
                  backgroundColor: overdue ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'
                }]}>
                  <Text style={[styles.upcomingStatusText, { color: overdue ? '#EF4444' : '#F59E0B' }]}>
                    {overdue ? 'OVERDUE' : days === 0 ? 'TODAY' : `${days}d`}
                  </Text>
                </View>
                <Text style={styles.upcomingName} numberOfLines={1}>{s.system_name}</Text>
              </View>
            );
          })}
        </View>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}
    </GlassTile>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginTop: 2,
  },
  calendarSection: {
    marginBottom: 8,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  todayCell: {},
  selectedCell: {},
  dayText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  todayText: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  selectedText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  selectedDaySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  selectedDayTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  taskIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  moreTasks: {
    fontSize: 11,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 4,
  },
  upcomingSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  upcomingTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  upcomingLeft: {
    width: 40,
  },
  upcomingDate: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  upcomingStatus: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  upcomingStatusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  upcomingName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
