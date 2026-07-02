/**
 * ChecklistProgressCard — Horizontal linear progress bar.
 * Same horizontal extent as the ticket counter row inside the GlassTile.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SPACING, CARD_SURFACES } from '@/constants/designSystem';
import SafeBlurView from '@/components/ui/SafeBlurView';

interface ChecklistProgressCardProps {
  completed: number;
  total: number;
  delay?: number;
  onPress?: () => void;
}

export const ChecklistProgressCard: React.FC<ChecklistProgressCardProps> = ({
  completed = 0,
  total = 0,
  delay = 200,
  onPress,
}) => {
  const safeCompleted = typeof completed === 'number' && !isNaN(completed) ? completed : 0;
  const safeTotal = typeof total === 'number' && !isNaN(total) ? total : 0;
  const percent = safeTotal > 0 ? Math.min(safeCompleted / safeTotal, 1) : 0;
  const pctDisplay = Math.round(percent * 100);

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(420)} style={styles.wrapper}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.92} style={styles.card}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />

        {/* Top row: label + value */}
        <View style={styles.row}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.icon}>✓</Text>
            <Text style={styles.label}>Checklist</Text>
          </View>
          <Text style={styles.value}>
            {safeCompleted}<Text style={styles.valueMuted}>/{safeTotal}</Text>
          </Text>
        </View>

        {/* Track + fill */}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pctDisplay}%` }]} />
        </View>

        {/* Footer row: percent + status */}
        <View style={styles.footer}>
          <Text style={styles.pct}>{pctDisplay}%</Text>
          <Text style={styles.status}>
            {percent >= 1 ? 'Completed' : percent >= 0.5 ? 'On Track' : 'In Progress'}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: SPACING.md,
    marginHorizontal: 0,
  },
  card: {
    borderRadius: CARD_SURFACES.cardRadius,
    backgroundColor: CARD_SURFACES.cardBg,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    padding: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  icon: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  valueMuted: {
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
  },
  track: {
    height: 6,
    width: '100%',
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  pct: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  status: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

export default ChecklistProgressCard;
