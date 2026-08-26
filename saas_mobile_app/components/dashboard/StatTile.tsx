// @ts-nocheck
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context';

interface StatTileProps {
  label: string;
  value: string | number;
  trend?: {
    value: string;
    isUp: boolean;
  };
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accentColor?: string;
  style?: ViewStyle;
}

export default function StatTile({
  label,
  value,
  trend,
  subtitle,
  icon,
  accentColor,
  style,
}: StatTileProps) {
  const { isDark, colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        accentColor ? { borderLeftWidth: 4, borderLeftColor: accentColor } : {},
        style,
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
        {icon && (
          <View style={[styles.iconContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name={icon} size={20} color={colors.textSecondary} />
          </View>
        )}
      </View>

      <View style={styles.valueRow}>
        <Text
          style={[styles.value, { color: accentColor ?? colors.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {value}
        </Text>
        {trend && (
          <View
            style={[
              styles.trendBadge,
              {
                backgroundColor: trend.isUp ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                borderColor: trend.isUp ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
              },
            ]}
          >
            <Text
              style={[
                styles.trendText,
                { color: trend.isUp ? '#10B981' : '#EF4444' },
              ]}
              numberOfLines={1}
            >
              {trend.isUp ? '↑' : '↓'} {trend.value}
            </Text>
          </View>
        )}
      </View>

      {subtitle && (
        <View style={[styles.subtitleContainer, { borderTopColor: colors.border }]}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    flex: 1,
    minWidth: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  subtitleContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  subtitle: {
    fontSize: 13,
  },
});
