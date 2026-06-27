/**
 * Stock Dashboard Component
 * Reusable dashboard with KPI cards, item list, and quick actions
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  Package,
  AlertTriangle,
  TrendingDown,
  Search,
  X,
  ChevronRight,
} from 'lucide-react-native';
import { STATUS_COLORS, type StatusType } from '@/constants/designSystem';

// ─── Design Tokens (matching main Stock screen) ───────────────────────────────────

const TOKENS = {
  bg: { gradient: ['#0B1B2A', '#0F2D3D', '#113B4D'] as const },
  glass: {
    border: 'rgba(255,255,255,0.18)',
    bg: 'rgba(255,255,255,0.06)',
  },
  tint: {
    blue: { start: 'rgba(59,130,246,0.18)', end: 'rgba(59,130,246,0.04)' },
    green: { start: 'rgba(16,185,129,0.18)', end: 'rgba(16,185,129,0.04)' },
    amber: { start: 'rgba(245,158,11,0.18)', end: 'rgba(245,158,11,0.04)' },
    rose: { start: 'rgba(239,68,68,0.18)', end: 'rgba(239,68,68,0.04)' },
  },
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.60)',
    tertiary: 'rgba(255,255,255,0.38)',
  },
  radius: { card: 20, btn: 14, chip: 20, sheet: 24 },
};

// ─── Types ───────────────────────────────────────────────────────────────────────

interface StockItem {
  id: string;
  name: string;
  item_code: string;
  category: string | null;
  quantity: number;
  min_threshold: number;
  unit: string | null;
  unit_price?: number;
}

interface StockDashboardProps {
  propertyId: string;
  items: StockItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  onRefresh?: () => void;
  onItemPress?: (item: StockItem) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;
}

// ─── Utility Functions ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function getStockStatus(item: StockItem): StatusType {
  if (item.quantity === 0) return 'critical';
  if (item.quantity < (item.min_threshold || 10)) return 'watch';
  return 'optimal';
}

// ─── KPI Card Sub-component ─────────────────────────────────────────────────────

function TintedGlassCard({
  label,
  value,
  icon,
  tint,
  isCurrency,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tint: 'blue' | 'green' | 'amber' | 'rose';
  isCurrency?: boolean;
  delay?: number;
}) {
  const tintDef = TOKENS.tint[tint];

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={{ flex: 1 }}>
      <View style={[styles.tintedCard]}>
        <SafeBlurView intensity={40} style={StyleSheet.absoluteFillObject} tint="dark" />
        <LinearGradient
          colors={[tintDef.start, TOKENS.glass.bg, tintDef.end, 'rgba(0,0,0,0.15)']}
          locations={[0, 0.3, 0.7, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.tintedCardInner}>
          <View style={styles.tintedCardHeader}>
            <View style={[styles.tintedIconWrap, { backgroundColor: 'rgba(255,255,255,0.10)' }]}>
              {icon}
            </View>
            <Text style={styles.tintedLabel}>{label}</Text>
          </View>
          <Text style={[styles.tintedValue, isCurrency && { fontSize: 20 }]} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Item Card Sub-component ────────────────────────────────────────────────────

function StockItemCard({
  item,
  onPress,
}: {
  item: StockItem;
  onPress: (item: StockItem) => void;
}) {
  const status = getStockStatus(item);
  const palette = STATUS_COLORS[status];

  return (
    <TouchableOpacity
      style={[styles.itemCard, { borderLeftColor: palette.bg }]}
      onPress={() => onPress(item)}
      activeOpacity={0.85}
    >
      <SafeBlurView intensity={35} style={StyleSheet.absoluteFillObject} tint="dark" />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.20)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.itemRow}>
        <View style={[styles.itemIconWrap, { backgroundColor: palette.surface }]}>
          <Package size={20} color={palette.bg} />
        </View>
        <View style={styles.itemContent}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.itemMeta}>
            {item.item_code || 'No SKU'} · {item.category || 'Uncategorized'}
          </Text>
        </View>
        <View style={styles.itemRight}>
          <Text style={[styles.qtyValue, { color: palette.text }]}>{item.quantity}</Text>
          <Text style={styles.itemUnit}>{item.unit || 'units'}</Text>
        </View>
        <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function StockDashboard({
  propertyId,
  items,
  isLoading,
  isFetching,
  onRefresh,
  onItemPress,
  searchQuery = '',
  onSearchChange,
  showSearch = true,
}: StockDashboardProps) {
  // ── Computed Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = items.length;
    const lowStock = items.filter(
      (i) => i.quantity > 0 && i.quantity < (i.min_threshold || 10)
    ).length;
    const outOfStock = items.filter((i) => i.quantity === 0).length;
    const totalValue = items.reduce(
      (sum, i) => sum + i.quantity * (i.unit_price || 0),
      0
    );
    return { total, lowStock, outOfStock, totalValue };
  }, [items]);

  // ── Filtered Items ─────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.item_code || '').toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading stock...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* KPI Cards */}
      <View style={styles.kpiWrap}>
        <View style={styles.kpiRow}>
          <TintedGlassCard
            label="Total items"
            value={stats.total}
            icon={<Package size={16} color="#60A5FA" />}
            tint="blue"
            delay={0}
          />
          <TintedGlassCard
            label="Low stock"
            value={stats.lowStock}
            icon={<AlertTriangle size={16} color="#FBBF24" />}
            tint="amber"
            delay={80}
          />
        </View>
        <View style={styles.kpiRow}>
          <TintedGlassCard
            label="Out of stock"
            value={stats.outOfStock}
            icon={<TrendingDown size={16} color="#FCA5A5" />}
            tint="rose"
            delay={160}
          />
          <TintedGlassCard
            label="Total value"
            value={formatCurrency(stats.totalValue).replace('₹', '₹')}
            icon={<Package size={16} color="#6EE7B7" />}
            tint="green"
            isCurrency
            delay={240}
          />
        </View>
      </View>

      {/* Search */}
      {showSearch && (
        <View style={styles.searchWrap}>
          <View style={styles.searchInputWrap}>
            <Search size={16} color={TOKENS.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search stock..."
              placeholderTextColor={TOKENS.text.tertiary}
              value={searchQuery}
              onChangeText={onSearchChange}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange?.('')}>
                <X size={14} color={TOKENS.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Item List */}
      <FlashList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isFetching || false}
            onRefresh={onRefresh}
            tintColor="#3B82F6"
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={100}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Package size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No items found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'Try adjusting your search' : 'Add your first item'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <StockItemCard item={item} onPress={onItemPress || (() => {})} />
        )}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: TOKENS.text.secondary,
  },

  // KPI
  kpiWrap: { paddingHorizontal: 20, gap: 10, marginBottom: 18 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  tintedCard: {
    borderRadius: TOKENS.radius.card,
    borderWidth: 1,
    borderColor: TOKENS.glass.border,
    overflow: 'hidden',
    minHeight: 110,
  },
  tintedCardInner: { padding: 14, position: 'relative', zIndex: 1 },
  tintedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  tintedIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tintedLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: TOKENS.text.secondary,
    letterSpacing: 0.8,
    textTransform: 'capitalize',
  },
  tintedValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TOKENS.text.primary,
  },

  // Search
  searchWrap: { paddingHorizontal: 20, marginBottom: 14 },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: TOKENS.radius.card,
    borderWidth: 1,
    borderColor: TOKENS.glass.border,
    backgroundColor: TOKENS.glass.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TOKENS.text.primary,
  },

  // List
  listContent: { paddingHorizontal: 20, paddingBottom: 120 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TOKENS.text.secondary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: TOKENS.text.tertiary,
    textAlign: 'center',
  },

  itemCard: {
    borderRadius: TOKENS.radius.card,
    borderLeftWidth: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: { flex: 1 },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TOKENS.text.primary,
    marginBottom: 3,
  },
  itemMeta: {
    fontSize: 11,
    color: TOKENS.text.tertiary,
  },
  itemRight: { alignItems: 'flex-end', marginRight: 4 },
  qtyValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  itemUnit: {
    fontSize: 10,
    color: TOKENS.text.tertiary,
    marginTop: 1,
  },
});
