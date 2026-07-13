// @ts-nocheck
/**
 * ChecklistProgressCard — Horizontal linear progress bars for Day and Night shifts.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, CARD_SURFACES } from '@/constants/designSystem';
import SafeBlurView from '@/components/ui/SafeBlurView';

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  shift?: 'day' | 'night';
}

interface ChecklistStats {
  day: { total: number; completed: number };
  night: { total: number; completed: number };
}

interface ChecklistProgressCardProps {
  stats?: ChecklistStats;
  items?: ChecklistItem[];
  delay?: number;
  onPress?: () => void;
  // Legacy props for backward compatibility
  completed?: number;
  total?: number;
}

const ProgressBar = ({ label, completed, total, color, emptyColor = 'rgba(255,255,255,0.08)' }: { label: string, completed: number, total: number, color: string, emptyColor?: string }) => {
  const percent = total > 0 ? Math.min(completed / total, 1) : 0;
  const pctDisplay = Math.round(percent * 100);

  return (
    <View style={styles.barContainer}>
      <View style={styles.barHeader}>
        <Text style={[styles.barLabel, { color }]}>{label}</Text>
        <Text style={styles.barValue}>
          {completed}<Text style={styles.barValueMuted}>/{total}</Text>
        </Text>
        <Text style={[styles.barPct, { color }]}>{pctDisplay}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: emptyColor }]}>
        <View style={[styles.fill, { width: `${pctDisplay}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

export const ChecklistProgressCard: React.FC<ChecklistProgressCardProps> = ({
  stats,
  items = [],
  delay = 200,
  onPress,
  completed = 0,
  total = 0,
}) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  const hasStats = !!stats;
  const dayStats = stats?.day || { total: total, completed: completed }; // fallback to legacy if stats missing
  const nightStats = stats?.night || { total: 0, completed: 0 };

  const dayItems = items.filter(i => i.shift !== 'night');
  const nightItems = items.filter(i => i.shift === 'night');

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(420)} style={styles.wrapper}>
      <TouchableOpacity onPress={onPress} onLongPress={toggleExpand} activeOpacity={0.92} style={styles.card}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />

        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="clipboard-outline" size={16} color="#10B981" />
            <Text style={styles.cardTitle}>Checklist</Text>
          </View>
          <Text style={styles.cardTitleMuted}>All</Text>
        </View>

        <View style={styles.barsWrapper}>
          <ProgressBar label="Day" completed={dayStats.completed} total={dayStats.total} color="#F59E0B" />
          {hasStats && nightStats.total > 0 && (
            <ProgressBar label="Night" completed={nightStats.completed} total={nightStats.total} color="#6366F1" />
          )}
        </View>

        {/* Expanded Items */}
        {expanded && items && items.length > 0 && (
          <View style={styles.expandedContainer}>
            {dayItems.length > 0 && (
              <View style={styles.shiftGroup}>
                <Text style={styles.shiftGroupTitle}>☀️ Day Shift</Text>
                {dayItems.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Ionicons 
                      name={item.completed ? "checkmark-circle" : "ellipse-outline"} 
                      size={18} 
                      color={item.completed ? "#F59E0B" : "rgba(255,255,255,0.3)"} 
                    />
                    <Text style={[styles.itemTitle, item.completed && styles.itemTitleCompleted]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {nightItems.length > 0 && (
              <View style={styles.shiftGroup}>
                <Text style={[styles.shiftGroupTitle, { color: '#818CF8', marginTop: 12 }]}>🌙 Night Shift</Text>
                {nightItems.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Ionicons 
                      name={item.completed ? "checkmark-circle" : "ellipse-outline"} 
                      size={18} 
                      color={item.completed ? "#6366F1" : "rgba(255,255,255,0.3)"} 
                    />
                    <Text style={[styles.itemTitle, item.completed && styles.itemTitleCompleted]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.xl,
  },
  card: {
    borderRadius: CARD_SURFACES.cardRadius,
    backgroundColor: CARD_SURFACES.cardBg,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cardTitleMuted: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  barsWrapper: {
    gap: 16,
  },
  barContainer: {
    width: '100%',
  },
  barHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '700',
    width: 60,
  },
  barValue: {
    flex: 1,
    textAlign: 'center',
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  barValueMuted: {
    color: 'rgba(255,255,255,0.4)',
  },
  barPct: {
    fontSize: 12,
    fontWeight: '800',
    width: 40,
    textAlign: 'right',
  },
  track: {
    height: 6,
    width: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  expandedContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  shiftGroup: {
    gap: 8,
  },
  shiftGroupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FCD34D',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  itemTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  itemTitleCompleted: {
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'line-through',
  },
});

export default ChecklistProgressCard;
