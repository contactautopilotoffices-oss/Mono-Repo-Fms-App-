/**
 * PPMProgressCard — Mini calendar + task summary for Preventive Maintenance
 * Features:
 * - Calendar grid with proper alignment
 * - Month navigation with slide animation
 * - Color-coded dots for task status
 * - Stats summary
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ppmService } from '@/services/ppmService';
import { usePpmStore } from '@/stores/ppmStore';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

const { width: SCREEN_W } = Dimensions.get('window');

interface PPMProgressCardProps {
  propertyId: string;
  organizationId?: string;
  done: number;
  total: number;
  pending: number;
  overdue: number;
  postponed?: number;
  delay?: number;
  onPress?: () => void;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const PPMProgressCard: React.FC<PPMProgressCardProps> = ({
  propertyId,
  organizationId,
  done = 0,
  total = 0,
  pending = 0,
  overdue = 0,
  postponed = 0,
  delay = 200,
  onPress,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────────
  const [currentDate, setCurrentDate] = useState(new Date());
  const slideAnim = useSharedValue(0);

  // ── Store & Fetch ─────────────────────────────────────────────────────────────
  const { schedules: cachedSchedules, hasLoadedInitialData, setSchedules } = usePpmStore();
  const cached = cachedSchedules[propertyId] ?? [];

  const fetchSchedules = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await ppmService.fetchSchedules(propertyId, organizationId);
      if (res.success && res.data) {
        setSchedules(propertyId, res.data);
      }
    } catch (e) {
      console.warn('[PPMProgressCard] fetch error:', e);
    }
  }, [propertyId, organizationId, setSchedules]);

  useDashboardFetch(queryKeys.property.ppm(propertyId), fetchSchedules, {
    staleTime: 1000 * 60 * 10,
    enabled: !!propertyId,
  });

  useEffect(() => {
    if (!propertyId || !hasLoadedInitialData[propertyId]) {
      fetchSchedules();
    }
  }, [propertyId]);

  const schedules = cached.length > 0 ? cached : [];

  // ── Computed Values ────────────────────────────────────────────────────────────
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const message = useMemo(() => {
    if (percent >= 100) return { title: 'All Maintained!', subtitle: 'Every PPM task complete', icon: 'checkmark-circle' };
    if (percent >= 75) return { title: 'Almost There!', subtitle: 'PM schedule on track', icon: 'trending-up' };
    if (percent >= 50) return { title: 'Halfway!', subtitle: 'Keep up the maintenance', icon: 'construct' };
    if (percent >= 25) return { title: 'Good Start!', subtitle: 'PM work in progress', icon: 'build' };
    return { title: 'Plan Maintenance!', subtitle: 'Start your PPM schedule', icon: 'hammer' };
  }, [percent]);

  // Calendar data for current view
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tasksByDate = useMemo(() => {
    const map: Record<string, { total: number; done: number; pending: number; overdue: number }> = {};
    schedules.forEach((s) => {
      if (!s.planned_date) return;
      const d = map[s.planned_date] || { total: 0, done: 0, pending: 0, overdue: 0 };
      d.total++;
      if (s.status === 'done') d.done++;
      else if (s.status === 'pending') d.pending++;
      else if (s.status === 'postponed') d.overdue++;
      map[s.planned_date] = d;
    });
    return map;
  }, [schedules]);

  const upcomingCount = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return schedules.filter((s) => {
      if (!s.planned_date || s.status !== 'pending') return false;
      const planned = new Date(s.planned_date + 'T00:00:00');
      const diff = Math.ceil((planned.getTime() - now.getTime()) / 86400000);
      return diff >= 0 && diff <= 7;
    }).length;
  }, [schedules]);

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDayOfWeek, daysInMonth]);

  // ── Month Navigation with Animation ─────────────────────────────────────
  const navigateMonth = (direction: 'prev' | 'next') => {
    // Animate out
    slideAnim.value = withTiming(direction === 'next' ? -50 : 50, {
      duration: 150,
      easing: Easing.out(Easing.cubic),
    }, () => {
      // Update date
      const newDate = new Date(currentDate);
      direction === 'prev'
        ? newDate.setMonth(newDate.getMonth() - 1)
        : newDate.setMonth(newDate.getMonth() + 1);
      setCurrentDate(newDate);

      // Animate in from opposite side
      slideAnim.value = direction === 'next' ? 50 : -50;
      slideAnim.value = withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideAnim.value }],
    opacity: 1 - Math.abs(slideAnim.value) / 100,
  }));

  // ── Day Cell Renderer ─────────────────────────────────────────────────────────
  const renderDayCell = (day: number | null, idx: number) => {
    if (day === null) {
      return <View key={`pad-${idx}`} style={styles.dayCell} />;
    }

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const taskInfo = tasksByDate[dateStr];
    const today = new Date();
    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

    let dotColor: string | null = null;
    let dotCount = 0;
    if (taskInfo) {
      if (taskInfo.done > 0 && taskInfo.pending === 0 && taskInfo.overdue === 0) {
        dotColor = '#10B981';
        dotCount = taskInfo.done;
      } else if (taskInfo.overdue > 0) {
        dotColor = '#EF4444';
        dotCount = taskInfo.total;
      } else if (taskInfo.pending > 0) {
        dotColor = '#F59E0B';
        dotCount = taskInfo.pending;
      }
    }

    return (
      <View key={`day-${idx}`} style={[styles.dayCell, isToday && styles.todayCell]}>
        <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
        {dotColor && (
          <View style={styles.dotsContainer}>
            {dotCount <= 3 ? (
              Array.from({ length: dotCount }).map((_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: dotColor }]} />
              ))
            ) : (
              <>
                {Array.from({ length: 2 }).map((_, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: dotColor }]} />
                ))}
                <Text style={styles.moreDotsText}>+{dotCount - 2}</Text>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={styles.container}>
      {/* Header with Month Navigation */}
      <View style={styles.header}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <View style={styles.monthLabelContainer}>
            <Text style={styles.monthLabel}>{MONTH_NAMES[month]}</Text>
            <Text style={styles.yearLabel}>{year}</Text>
          </View>
          <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.statItemText}>{done} Done</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.statItemText}>{pending} Pending</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.statItemText}>{overdue} Overdue</Text>
          </View>
        </View>
      </View>

      {/* Calendar Grid with Animation */}
      <Animated.View style={[styles.calendarContainer, animatedStyle]}>
        {/* Day Labels */}
        <View style={styles.dayLabelsRow}>
          {DAY_LABELS.map((label, idx) => (
            <View key={idx} style={styles.dayLabelCell}>
              <Text style={styles.dayLabelText}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Days */}
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, idx) => renderDayCell(day, idx))}
        </View>
      </Animated.View>

      {/* Progress Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: percent >= 75 ? '#10B981' : percent >= 50 ? '#F59E0B' : '#8B5CF6' }]} />
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <Ionicons name={message.icon as any} size={16} color="#8B5CF6" />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.summaryTitle}>{message.title}</Text>
              <Text style={styles.summarySubtitle}>{message.subtitle}</Text>
            </View>
          </View>
          <View style={styles.summaryRight}>
            {upcomingCount > 0 && (
              <View style={styles.upcomingBadge}>
                <Text style={styles.upcomingText}>{upcomingCount} this week</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Action Button */}
      <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.actionBtnText}>View PPM Schedule</Text>
        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabelContainer: {
    alignItems: 'center',
    marginHorizontal: 20,
  },
  monthLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  yearLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statItemText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
  },
  calendarContainer: {
    marginVertical: 8,
  },
  dayLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  dayLabelCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabelText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  todayCell: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  dayText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
  },
  todayText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  moreDotsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 8,
    fontWeight: '600',
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 4,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
  summaryContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  summarySubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginTop: 1,
  },
  summaryRight: {},
  upcomingBadge: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  upcomingText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.2)',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default PPMProgressCard;