// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { TicketCreateModal } from '@/components/tickets/TicketCreateModal';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Image,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from '@/hooks/useAuth';
import { useGamification } from '@/hooks/mst/useGamification';
import { queryKeys } from '@/utils/queryKeys';
import { useServerQuery } from '@/hooks/useServerQuery';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/utils/queryClient';
import SkeletonLoader from './lovable/SkeletonLoader';
import ContentSkeletonLoader from './lovable/ContentSkeletonLoader';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  runOnJS,
  interpolate,
  Extrapolate,
  FadeInUp,
  Easing,
  LinearTransition,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { XPBar } from '@/components/gamification/XPBar';
import { StreakChip } from '@/components/gamification/StreakChip';
import { Leaderboard } from '@/components/gamification/Leaderboard';
import { AchievementBadge } from '@/components/gamification/AchievementBadge';
import {
  defaultMstUser,
  defaultAchievements,
  defaultLeaderboard as demoLeaderboard,
  mapBadgesToAchievements,
  mapNextAchievementsToAchievements,
  type UserStats,
  type LeaderRow,
  type Achievement,
} from '@/lib/gamification';
import ChecklistProgressCard from '@/components/dashboard/ChecklistProgressCard';
import { GlassTile } from './DashboardComponents';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import SignOutModal from '@/components/ui/SignOutModal';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import NotificationModal from '@/components/notifications/NotificationModal';
import Toast from '@/components/ui/Toast';
import FloatingMenu from '@/components/ui/FloatingMenu';
import GlobalNavigationDrawer from '@/components/shared/GlobalNavigationDrawer';
import { Audio } from 'expo-av';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  raised_by?: string | null;
  assignee?: {
    full_name: string;
    email: string;
    user_photo_url?: string | null;
  } | null;
  creator?: { full_name: string } | null;
  photo_before_url?: string;
  sla_due_at?: string;
}

type Tab = 'dashboard' | 'daily' | 'profile';

interface Props {
  propertyId: string;
}

type MstDashboardQueryData = {
  property: { name: string } | null;
  tickets: Ticket[];
  isCheckedIn: boolean;
  checklistStats?: { completed: number; total: number };
};

const TICKET_TIME_FILTER_OPTIONS: Array<{ key: TimeFilter; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'This Month' },
  { key: 'all_time', label: 'All Time' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function TimeBlock({ val }: { val: number }) {
  return (
    <View style={styles.timeBlock}>
      <Text style={styles.timeBlockText}>{String(val).padStart(2, '0')}</Text>
    </View>
  );
}

function ProfileStat({
  icon,
  value,
  label,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tint: string;
}) {
  return (
    <View style={styles.profileStat}>
      <View style={[styles.profileStatIcon, { backgroundColor: tint + '30' }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

// ─── Ticket Stack (swipeable) ────────────────────────────────────────────────

const CARD_H = 210;
const PEEK_OFFSET = 10;
const MAX_STACK = 4;

interface TicketStackProps {
  tickets: Ticket[];
  propertyName?: string;
  onViewTicket?: (t: Ticket) => void;
}

function TicketStack({ tickets: initialTickets, propertyName, onViewTicket }: TicketStackProps) {
  const [order, setOrder] = useState(initialTickets);

  useEffect(() => {
    setOrder(initialTickets);
  }, [initialTickets]);

  const sendToBack = useCallback(() => {
    setOrder((prev) => {
      if (prev.length < 2) return prev;
      const [first, ...rest] = prev;
      return [...rest, first];
    });
  }, []);

  const visible = order.slice(0, MAX_STACK);
  const totalHeight = CARD_H + PEEK_OFFSET * (Math.min(visible.length, MAX_STACK) - 1) + 4;

  return (
    <View style={{ height: totalHeight + 16, marginBottom: 8 }}>
      {visible.map((t, i) => (
        <StackCard
          key={t.id}
          ticket={t}
          index={i}
          total={MAX_STACK}
          onSwipeComplete={sendToBack}
          propertyName={propertyName}
          onViewTicket={onViewTicket}
        />
      ))}
    </View>
  );
}

const StackCard = memo(function StackCard({
  ticket, index, total, onSwipeComplete, propertyName, onViewTicket
}: {
  ticket: Ticket;
  index: number;
  total: number;
  onSwipeComplete: () => void;
  propertyName?: string;
  onViewTicket?: (t: Ticket) => void;
}) {
  const isTop = index === 0;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (!isTop) {
      // When card is sent to the back, smoothly reset its internal swipe state
      // after a tiny delay so it's hidden while resetting
      const timeout = setTimeout(() => {
        translateX.value = 0;
        translateY.value = 0;
        rotate.value = 0;
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [isTop]);

  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      if (!isTop) return;
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.3;
      rotate.value = interpolate(e.translationX, [-SCREEN_W, 0, SCREEN_W], [-12, 0, 12], Extrapolate.CLAMP);
    })
    .onEnd((e) => {
      if (!isTop) return;
      const shouldDismiss = Math.abs(e.translationX) > 80 || Math.abs(e.velocityX) > 600;
      if (shouldDismiss) {
        const dest = e.translationX > 0 ? SCREEN_W * 1.4 : -SCREEN_W * 1.4;
        translateX.value = withTiming(dest, { duration: 200 }, () => {
          runOnJS(onSwipeComplete)();
        });
        translateY.value = withTiming(e.translationY * 0.5, { duration: 200 });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 130 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 130 });
        rotate.value = withSpring(0, { damping: 18, stiffness: 130 });
      }
    });
  const maxOffset = (total - 1) * 16;
  const yOffset = maxOffset - (index * 16);
  const scale = 1 - index * 0.05;
  const bgOpacity = 1 - index * 0.15;
  const zIndex = total - index;

  const animStyle = useAnimatedStyle(() => {
    return {
      top: withSpring(yOffset, { damping: 18, stiffness: 130 }),
      transform: [{ scale: withSpring(scale, { damping: 18, stiffness: 130 }) }],
      opacity: withSpring(bgOpacity, { damping: 18, stiffness: 130 }),
    };
  }, [yOffset, scale, bgOpacity]);

  const panStyle = useAnimatedStyle(() => {
    if (!isTop) return { transform: [] };
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate.value}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.tcStackSlot,
        animStyle,
        { zIndex },
      ]}
      pointerEvents={isTop ? 'auto' : 'none'}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, panStyle]}>
          <TicketCard ticket={ticket} propertyName={propertyName} onView={() => onViewTicket?.(ticket)} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
});

// ─── Gemini animated gradient border wrapper ───────────────────────────────

const GEMINI_COLORS: readonly [string, string, ...string[]] = [
  '#3B82F6', '#06B6D4', '#0EA5E9', '#2DD4BF', '#3B82F6',
];

function GeminiCardBorder({ children }: { children: React.ReactNode }) {
  const angle = useSharedValue(0);

  useEffect(() => {
    angle.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }));

  return (
    <View style={geminiStyles.outer}>
      {/* Spinning gradient — acts as the border */}
      <Animated.View style={[geminiStyles.gradientSpin, spinStyle]} pointerEvents="none">
        <LinearGradient
          colors={GEMINI_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {/* Inner card inset to expose 1.5px border */}
      <View style={geminiStyles.inner}>
        {children}
      </View>
    </View>
  );
}

const geminiStyles = StyleSheet.create({
  outer: {
    borderRadius: 22,
    overflow: 'hidden',
    flex: 1,
    padding: 1.5,           // this 1.5px gap shows the spinning gradient
    position: 'relative',
  },
  gradientSpin: {
    position: 'absolute',
    width: '250%',
    height: '250%',
    top: '-75%',
    left: '-75%',
  },
  inner: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(47, 47, 48, 0.90)', // Glassy #2f2f30
  },
});

interface TicketCardProps {
  ticket: Ticket;
  propertyName?: string;
  onView?: () => void;
}

const TicketCard = React.memo(function TicketCard({ ticket, propertyName, onView }: TicketCardProps) {
  // ── Priority badge ──
  const getPriorityStyle = () => {
    switch (ticket.priority?.toLowerCase()) {
      case 'urgent':
      case 'critical':
        return { bg: 'rgba(239,68,68,0.25)', text: '#FCA5A5', label: 'URGENT' };
      case 'high':
        return { bg: 'rgba(20,184,166,0.25)', text: '#2DD4BF', label: 'HIGH' };
      case 'medium':
        return { bg: 'rgba(251,191,36,0.20)', text: '#FCD34D', label: 'MEDIUM' };
      case 'low':
        return { bg: 'rgba(99,102,241,0.20)', text: '#A5B4FC', label: 'LOW' };
      default:
        return { bg: 'rgba(148,163,184,0.15)', text: '#94A3B8', label: (ticket.priority || 'NORMAL').toUpperCase() };
    }
  };

  const pStyle = getPriorityStyle();

  const statusLabel = ticket.status
    ? ticket.status.replace(/_/g, ' ').toUpperCase()
    : 'OPEN';

  // Running time (time elapsed since creation)
  const runningMs = ticket.created_at ? Date.now() - new Date(ticket.created_at).getTime() : 0;
  const runDays = Math.floor(runningMs / 86400000);
  const runHrs = Math.floor((runningMs % 86400000) / 3600000);
  const runMins = Math.floor((runningMs % 3600000) / 60000);
  const runningStr = runningMs > 0 ? `${runDays}d ${runHrs}h ${runMins}m` : null;

  const formattedDate = ticket.created_at
    ? new Date(ticket.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const handleShare = async () => {
    try {
      const msg = `🎫 Ticket: ${ticket.title}\n📋 ${ticket.ticket_number}\n📊 Priority: ${ticket.priority} | Status: ${statusLabel}\n👤 Raised By: ${ticket.creator?.full_name || 'Unknown'}`;
      await Share.share({
        message: msg,
        title: `Ticket ${ticket.ticket_number}`,
      });
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  return (
    <View style={[styles.tcCard, { 
      backgroundColor: '#121212', 
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.25)'
    }]}>
        {/* ── Row 1: Thumb | Title + Badges | Action icons ── */}
        <View style={styles.tcRow1}>
          {/* Thumbnail */}
          <View style={styles.tcThumbBox}>
            {ticket.photo_before_url ? (
              <Image source={{ uri: ticket.photo_before_url }} style={styles.tcThumb} resizeMode="cover" />
            ) : (
              <View style={styles.tcThumbFallback}>
                <Ionicons name="image" size={24} color="rgba(255,255,255,0.25)" />
              </View>
            )}
          </View>

          {/* Title + badges */}
          <View style={styles.tcMiddle}>
            <Text style={styles.tcTitle} numberOfLines={2}>{ticket.title}</Text>
            <View style={styles.tcBadgeRow}>
              <View style={[styles.tcBadge, { backgroundColor: pStyle.bg }]}>
                <Text style={[styles.tcBadgeText, { color: pStyle.text }]}>{pStyle.label}</Text>
              </View>
              <View style={[styles.tcBadge, styles.tcBadgeDark]}>
                <Text style={styles.tcBadgeDarkText}>{statusLabel}</Text>
              </View>
            </View>
          </View>

          {/* Action icons — Share */}
          <View style={styles.tcIconCol}>
            <TouchableOpacity style={styles.tcIconBtn} onPress={handleShare} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={15} color="rgba(255,255,255,0.70)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Row 2: Raised By ── */}
        <View style={styles.tcMetaRow}>
          <Text style={styles.tcMetaLabel}>Raised By:</Text>
          <Text style={styles.tcMetaValue} numberOfLines={1}>
            {ticket.creator?.full_name || 'Unknown'}
          </Text>
        </View>

        {/* ── Row 3: Serving (Assigned To) ── */}
        <View style={styles.tcMetaRow}>
          <Text style={styles.tcMetaLabel}>Serving:</Text>
          <View style={styles.tcMhPill}>
            <Text style={styles.tcMhPillText}>MH</Text>
          </View>
          <Text style={styles.tcMetaValue} numberOfLines={1}>
            {ticket.assignee?.full_name || 'Unassigned'}
          </Text>
        </View>

        {/* ── Divider ── */}
        <View style={styles.tcDivider} />

        {/* ── Footer: Ticket ID / Date + Timer + View Btn ── */}
        <View style={styles.tcFooter}>
          <Text style={styles.tcFooterTkt}>{ticket.ticket_number} • {formattedDate}</Text>
          <View style={styles.tcSlaRow}>
            <Ionicons name="time-outline" size={12} color="#F87171" />
            <Text style={[styles.tcSlaText, { color: '#FCA5A5' }]}>
              {runningStr ? runningStr : '0m'}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.tcViewBtn} onPress={onView} activeOpacity={0.8}>
            <Text style={styles.tcViewBtnText}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
  );
});

// ─── CountdownTimer (extracted to prevent full dashboard re-render every second) ──
// Owns its own state so parent doesn't re-render on every tick.

const CountdownTimer = memo(function CountdownTimer() {
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const [s, setS] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const ms = Math.max(0, end.getTime() - now.getTime());
      setH(Math.floor(ms / 3600000));
      setM(Math.floor((ms % 3600000) / 60000));
      setS(Math.floor((ms % 60000) / 1000));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.countdownBlocks}>
      <TimeBlock val={h} />
      <Text style={styles.countdownColon}>:</Text>
      <TimeBlock val={m} />
      <Text style={styles.countdownColon}>:</Text>
      <TimeBlock val={s} />
    </View>
  );
});

// ─── Main Dashboard ──────────────────────────────────────────────────────────

type TimeFilter = 'today' | 'month' | 'all_time';
type ScopeFilter = 'property' | 'my_tasks';

function getCountDateRange(timeFilter: TimeFilter) {
  if (timeFilter === 'all_time') return {};
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (timeFilter === 'today') {
    const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return { dateFrom: `${d}T00:00:00+05:30`, dateTo: `${d}T23:59:59+05:30` };
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const d = `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}-${pad(monthStart.getDate())}`;
  return { dateFrom: `${d}T00:00:00+05:30` };
}

async function fetchTicketCountBatch(
  propertyId: string,
  scopeFilter: ScopeFilter,
  timeFilter: TimeFilter,
  userId?: string,
) {
  const dateRange = getCountDateRange(timeFilter);
  const baseParams: Record<string, string> = {
    propertyId,
    limit: '1',
    ...dateRange,
  };
  if (scopeFilter === 'my_tasks' && userId) {
    baseParams.userId = userId;
  }

  const OPEN_STATUSES = 'open,waitlist,assigned,in_progress';
  const CLOSED_STATUSES = 'closed,completed,resolved,pending_validation';

  const [totalRes, openRes, closedRes] = await Promise.all([
    serverApi.get<{ tickets: any[]; total: number }>('/api/tickets', { ...baseParams }),
    serverApi.get<{ tickets: any[]; total: number }>('/api/tickets', { ...baseParams, status: OPEN_STATUSES }),
    serverApi.get<{ tickets: any[]; total: number }>('/api/tickets', { ...baseParams, status: CLOSED_STATUSES }),
  ]);

  const getTotal = (res: any) =>
    typeof (res?.data as any)?.total === 'number'
      ? (res?.data as any).total
      : ((res?.data as any)?.tickets?.length ?? 0);

  return {
    total: getTotal(totalRes),
    open: getTotal(openRes),
    closed: getTotal(closedRes),
  };
}

export default function LovableStaffDashboard({ propertyId }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut, membership } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [isCheckingInOut, setIsCheckingInOut] = useState(false);

  // ── Time & scope filters (slice local cache — no extra network requests) ──
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all_time');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('my_tasks');



  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toastConfig, setToastConfig] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });

  // Gamification
  const { leaderboard: gamifyLb, myStats } = useGamification(propertyId);

  // ── Server Query ──
  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useServerQuery<{
    property: { name: string } | null;
    tickets: Ticket[];
    isCheckedIn: boolean;
    checklistStats?: { completed: number; total: number };
  }>(
    [...queryKeys.property.mstDashboardLovable(propertyId), scopeFilter, user?.id || ''],
    async () => {
      const [propRes, ticketRes, shiftRes, checklistRes] = await Promise.all([
        serverApi.query<{ name: string }[]>({
          table: 'properties',
          action: 'select',
          select: 'name',
          filters: [{ op: 'eq', column: 'id', value: propertyId }],
          limit: 1,
        }),
        serverApi.get<{ tickets: Ticket[]; total: number }>('/api/tickets', {
          propertyId,
          limit: '100',
          ...(scopeFilter === 'my_tasks' && user?.id ? { userId: user.id } : {}),
        }),
        serverApi.query<{ is_checked_in: boolean }[]>({
          table: 'resolver_stats',
          action: 'select',
          select: 'is_checked_in',
          filters: [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'eq', column: 'user_id', value: user?.id ?? '' },
          ],
          limit: 1,
        }),
        serverApi.get<{ templates: any[] }>('/api/checklist', { propertyId }),
      ]);

      let totalChecklists = 0;
      let completedChecklists = 0;
      const todayStr = new Date().toISOString().split('T')[0];

      if (checklistRes.data?.templates) {
        checklistRes.data.templates.forEach((t) => {
          if (t.frequency?.toLowerCase() === 'daily') {
            totalChecklists++;
            const todaysCompletion = t.completions?.find((c: any) => c.completion_date === todayStr || c.created_at?.startsWith(todayStr));
            if (todaysCompletion && todaysCompletion.status === 'completed') {
              completedChecklists++;
            }
          }
        });
      }

      return {
        property: propRes.data?.[0] ?? null,
        tickets: (ticketRes.data as any)?.tickets ?? ticketRes.data ?? [],
        isCheckedIn: shiftRes.data?.[0]?.is_checked_in ?? false,
        checklistStats: { completed: completedChecklists, total: totalChecklists },
      };
    },
    { staleTime: 1000 * 60 * 5, refetchOnMount: false }
  );



  const hasValidDashboardData =
    !!data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray((data as { tickets?: unknown }).tickets);

  const property = hasValidDashboardData ? data.property ?? null : null;
  const tickets = hasValidDashboardData ? data.tickets : [];
  const isCheckedIn = hasValidDashboardData ? !!data.isCheckedIn : false;
  const leaderboardData = Array.isArray(gamifyLb) ? gamifyLb : [];

  // Filtered tickets — sliced locally from cached/server data, no extra network call
  const filteredTickets = useMemo(() => {
    let result = [...tickets];
    if (scopeFilter === 'my_tasks') {
      result = result.filter(t => t.assigned_to === user?.id || t.raised_by === user?.id);
    }
    if (timeFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      result = result.filter(t => t.created_at?.startsWith(today));
    } else if (timeFilter === 'month') {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      result = result.filter(t => new Date(t.created_at ?? 0) >= monthStart);
    }
    return result;
  }, [tickets, timeFilter, scopeFilter, user?.id]);

  // Exact ticket counts — not capped by the 100-row list limit
  const { data: exactTicketCounts } = useQuery({
    queryKey: ['mst-dashboard-ticket-counts', propertyId, scopeFilter, timeFilter, user?.id || ''],
    queryFn: () => fetchTicketCountBatch(propertyId, scopeFilter, timeFilter, user?.id),
    enabled: !!propertyId,
    staleTime: 1000 * 60 * 5,
  });

  const shuffledTickets = useMemo(() => {
    // Only show open tickets on shuffled cards
    const openTickets = filteredTickets.filter(t => 
      ['open', 'waitlist', 'assigned', 'in_progress'].includes(t.status?.toLowerCase())
    );
    const next = [...openTickets];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const swapIndex = Math.floor(Math.random() * (i + 1));
      [next[i], next[swapIndex]] = [next[swapIndex], next[i]];
    }
    return next;
  }, [filteredTickets]);

  useEffect(() => {
    hasRequestedPermissions().then(requested => {
      if (!requested) setShowPermissionOnboarding(true);
    });
  }, []);

  useEffect(() => {
    if (propertyId && !hasValidDashboardData && !isFetching) {
      refetch();
    }
  }, [propertyId, hasValidDashboardData, isFetching, refetch]);

  const onRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['mst-dashboard-ticket-counts'] });
  };

  // ── Shift toggle ──
  const toggleShift = useCallback(async () => {
    if (!user?.id || !propertyId || isCheckingInOut) return;
    setIsCheckingInOut(true);
    const newStatus = !isCheckedIn;

    // Optimistically update React Query cache
    queryClient.setQueryData(
      queryKeys.property.mstDashboardLovable(propertyId),
      (old: MstDashboardQueryData | undefined) =>
        old ? { ...old, isCheckedIn: newStatus } : old
    );

    try {
      // Use the dedicated API endpoint like Staff dashboard does
      await serverApi.post(`/api/users/shift-status?propertyId=${propertyId}`, {
        is_checked_in: newStatus
      });

      try {
        const { sound } = await Audio.Sound.createAsync({
          uri: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
        });
        await sound.playAsync();
      } catch (err) {
        console.warn('Audio play failed:', err);
      }

      setToastConfig({
        visible: true,
        message: `You are now ${newStatus ? 'ON DUTY' : 'OFF DUTY'}.`,
        type: 'success'
      });
    } catch (error: any) {
      // Revert on error
      queryClient.setQueryData(
        queryKeys.property.mstDashboardLovable(propertyId),
        (old: MstDashboardQueryData | undefined) =>
          old ? { ...old, isCheckedIn: !newStatus } : old
      );
      setToastConfig({
        visible: true,
        message: error.message || 'Failed to update shift',
        type: 'error'
      });
    } finally {
      setIsCheckingInOut(false);
    }
  }, [isCheckedIn, propertyId, user?.id, isCheckingInOut]);

  // ── Stats ──
  // Use exact counts fetched with limit:1 so properties with >100 tickets still report the true totals.
  const localStats = useMemo(() => {
    const total = filteredTickets.length;
    const open = filteredTickets.filter((t) =>
      ['open', 'waitlist', 'assigned', 'in_progress'].includes(t.status?.toLowerCase())
    ).length;
    const closed = filteredTickets.filter((t) =>
      ['closed', 'completed', 'resolved', 'pending_validation'].includes(t.status?.toLowerCase())
    ).length;
    return { total, open, closed };
  }, [filteredTickets]);
  const stats = exactTicketCounts ?? localStats;

  // ── Gamification user ──
  const mstUser: UserStats = useMemo(() => {
    if (!myStats) return defaultMstUser;
    return {
      name: user?.user_metadata?.full_name || 'MST User',
      initials: (user?.user_metadata?.full_name || 'U')
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
      level: 1 + Math.floor((myStats.all_time?.total_points ?? 0) / 1000),
      levelName: 'Field Master',
      xp: myStats.today?.total_points ?? 0,
      xpForNext: 500,
      totalXp: myStats.all_time?.total_points ?? 0,
      streak: myStats.streak?.current ?? 0,
      weeklyRank: myStats.today?.rank ?? 1,
      weeklyTotal: myStats.today?.total_in_rank ?? 1,
    };
  }, [myStats, user]);

  const achievements: Achievement[] = useMemo(() => {
    if (!myStats) return defaultAchievements;
    return [
      ...mapBadgesToAchievements(myStats.badges),
      ...mapNextAchievementsToAchievements(myStats.next_achievements),
    ];
  }, [myStats]);

  // ── Leaderboard rows ──
  const leaderboardRows: LeaderRow[] = useMemo(() => {
    if (leaderboardData.length === 0) return demoLeaderboard;
    return leaderboardData.map((entry, i) => ({
      rank: i + 1,
      name: entry.name || 'Staff',
      initials: (entry.name || 'S').charAt(0).toUpperCase(),
      property: property?.name || 'Property',
      xp: entry.score ?? 0,
      resolved: entry.tickets_resolved ?? 0,
      streak: entry.streak_days ?? 0,
      isMe: entry.user_id === user?.id,
      user_id: entry.user_id,
    }));
  }, [leaderboardData, property, user?.id]);

  const champion: LeaderRow | undefined = leaderboardRows[0];

  // ── Tabs ──

  const renderMyDashboard = () => (
    <>
      {/* Gamification strip */}
      <Animated.View  style={styles.gamifyCard}>
        <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.gamifyInner}>
          <LevelBadge level={mstUser.level} size="md" />
          <View style={styles.gamifyMeta}>
            <View style={styles.gamifyMetaTop}>
              <Text style={styles.gamifyLevelName}>{mstUser.levelName}</Text>
              <View style={styles.gamifyChips}>
                <StreakChip streak={mstUser.streak} />
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>#{mstUser.weeklyRank}</Text>
                </View>
              </View>
            </View>
            <View style={styles.gamifyXp}>
              <XPBar xp={mstUser.xp} xpForNext={mstUser.xpForNext} />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Stats card matching Property Admin */}
      <GlassTile label="Tickets" icon="ticket" delay={80} style={{ marginHorizontal: 0 }}>
        <View style={{ gap: 8, marginBottom: 16 }}>
          {/* Scope filter */}
          <View style={styles.timeToggleRow}>
            <TouchableOpacity
              style={[styles.timeToggleBtn, scopeFilter === 'property' && styles.timeToggleBtnActive]}
              onPress={() => setScopeFilter('property')}
              activeOpacity={0.7}
            >
              <Text style={[styles.timeToggleText, scopeFilter === 'property' && styles.timeToggleTextActive]}>Property Level</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.timeToggleBtn, scopeFilter === 'my_tasks' && styles.timeToggleBtnActive]}
              onPress={() => setScopeFilter('my_tasks')}
              activeOpacity={0.7}
            >
              <Text style={[styles.timeToggleText, scopeFilter === 'my_tasks' && styles.timeToggleTextActive]}>My Tasks</Text>
            </TouchableOpacity>
          </View>

          {/* Time filter */}
          <View style={[styles.timeToggleRow, { marginBottom: 0 }]}>
            {TICKET_TIME_FILTER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.timeToggleBtn, timeFilter === option.key && styles.timeToggleBtnActive]}
                onPress={() => setTimeFilter(option.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timeToggleText, timeFilter === option.key && styles.timeToggleTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ alignItems: 'flex-start' }}>
            <AnimatedNumber style={styles.tileMetricMid} value={stats.total} />
            <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>TOTAL</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <AnimatedNumber style={[styles.tileMetricMid, { color: '#FCA5A5' }]} value={stats.open} />
            <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>OPEN</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AnimatedNumber style={[styles.tileMetricMid, { color: '#10B981' }]} value={stats.closed} />
            <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>CLOSED</Text>
          </View>
        </View>
      </GlassTile>

      <View style={{ marginTop: 24 }}>
        <View style={[styles.sectionHeader, { marginTop: 0 }]}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF', letterSpacing: 1 }}>RECENT TICKETS</Text>
          <TouchableOpacity onPress={() => router.push(`/property/${propertyId}/tickets` as any)}>
            <Text style={{ fontSize: 12, color: '#FFFFFF' }}>View All</Text>
          </TouchableOpacity>
        </View>
        {isLoading || isFetching ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ActivityIndicator color="rgba(255,255,255,0.6)" />
          </View>
        ) : shuffledTickets.length > 0 ? (
          <TicketStack
            tickets={shuffledTickets.slice(0, 5)}
            propertyName={property?.name}
            onViewTicket={(t) => router.push({ pathname: '/property/[propertyId]/tickets/[id]', params: { propertyId, id: t.id } } as any)}
          />
        ) : (
          <View style={styles.ticketStackEmpty}>
            <Text style={styles.ticketStackEmptyText}>No tickets for this filter</Text>
          </View>
        )}
      </View>

      <ChecklistProgressCard completed={data?.checklistStats?.completed ?? 0} total={data?.checklistStats?.total ?? 0} delay={280} style={{ marginHorizontal: 0 }} />
    </>
  );

  const renderDailyBoard = () => (
    <>
      <Animated.View >
        <Text style={styles.heroTitle}>Daily Board</Text>
      </Animated.View>

      <Animated.View  style={styles.countdownCard}>
        <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.countdownInner}>
          <View style={styles.countdownLabelRow}>
            <Ionicons name="time" size={12} color="rgba(255,255,255,0.60)" />
            <Text style={styles.countdownLabel}>Time left today</Text>
          </View>
          <CountdownTimer />
          <Text style={styles.countdownHint}>Resolve more tickets to climb the board</Text>
        </View>
      </Animated.View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>Today's Standings</Text>
      </View>

      <Leaderboard rows={leaderboardRows} />
    </>
  );

  const renderProfile = () => {
    const unlocked = achievements.filter((a) => a.unlocked);
    const locked = achievements.filter((a) => !a.unlocked);
    const myRow = leaderboardRows.find((r) => r.isMe) ?? leaderboardRows[0];

    return (
      <>
        {/* Identity card */}
        <Animated.View  style={styles.identityCard}>
          <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.identityInner}>
            <View style={styles.identityTop}>
              <LinearGradient
                colors={['#7C5CFA', '#5B3FD6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.identityAvatar}
              >
                <Text style={styles.identityAvatarText}>{mstUser.initials}</Text>
                <View style={styles.identityLevel}>
                  <LevelBadge level={mstUser.level} size="sm" />
                </View>
              </LinearGradient>
              <View style={styles.identityInfo}>
                <Text style={styles.identityName}>{mstUser.name}</Text>
                <Text style={styles.identityLevelName}>{mstUser.levelName}</Text>
                <View style={styles.identityChips}>
                  <StreakChip streak={mstUser.streak} />
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>Rank #{mstUser.weeklyRank}</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.identityXp}>
              <XPBar xp={mstUser.xp} xpForNext={mstUser.xpForNext} />
              <Text style={styles.identityXpHint}>
                {mstUser.xpForNext - mstUser.xp} XP to level {mstUser.level + 1}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Lifetime stats */}
        <View style={styles.profileStatsGrid}>
          <ProfileStat icon="trophy" value={mstUser.totalXp.toLocaleString()} label="TOTAL XP" tint="#FBBF24" />
          <ProfileStat icon="checkmark-circle" value={String(myRow?.resolved ?? 0)} label="RESOLVED" tint="#34D399" />
          <ProfileStat icon="flag" value={`${unlocked.length}/${achievements.length}`} label="BADGES" tint="#60A5FA" />
        </View>

        {/* Achievements */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>Achievements</Text>
          <Text style={styles.sectionHeaderHint}>
            {unlocked.length} of {achievements.length} unlocked
          </Text>
        </View>
        <View style={styles.achievementsGrid}>
          {[...unlocked, ...locked].map((a, i) => (
            <AchievementBadge key={a.id} achievement={a} delay={i * 0.05} />
          ))}
        </View>
      </>
    );
  };

  const orgId = membership?.org_id ?? '';

  // Show header shell instantly (from cached membership) with skeleton content below
  const isDataReady = !!data;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <WeatherBackground condition={undefined} />

      <Animated.View  style={[styles.shellHeader, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity 
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => setShowDrawer(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <TouchableOpacity style={styles.profileRow} activeOpacity={0.7} onPress={() => setActiveTab('profile')}>
              <LinearGradient
                colors={['#8B5CF6', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerAvatar}
              >
                <Text style={styles.avatarText}>
                  {user?.user_metadata?.full_name
                    ? user.user_metadata.full_name.split(' ').map((name: string) => name[0]).join('').toUpperCase().slice(0, 2)
                    : mstUser.initials}
                </Text>
              </LinearGradient>
              <View style={[styles.nameContainer, { flex: 1 }]}>
                <Text style={styles.greetingName} numberOfLines={1}>
                  Hey, {(user?.user_metadata?.full_name || mstUser.name).split(' ')[0]}
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {property?.name || 'MST Portal'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={[styles.headerRight, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <TouchableOpacity 
              style={[
                styles.headerIconBtn, 
                { 
                  backgroundColor: isCheckedIn ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.10)',
                  borderColor: isCheckedIn ? 'rgba(16,185,129,0.3)' : 'transparent',
                  borderWidth: 1,
                }
              ]} 
              onPress={toggleShift} 
              activeOpacity={0.7}
              disabled={isCheckingInOut}
            >
              {isCheckingInOut ? (
                <ActivityIndicator size="small" color={isCheckedIn ? '#34D399' : '#FFFFFF'} />
              ) : (
                <Ionicons 
                  name={isCheckedIn ? 'briefcase' : 'briefcase-outline'} 
                  size={20} 
                  color={isCheckedIn ? '#34D399' : '#FFFFFF'} 
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowCreate(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowNotifications(true)} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
              <View style={styles.notificationBadge} />
            </TouchableOpacity>
          </View>
        </Animated.View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        {/* Tab content */}
        <View style={styles.tabContent}>
          {!isDataReady ? (
            <ContentSkeletonLoader />
          ) : (
            <>
              {activeTab === 'dashboard' && renderMyDashboard()}
              {activeTab === 'daily' && renderDailyBoard()}
              {activeTab === 'profile' && renderProfile()}
            </>
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <TicketCreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} propertyId={propertyId} organizationId={orgId} />
      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
      <GlobalNavigationDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        propertyId={propertyId ?? ''}
      />
      <NotificationModal visible={showNotifications} onClose={() => setShowNotifications(false)} propertyId={propertyId} />
      <PermissionOnboarding visible={showPermissionOnboarding} onComplete={() => setShowPermissionOnboarding(false)} />

      <Toast 
        {...toastConfig} 
        onClose={() => setToastConfig(prev => ({ ...prev, visible: false }))} 
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tileMetricMid: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  tileSubtext: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  container: {
    flex: 1,
    backgroundColor: '#4A1A1A',
  },
  scroll: {
    flex: 1,
    zIndex: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
  },

  // Shell header
  shellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  hamburgerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: 16,
    marginRight: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  nameContainer: {
    marginLeft: 12,
    minWidth: 0,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },

  // Shell drawer
  drawerPanel: {
    width: 288,
    backgroundColor: 'rgba(11, 17, 25, 0.98)',
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  drawerLogoContainer: {
    flex: 1,
  },
  drawerLogo: {
    width: 180,
    height: 42,
  },
  drawerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  drawerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  drawerSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  drawerItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  drawerSignOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  drawerSignOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatarGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  greeting: {
    flex: 1,
    minWidth: 0,
  },
  greetingName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  greetingTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 1,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },

  // Tab content
  tabContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Hero title
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    lineHeight: 34,
    letterSpacing: -0.5,
  },

  // Gamification strip
  gamifyCard: {
    marginTop: 20,
    marginBottom: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  gamifyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  gamifyMeta: {
    flex: 1,
    minWidth: 0,
  },
  gamifyMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gamifyLevelName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gamifyChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.20)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rankBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FDE68A',
  },
  gamifyXp: {
    marginTop: 8,
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: 'rgba(99,102,241,0.35)',
    borderColor: 'rgba(99,102,241,0.50)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  timeToggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 4,
    width: '100%',
  },
  timeToggleBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeToggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  timeToggleText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  timeToggleTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },

  // Stats card
  statsCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  statsCardInner: {
    padding: 16,
  },
  ticketStackSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  ticketStackTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  ticketStackEmpty: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ticketStackEmptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
  },
  statsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  customizeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statsWide: {
    marginTop: 12,
  },
  statTile: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    position: 'relative',
  },
  statTileWide: {
    paddingVertical: 24,
  },
  statTileGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    opacity: 0.4,
  },
  statTileValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  statTileLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.70)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  sectionHeaderHint: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 0.5,
  },

  // ─── Ticket Card (screenshot-style: dark teal) ────────────────────────────
  tcStackSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: CARD_H,
  },
  // Card shell — bg handled by GeminiCardBorder.inner (#1B3040)
  tcCard: {
    flex: 1,
    backgroundColor: 'transparent',
    padding: 14,
    gap: 6,
  },
  // Row 1: thumb | title+badges | icons
  tcRow1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tcThumbBox: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tcThumb: {
    width: 64,
    height: 64,
  },
  tcThumbFallback: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tcMiddle: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  tcTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 18,
  },
  tcBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tcBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tcBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tcBadgeDark: {
    backgroundColor: 'rgba(30,41,59,0.80)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tcBadgeDarkText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.3,
  },
  // Two vertically-stacked icon buttons — top right
  tcIconCol: {
    gap: 6,
    flexShrink: 0,
  },
  tcIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Meta rows (Raised By / Serving)
  tcMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tcMetaLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    width: 62,
  },
  tcMetaValue: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    flex: 1,
  },
  // "MH" pill
  tcMhPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tcMhPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.5,
  },
  // Thin divider
  tcDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  // Footer
  tcFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tcFooterTkt: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    fontWeight: '500',
  },
  tcSlaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tcSlaText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tcViewBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
    flexShrink: 0,
  },
  tcViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Legacy (unused but kept to avoid TS errors)
  tcTopRow: { flexDirection: 'row' },
  tcThumbPlaceholder: {},
  tcContent: { flex: 1 },
  tcActionCol: { gap: 6 },
  tcMetaSection: { gap: 4 },
  tcServingPill: { backgroundColor: '#1E293B', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tcServingPillText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  tcFooterId: { fontSize: 10, color: 'rgba(255,255,255,0.4)', flex: 1 },

  // Legacy (kept for safety)
  ticketCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(30,30,50,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 60,
    elevation: 20,
    overflow: 'hidden',
  },
  ticketCardInner: {
    padding: 16,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ticketIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(60,60,90,0.50)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  ticketId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ticketDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 2,
  },
  ticketHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ticketActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  ticketBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ticketBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  ticketAssignee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  ticketAssigneeAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketAssigneeInitials: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ticketAssigneeName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)',
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  ticketFooterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  ticketSlaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.20)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  ticketSlaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FCA5A5',
  },
  ticketScore: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ticketActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  ticketViewBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  ticketViewBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ticketAcceptBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  ticketAcceptBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.90)',
  },

  // Daily board
  countdownCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  countdownInner: {
    padding: 20,
    alignItems: 'center',
  },
  countdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countdownLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  countdownBlocks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  timeBlock: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  timeBlockText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  countdownColon: {
    fontSize: 24,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.30)',
  },
  countdownHint: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },

  // Live flow
  championCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  championInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  championAvatarWrap: {
    position: 'relative',
  },
  championAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  championAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  crownBadge: {
    position: 'absolute',
    top: -10,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  championInfo: {
    flex: 1,
    minWidth: 0,
  },
  championLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FDE68A',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  championName: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  championMeta: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
  },
  // Profile
  identityCard: {
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  identityInner: {
    padding: 20,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  identityAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    shadowColor: '#7C5CFA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 12,
    position: 'relative',
  },
  identityAvatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  identityLevel: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },
  identityInfo: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  identityLevelName: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
  },
  identityChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  identityXp: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  identityXpHint: {
    marginTop: 8,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },
  profileStatsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  profileStat: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
  },
  profileStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileStatValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileStatLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },

  // Ask Cassandra
  askCassandraWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
  },
  askCassandraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  askCassandraLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  askCassandraOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

