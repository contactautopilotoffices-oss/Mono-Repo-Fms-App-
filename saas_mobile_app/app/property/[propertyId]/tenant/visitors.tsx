import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';

import SafeBlurView from '@/components/ui/SafeBlurView';
import { vmsService, DateFilter } from '@/services/vmsService';
import { SPACING } from '@/constants/designSystem';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------
const FONT_DISPLAY = Platform.select({
  web: 'Poppins, -apple-system, BlinkMacSystemFont, sans-serif',
  ios: 'Poppins',
  android: 'Poppins',
  default: 'Poppins',
});
const FONT_BODY = Platform.select({
  web: 'Urbanist, -apple-system, BlinkMacSystemFont, sans-serif',
  ios: 'Urbanist',
  android: 'Urbanist',
  default: 'Urbanist',
});

// ---------------------------------------------------------------------------
// Filter config constants
// ---------------------------------------------------------------------------
const DATE_FILTERS: { key: DateFilter | 'all_time' | 'custom_date'; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all_time', label: 'All Time' },
  { key: 'custom_date', label: 'Custom Date' },
];

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'checked_in', label: 'Checked In' },
  { key: 'checked_out', label: 'Checked Out' },
];

const CATEGORY_FILTERS: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'visitor', label: 'Visitor', icon: 'person-outline' },
  { key: 'vendor', label: 'Vendor', icon: 'construct-outline' },
  { key: 'delivery', label: 'Delivery', icon: 'cube-outline' },
  { key: 'interview', label: 'Interview', icon: 'briefcase-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  visitor: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  vendor: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
  delivery: { bg: 'rgba(139,92,246,0.15)', text: '#8B5CF6' },
  interview: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  other: { bg: 'rgba(148,163,184,0.15)', text: '#94A3B8' },
};

// ---------------------------------------------------------------------------
// Helper — compute visit duration
// ---------------------------------------------------------------------------
function getDuration(checkinTime: string, checkoutTime: string | null): string {
  const start = new Date(checkinTime);
  const end = checkoutTime ? new Date(checkoutTime) : new Date();
  const diff = Math.floor((end.getTime() - start.getTime()) / 60000);
  if (diff < 1) return 'Just now';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Custom Date Picker Modal
// ---------------------------------------------------------------------------
function CustomDatePickerModal({
  visible,
  selectedDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(selectedDate.getFullYear());
  const [month, setMonth] = useState(selectedDate.getMonth());
  const [day, setDay] = useState(selectedDate.getDate());

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const handleConfirm = () => {
    onSelect(new Date(year, month, day));
    onClose();
  };

  // Build calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  // Ensure day is valid when month/year changes
  const validDay = Math.min(day, daysInMonth);
  if (validDay !== day) setDay(validDay);

  const todayDate = new Date();
  const isToday = (d: number) =>
    d === todayDate.getDate() &&
    month === todayDate.getMonth() &&
    year === todayDate.getFullYear();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={dpStyles.overlay} onPress={onClose}>
        <Pressable style={dpStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={dpStyles.handle} />
          <Text style={dpStyles.title}>Select Date</Text>

          {/* Month/Year nav */}
          <View style={dpStyles.navRow}>
            <TouchableOpacity
              onPress={() => {
                if (month === 0) { setMonth(11); setYear(year - 1); }
                else setMonth(month - 1);
              }}
              style={dpStyles.navBtn}
            >
              <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={dpStyles.navTitle}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity
              onPress={() => {
                if (month === 11) { setMonth(0); setYear(year + 1); }
                else setMonth(month + 1);
              }}
              style={dpStyles.navBtn}
            >
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Day labels */}
          <View style={dpStyles.dayLabelsRow}>
            {DAY_LABELS.map((l) => (
              <Text key={l} style={dpStyles.dayLabel}>{l}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={dpStyles.calendarGrid}>
            {calendarDays.map((d, i) => {
              if (d === null) {
                return <View key={`empty-${i}`} style={dpStyles.dayCell} />;
              }
              const isSelected = d === validDay;
              const isTodayDay = isToday(d);
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    dpStyles.dayCell,
                    isSelected && dpStyles.dayCellSelected,
                    isTodayDay && !isSelected && dpStyles.dayCellToday,
                  ]}
                  onPress={() => setDay(d)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      dpStyles.dayText,
                      isSelected && dpStyles.dayTextSelected,
                      isTodayDay && !isSelected && dpStyles.dayTextToday,
                    ]}
                  >
                    {d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selected date preview + confirm */}
          <View style={dpStyles.footer}>
            <Text style={dpStyles.preview}>
              {format(new Date(year, month, validDay), 'EEEE, dd MMM yyyy')}
            </Text>
            <TouchableOpacity style={dpStyles.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
              <Text style={dpStyles.confirmBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%' as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#708F96',
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.5)',
    borderRadius: 20,
  },
  dayText: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayTextToday: {
    color: '#708F96',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  preview: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    flex: 1,
  },
  confirmBtn: {
    backgroundColor: '#708F96',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  confirmBtnText: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

// ---------------------------------------------------------------------------
// Reusable Dropdown component
// ---------------------------------------------------------------------------
function FilterDropdown<T extends string>({
  label,
  icon,
  options,
  value,
  onChange,
  renderOption,
}: {
  label: string;
  icon: string;
  options: { key: T; label: string; icon?: string; dotColor?: string }[];
  value: T;
  onChange: (key: T) => void;
  renderOption?: (opt: { key: T; label: string; icon?: string; dotColor?: string }, isActive: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.key === value)?.label || label;

  return (
    <>
      <TouchableOpacity
        style={styles.dropdownTrigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name={icon as any} size={14} color="#708F96" />
        <Text style={styles.dropdownTriggerText} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.dropdownSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dropdownHandle} />
            <Text style={styles.dropdownTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {options.map((opt) => {
                const isActive = value === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.dropdownOption,
                      isActive && styles.dropdownOptionActive,
                    ]}
                    onPress={() => {
                      onChange(opt.key);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dropdownOptionLeft}>
                      {opt.dotColor && (
                        <View
                          style={[styles.dropdownDot, { backgroundColor: opt.dotColor }]}
                        />
                      )}
                      {opt.icon && !opt.dotColor && (
                        <Ionicons
                          name={opt.icon as any}
                          size={16}
                          color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
                        />
                      )}
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          isActive && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons name="checkmark-circle" size={18} color="#708F96" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function TenantVisitorsPage() {
  const router = useRouter();
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const weatherHook = useWeather();
  const { colors: themeColors, isDark } = useTheme();

  // Theme-derived colors for the page
  const c = {
    text: themeColors.textPrimary,
    textSecondary: themeColors.textSecondary,
    textTertiary: themeColors.textTertiary,
    primary: themeColors.primary,
    bg: themeColors.background,
    surface: themeColors.surface,
    border: themeColors.border,
    cardBg: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
    cardBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    inputBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    inputBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    statusIn: themeColors.success,
    statusInBg: isDark ? 'rgba(52,199,89,0.15)' : 'rgba(52,199,89,0.1)',
    statusOut: isDark ? '#94A3B8' : '#6B7280',
    statusOutBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    overlayBg: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
  };

  // Filter state
  const [dateFilter, setDateFilter] = useState<DateFilter | 'all_time' | 'custom_date'>('today');
  const [customSelectedDate, setCustomSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pre-registration form state (Coming Soon)
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [purpose, setPurpose] = useState('');

  // Fetch visitors for this tenant
  const { data: rawVisitors, isLoading: isLoadingVisitors, refetch, isRefetching } = useQuery({
    queryKey: ['tenant_visitors', propertyId, user?.id, dateFilter, customSelectedDate.toISOString()],
    queryFn: async () => {
      // Map filter to server params
      let serverDateFilter: DateFilter;
      let customDate: string | undefined;

      if (dateFilter === 'all_time') {
        serverDateFilter = 'custom';
        customDate = '2000-01-01,2100-01-01';
      } else if (dateFilter === 'custom_date') {
        serverDateFilter = 'custom';
        const dateStr = format(customSelectedDate, 'yyyy-MM-dd');
        customDate = dateStr;
      } else {
        serverDateFilter = dateFilter as DateFilter;
        customDate = undefined;
      }

      const res = await vmsService.fetchVisitors(propertyId!, {
        dateFilter: serverDateFilter,
        customDate,
      });
      const allVisitors = res.data?.visitors || [];

      // Filter client-side for this tenant
      const userId = String(user?.id || '').trim();
      const userName = String(
        user?.user_metadata?.full_name || (user as any)?.full_name || ''
      ).trim().toLowerCase();
      const userEmail = String(user?.email || '').trim().toLowerCase();

      return allVisitors.filter((v) => {
        const whomToMeet = String(v.whom_to_meet || '').trim().toLowerCase();
        const uidMatch = !!v.whom_to_meet_uid && String(v.whom_to_meet_uid).trim() === userId;
        const nameMatch =
          !!userName &&
          whomToMeet &&
          (whomToMeet === userName || whomToMeet.includes(userName) || userName.includes(whomToMeet));
        const emailMatch = !!userEmail && whomToMeet && whomToMeet.includes(userEmail);
        return uidMatch || nameMatch || emailMatch;
      });
    },
    enabled: !!propertyId && !!user?.id,
    refetchOnMount: 'always',
  });

  // Apply client-side filters (status, category, search)
  const filteredVisitors = useMemo(() => {
    let list = rawVisitors || [];

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((v) => v.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      list = list.filter((v) => v.category === categoryFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.mobile || '').toLowerCase().includes(q) ||
          (v.coming_from || '').toLowerCase().includes(q) ||
          (v.purpose || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [rawVisitors, statusFilter, categoryFilter, searchQuery]);

  // Compute stats from filtered results
  const stats = useMemo(() => {
    const total = filteredVisitors.length;
    const checkedIn = filteredVisitors.filter((v) => v.status === 'checked_in').length;
    const checkedOut = filteredVisitors.filter((v) => v.status === 'checked_out').length;
    return { total, checkedIn, checkedOut };
  }, [filteredVisitors]);

  const handleSubmit = useCallback(async () => {
    Alert.alert('Coming Soon', 'Visitor pre-registration will be available soon.');
  }, []);

  const todayFormatted = format(new Date(), 'EEEE, dd MMM yyyy');
  const todayDate = new Date().toISOString().split('T')[0];
  const gradientColors = isDark
    ? ['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.85)']
    : ['rgba(248,250,252,0.95)', 'rgba(248,250,252,0.85)', 'rgba(248,250,252,0.95)'];

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <LinearGradient colors={gradientColors as any} style={StyleSheet.absoluteFillObject} />
      {weatherHook.weather && <WeatherBackground condition={weatherHook.weather.condition} />}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor="#708F96"
            colors={['#708F96']}
          />
        }
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: c.cardBg }]} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={c.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.text }]}>Visitor Management</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* ── Date Display ───────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(40).duration(400)} style={styles.dateDisplayWrap}>
          <Ionicons name="calendar-outline" size={16} color={c.primary} />
          <Text style={[styles.dateDisplayText, { color: c.textSecondary }]}>{todayFormatted}</Text>
        </Animated.View>

        {/* ── Filter Dropdowns Row ────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(80).duration(400)} style={styles.dropdownRow}>
          <FilterDropdown
            label="Date"
            icon="calendar-outline"
            options={
              dateFilter === 'custom_date'
                ? DATE_FILTERS.map((f) =>
                    f.key === 'custom_date'
                      ? { ...f, label: format(customSelectedDate, 'dd MMM yyyy') }
                      : f
                  )
                : DATE_FILTERS
            }
            value={dateFilter}
            onChange={(key) => {
              if (key === 'custom_date') {
                setShowDatePicker(true);
              }
              setDateFilter(key);
            }}
          />
          <FilterDropdown
            label="Status"
            icon="radio-button-on-outline"
            options={STATUS_FILTERS.map((f) => ({
              ...f,
              dotColor:
                f.key === 'checked_in' ? '#10B981' : f.key === 'checked_out' ? '#94A3B8' : '#708F96',
            }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterDropdown
            label="Category"
            icon="pricetag-outline"
            options={CATEGORY_FILTERS}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
        </Animated.View>

        {/* Custom Date Picker Modal */}
        <CustomDatePickerModal
          visible={showDatePicker}
          selectedDate={customSelectedDate}
          onSelect={(date) => {
            setCustomSelectedDate(date);
            setDateFilter('custom_date');
          }}
          onClose={() => setShowDatePicker(false)}
        />

        {/* ── Search Bar ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={[styles.searchWrap, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
          <Ionicons name="search-outline" size={18} color={c.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search by name, phone, purpose..."
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color={c.textTertiary} />
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── Summary Stats ──────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(240).duration(400)} style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
            <Text style={[styles.statValue, { color: c.primary }]}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: c.textTertiary }]}>Total</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
            <Text style={[styles.statValue, { color: c.statusIn }]}>{stats.checkedIn}</Text>
            <Text style={[styles.statLabel, { color: c.textTertiary }]}>Checked In</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
            <Text style={[styles.statValue, { color: c.statusOut }]}>{stats.checkedOut}</Text>
            <Text style={[styles.statLabel, { color: c.textTertiary }]}>Checked Out</Text>
          </View>
        </Animated.View>

        {/* ── Visitors List ──────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(280).duration(500)} style={styles.listSection}>
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            Visitors assigned to you
            {filteredVisitors.length > 0 ? ` (${filteredVisitors.length})` : ''}
          </Text>

          {isLoadingVisitors ? (
            <ActivityIndicator size="small" color={c.primary} style={{ marginVertical: 20 }} />
          ) : filteredVisitors.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-circle-outline" size={48} color={c.textTertiary} />
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                {searchQuery || statusFilter !== 'all' || categoryFilter !== 'all'
                  ? 'No visitors match your filters.'
                  : 'No visitors found for this period.'}
              </Text>
              {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all') && (
                <TouchableOpacity
                  style={[styles.clearFiltersBtn, { backgroundColor: `${c.primary}15`, borderColor: `${c.primary}30` }]}
                  onPress={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCategoryFilter('all');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={14} color={c.primary} />
                  <Text style={[styles.clearFiltersText, { color: c.primary }]}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredVisitors.map((visitor, index) => {
              const catColors = CATEGORY_COLORS[visitor.category] || CATEGORY_COLORS.other;
              const isCheckedIn = visitor.status === 'checked_in';
              const duration = getDuration(visitor.checkin_time, visitor.checkout_time);

              return (
                <Animated.View
                  key={visitor.id}
                  entering={FadeInUp.delay(300 + index * 40).duration(400)}
                >
                  <View style={[styles.visitorCard, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                    {/* Left: Avatar */}
                    <View style={[styles.visitorIcon, { backgroundColor: catColors.bg }]}>
                      <Ionicons name="person" size={20} color={catColors.text} />
                    </View>

                    {/* Center: Info */}
                    <View style={styles.visitorInfo}>
                      <View style={styles.visitorNameRow}>
                        <Text style={[styles.visitorName, { color: c.text }]} numberOfLines={1}>
                          {visitor.name}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: isCheckedIn ? c.statusInBg : c.statusOutBg },
                          ]}
                        >
                          <View
                            style={[
                              styles.statusDot,
                              { backgroundColor: isCheckedIn ? c.statusIn : c.statusOut },
                            ]}
                          />
                          <Text
                            style={[
                              styles.statusText,
                              { color: isCheckedIn ? c.statusIn : c.statusOut },
                            ]}
                          >
                            {isCheckedIn ? 'In' : 'Out'}
                          </Text>
                        </View>
                      </View>

                      {/* Date & Time */}
                      <View style={styles.metaRow}>
                        <Ionicons name="calendar-outline" size={12} color={c.textTertiary} />
                        <Text style={[styles.visitorMeta, { color: c.textSecondary }]}>
                          {format(new Date(visitor.checkin_time), 'EEE, MMM d · h:mm a')}
                        </Text>
                      </View>

                      {/* Category badge */}
                      <View style={styles.metaRow}>
                        <View style={[styles.categoryBadge, { backgroundColor: catColors.bg }]}>
                          <Text style={[styles.categoryText, { color: catColors.text }]}>
                            {visitor.category}
                          </Text>
                        </View>
                        {/* Duration */}
                        <View style={styles.durationWrap}>
                          <Ionicons
                            name="time-outline"
                            size={11}
                            color={c.textTertiary}
                          />
                          <Text style={[styles.durationText, { color: c.textTertiary }]}>{duration}</Text>
                        </View>
                      </View>

                      {/* Phone */}
                      {visitor.mobile && (
                        <View style={styles.metaRow}>
                          <Ionicons name="call-outline" size={12} color={c.textTertiary} />
                          <Text style={[styles.visitorMetaSecondary, { color: c.textTertiary }]}>{visitor.mobile}</Text>
                        </View>
                      )}

                      {/* Purpose */}
                      {visitor.purpose && (
                        <View style={styles.metaRow}>
                          <Ionicons
                            name="document-text-outline"
                            size={12}
                            color={c.textTertiary}
                          />
                          <Text style={[styles.visitorMetaSecondary, { color: c.textTertiary }]} numberOfLines={1}>
                            {visitor.purpose}
                          </Text>
                        </View>
                      )}

                      {/* Coming from */}
                      {visitor.coming_from && (
                        <View style={styles.metaRow}>
                          <Ionicons
                            name="navigate-outline"
                            size={12}
                            color={c.textTertiary}
                          />
                          <Text style={[styles.visitorMetaSecondary, { color: c.textTertiary }]} numberOfLines={1}>
                            {visitor.coming_from}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Animated.View>
              );
            })
          )}
        </Animated.View>

        {/* ── Pre-registration Form (Coming Soon) ────────────────── */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.introCard}>
          <SafeBlurView intensity={isDark ? 30 : 60} tint={isDark ? 'dark' : 'light'} style={[styles.introBlur, { borderColor: c.cardBorder }]}>
            <View style={[styles.comingSoonOverlay, { backgroundColor: c.overlayBg }]}>
              <View style={[styles.comingSoonBadge, { backgroundColor: c.primary }]}>
                <Text style={styles.comingSoonText}>COMING SOON</Text>
              </View>
            </View>

            <View style={styles.introContent}>
              <View style={[styles.introIcon, { backgroundColor: `${c.primary}20` }]}>
                <Ionicons name="people" size={28} color={c.primary} />
              </View>
              <Text style={[styles.introTitle, { color: c.text }]}>Pre-register Visitors</Text>
              <Text style={[styles.introDesc, { color: c.textSecondary }]}>
                Secure building access & visitor check-in system. Pre-register your guests for a
                smooth entry experience.
              </Text>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>Visitor Details</Text>

              <Text style={[styles.inputLabel, { color: c.textTertiary }]}>Full Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                placeholder="e.g., John Smith"
                placeholderTextColor={c.textTertiary}
                value={visitorName}
                editable={false}
              />

              <Text style={[styles.inputLabel, { color: c.textTertiary }]}>Phone Number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                placeholder="e.g., +1 234 567 8900"
                placeholderTextColor={c.textTertiary}
                keyboardType="phone-pad"
                value={visitorPhone}
                editable={false}
              />

              <Text style={[styles.sectionLabel, { marginTop: 20, color: c.textTertiary }]}>Visit Details</Text>

              <View style={styles.timeRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.inputLabel, { color: c.textTertiary }]}>Date *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={c.textTertiary}
                    value={visitDate}
                    editable={false}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.inputLabel, { color: c.textTertiary }]}>Time *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                    placeholder="HH:MM AM"
                    placeholderTextColor={c.textTertiary}
                    value={visitTime}
                    editable={false}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: c.textTertiary }]}>Purpose of Visit</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                placeholder="e.g., Business meeting"
                placeholderTextColor={c.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={false}
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: c.primary, opacity: 0.5 }]}
                onPress={handleSubmit}
                disabled={true}
                activeOpacity={0.8}
              >
                <Text style={styles.submitBtnText}>Submit Registration</Text>
              </TouchableOpacity>
            </View>
          </SafeBlurView>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Date display
  dateDisplayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    marginBottom: 16,
    gap: 8,
  },
  dateDisplayText: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },

  // Filter dropdowns
  dropdownRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    gap: 8,
    marginBottom: 12,
  },
  dropdownTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownTriggerText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dropdownSheet: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 0,
  },
  dropdownHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  dropdownTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  dropdownOptionActive: {
    backgroundColor: 'rgba(112,143,150,0.15)',
  },
  dropdownOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownOptionText: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  dropdownOptionTextActive: {
    color: '#FFFFFF',
  },
  dropdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: '#FFFFFF',
    padding: 0,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    gap: 10,
    marginBottom: 18,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  // List section
  listSection: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },

  // Visitor card
  visitorCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
    marginBottom: 12,
  },
  visitorIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  visitorInfo: {
    flex: 1,
  },
  visitorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  visitorName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Meta rows
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  visitorMeta: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  visitorMetaSecondary: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    color: 'rgba(255,255,255,0.38)',
    flex: 1,
  },

  // Category badge
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryText: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  durationWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  durationText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 12,
    textAlign: 'center',
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(112,143,150,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.3)',
  },
  clearFiltersText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '600',
    color: '#708F96',
  },

  // Pre-registration form (Coming Soon)
  introCard: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  introBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  comingSoonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonBadge: {
    backgroundColor: '#708F96',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    transform: [{ rotate: '-5deg' }],
  },
  comingSoonText: {
    fontFamily: FONT_DISPLAY,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  introContent: {
    padding: 20,
    alignItems: 'center',
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  introTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  introDesc: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
  },
  formSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  inputLabel: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  timeRow: {
    flexDirection: 'row',
  },
  submitBtn: {
    backgroundColor: '#708F96',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: {
    fontFamily: FONT_BODY,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
