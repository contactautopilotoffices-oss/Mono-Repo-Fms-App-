/**
 * PPMCalendar — Reusable month calendar for PPM schedule visualization.
 * Renders dots on days with PPM tasks, colored by status.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import type { PPMSchedule } from '@/services/ppmService';

interface PPMCalendarProps {
  year: number;
  month: number;
  schedules: PPMSchedule[];
  selectedDate: string | null;
  onSelectDate: (dateStr: string | null) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_DOT_COLORS: Record<string, string> = {
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
  const days = (() => {
    const norm = normalizeDate(s.planned_date);
    if (!norm) return 999;
    const target = new Date(norm + 'T12:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
  })();
  return days < 0;
}

export default function PPMCalendar({
  year,
  month,
  schedules,
  selectedDate,
  onSelectDate,
}: PPMCalendarProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  // Build date → schedule map for quick dot lookup
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

  const getDots = (day: number): string[] => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const daySchedules = dateMap[dateStr] ?? [];
    const dotSet = new Set<string>();

    for (const s of daySchedules) {
      if (isOverdue(s)) {
        dotSet.add('#EF4444'); // overdue — always red
      } else {
        dotSet.add(STATUS_DOT_COLORS[s.status] ?? '#F59E0B');
      }
    }
    return Array.from(dotSet).slice(0, 3);
  };

  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
      {/* Day header row */}
      <View style={styles.dayRow}>
        {DAY_NAMES.map((d) => (
          <View key={d} style={styles.dayCell}>
            <Text style={[styles.dayHeaderText, { color: colors.textTertiary }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const isSelected = selectedDate === dateStr;
          const dots = getDots(day);

          return (
            <TouchableOpacity
              key={dateStr}
              style={styles.dayCell}
              onPress={() => onSelectDate(isSelected ? null : dateStr)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.dayCircle,
                  isToday && { borderColor: colors.primary, borderWidth: 1.5 },
                  isSelected && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    {
                      color: isSelected
                        ? '#fff'
                        : isDark ? '#F8FAFC' : '#1A2332',
                    },
                    isToday && !isSelected && { color: colors.primary, fontWeight: '700' },
                  ]}
                >
                  {day}
                </Text>
              </View>
              {/* Status dots */}
              <View style={styles.dotsRow}>
                {dots.map((color, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: color }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, borderRadius: 16, borderWidth: 1 },
  dayRow: { flexDirection: 'row', marginBottom: 8 },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dayHeaderText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontWeight: '500' },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 2, minHeight: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
