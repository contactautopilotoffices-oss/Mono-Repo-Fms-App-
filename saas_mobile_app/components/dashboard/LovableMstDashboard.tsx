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
import { queryClient } from '@/utils/queryClient';
import SkeletonLoader from './lovable/SkeletonLoader';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
  FadeInUp,
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
  type UserStats,
  type LeaderRow,
} from '@/lib/gamification';
import ChecklistProgressCard from '@/components/dashboard/ChecklistProgressCard';
import { GlassTile } from './DashboardComponents';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import SignOutModal from '@/components/ui/SignOutModal';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import NotificationModal from '@/components/notifications/NotificationModal';
import MobileFooter from '@/components/shared/MobileFooter';
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

type Tab = 'dashboard' | 'daily' | 'flow' | 'profile' | 'requests' | 'flow-map';

interface Props {
  propertyId: string;
}

type MstDashboardQueryData = {
  property: { name: string } | null;
  tickets: Ticket[];
  isCheckedIn: boolean;
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

function PropertyFlowTile({
  name,
  code,
  active,
}: {
  name: string;
  code: string;
  active: number;
}) {
  return (
    <View style={styles.flowTile}>
      <View style={styles.flowTileInner}>
        <View style={styles.flowTileHeader}>
          <Ionicons name="location" size={12} color="rgba(255,255,255,0.55)" />
          <Text style={styles.flowTileCode}>{code}</Text>
        </View>
        <Text style={styles.flowTileName}>{name}</Text>
        <View style={styles.flowTileAvatars}>
          {Array.from({ length: active }).map((_, i) => (
            <View key={i} style={[styles.flowTileAvatar, { marginLeft: i > 0 ? -6 : 0 }]}>
              <Text style={styles.flowTileAvatarText}>{String.fromCharCode(65 + i)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.flowTileStatus}>
          <View style={styles.flowTileDot} />
          <Text style={styles.flowTileStatusText}>
            {active} MST{active > 1 ? 's' : ''} on-site
          </Text>
        </View>
      </View>
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

const STACK_HEIGHT = 420;

function TicketStack({ tickets: initialTickets }: { tickets: Ticket[] }) {
  const [order, setOrder] = useState(initialTickets);
  const translateX = useSharedValue(0);

  useEffect(() => {
    setOrder(initialTickets);
    translateX.value = 0;
  }, [initialTickets, translateX]);

  const sendToBack = useCallback(() => {
    setOrder((prev) => {
      if (prev.length < 2) return prev;
      const [first, ...rest] = prev;
      return [...rest, first];
    });
    translateX.value = 0;
  }, []);

  const pan = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 80 || Math.abs(e.velocityX) > 500) {
        const dest = e.translationX > 0 ? SCREEN_W : -SCREEN_W;
        translateX.value = withTiming(dest, { duration: 150 }, () => {
          runOnJS(sendToBack)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
      }
    });

  return (
    <View style={{ height: STACK_HEIGHT }}>
      {order.map((t, i) => {
        const isTop = i === 0;
        const offset = i * 12;
        const scale = 1 - i * 0.045;
        const opacity = i > 3 ? 0 : 1 - i * 0.18;

        return (
          <View
            key={t.id}
            style={[
              StyleSheet.absoluteFillObject,
              {
                transform: [{ translateY: offset }, { scale }],
                opacity,
                zIndex: order.length - i,
                pointerEvents: isTop ? 'auto' : 'none',
              },
            ]}
          >
            {isTop ? (
              <GestureDetector gesture={pan}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFillObject,
                    useAnimatedStyle(() => ({
                      transform: [
                        { translateX: translateX.value },
                        {
                          rotate: `${interpolate(
                            translateX.value,
                            [-SCREEN_W, 0, SCREEN_W],
                            [-8, 0, 8],
                            Extrapolate.CLAMP
                          )}deg`,
                        },
                      ],
                    })),
                  ]}
                >
                  <TicketCard ticket={t} />
                </Animated.View>
              </GestureDetector>
            ) : (
              <TicketCard ticket={t} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const TicketCard = React.memo(function TicketCard({ ticket }: { ticket: Ticket }) {
  const getPriorityColor = () => {
    switch (ticket.priority?.toLowerCase()) {
      case 'urgent':
      case 'critical':
        return { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', border: 'rgba(239,68,68,0.25)' };
      case 'high':
        return { bg: 'rgba(249,115,22,0.15)', text: '#F97316', border: 'rgba(249,115,22,0.25)' };
      case 'medium':
        return { bg: 'rgba(71,85,105,0.10)', text: '#475569', border: 'rgba(71,85,105,0.20)' };
      default:
        return { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', border: 'rgba(100,116,139,0.25)' };
    }
  };

  const priorityColors = getPriorityColor();
  
  const slaTime = ticket.sla_due_at 
    ? new Date(ticket.sla_due_at).getTime() - Date.now()
    : null;
  const slaHours = slaTime ? Math.floor(slaTime / (1000 * 60 * 60)) : 0;
  const slaMinutes = slaTime ? Math.floor((slaTime % (1000 * 60 * 60)) / (1000 * 60)) : 0;

  return (
    <View style={[styles.ticketCard, { padding: 20 }]}>
      {/* Header */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF', flex: 1, lineHeight: 22 }} numberOfLines={2}>
            {ticket.title}
          </Text>
        </View>
      </View>

      {/* Priority & Status */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: priorityColors.bg, borderColor: priorityColors.border }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: priorityColors.text }}>
            {ticket.priority?.toUpperCase()}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.25)' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>
            ASSIGNED
          </Text>
        </View>
      </View>

      {/* Assignee */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#708F96', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
            {ticket.assignee?.full_name?.[0] || 'M'}
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
          {ticket.assignee?.full_name || 'Unassigned'}
        </Text>
      </View>

      {/* SLA */}
      {slaTime && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Ionicons name="time-outline" size={14} color="#EF4444" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#EF4444' }}>
            {slaHours}h {slaMinutes}m
          </Text>
        </View>
      )}

      {/* Bottom Actions Row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Ticket Score Pill */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(234,179,8,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(234,179,8,0.3)' }}>
            <Ionicons name="star" size={12} color="#EAB308" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#EAB308' }}>
              {(ticket as any).gamification_points || (ticket as any).score || 5} pts
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{ticket.ticket_number}</Text>
        </View>

        {/* Small Action Button */}
        <TouchableOpacity 
          style={{ backgroundColor: '#5A8A8F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>View</Text>
          <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
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

export default function LovableMstDashboard({ propertyId }: Props) {
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
  }>(
    queryKeys.property.mstDashboardLovable(propertyId),
    async () => {
      const [propRes, ticketRes, shiftRes] = await Promise.all([
        serverApi.query<{ name: string }[]>({
          table: 'properties',
          action: 'select',
          select: 'name',
          filters: [{ op: 'eq', column: 'id', value: propertyId }],
          limit: 1,
        }),
        serverApi.query<Ticket[]>({
          table: 'tickets',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
          orders: [{ column: 'created_at', ascending: false }],
          limit: 100,
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
      ]);
      return {
        property: propRes.data?.[0] ?? null,
        tickets: ticketRes.data ?? [],
        isCheckedIn: shiftRes.data?.[0]?.is_checked_in ?? false,
      };
    },
    { staleTime: 1000 * 60 * 5 }
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

  const shuffledTickets = useMemo(() => {
    const next = [...filteredTickets];
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
      await serverApi.query({
        table: 'resolver_stats',
        action: 'upsert',
        values: { property_id: propertyId, user_id: user.id, is_checked_in: newStatus },
        mutationOptions: { onConflict: 'user_id,property_id' },
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
  const stats = useMemo(() => {
    const total = filteredTickets.length;
    const open = filteredTickets.filter((t) =>
      ['open', 'in_progress', 'assigned'].includes(t.status)
    ).length;
    const closed = filteredTickets.filter((t) =>
      ['resolved', 'closed', 'pending_validation'].includes(t.status)
    ).length;
    return { total, open, closed };
  }, [filteredTickets]);

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
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF', marginBottom: 12, letterSpacing: 1 }}>RECENT TICKETS</Text>
        {shuffledTickets.length > 0 ? (
          <TicketStack tickets={shuffledTickets.slice(0, 5)} />
        ) : (
          <View style={styles.ticketStackEmpty}>
            <Text style={styles.ticketStackEmptyText}>No tickets for this filter</Text>
          </View>
        )}
      </View>

      <ChecklistProgressCard completed={stats.closed} total={stats.total} delay={280} />
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

  const renderLiveFlow = () => (
    <>
      <Animated.View >
        <Text style={styles.heroTitle}>Live Flow</Text>
      </Animated.View>

      {/* Weekly Champion */}
      <Animated.View  style={styles.championCard}>
        <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.championInner}>
          <View style={styles.championAvatarWrap}>
            <LinearGradient
              colors={['#F59E0B', '#D97706']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.championAvatar}
            >
              <Text style={styles.championAvatarText}>{champion?.initials}</Text>
            </LinearGradient>
            <View style={styles.crownBadge}>
              <Ionicons name="trophy" size={14} color="#FDE68A" />
            </View>
          </View>
          <View style={styles.championInfo}>
            <Text style={styles.championLabel}>Weekly Champion</Text>
            <Text style={styles.championName}>{champion?.name || 'No champion yet'}</Text>
            <Text style={styles.championMeta}>
              {champion?.xp.toLocaleString()} XP · {champion?.resolved} resolved
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Property grid */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>Active Properties</Text>
      </View>

      <View style={styles.flowGrid}>
        {[
          { name: 'SS Plaza', code: 'SSP-01', active: 3 },
          { name: 'Rabale', code: 'RBL-02', active: 2 },
          { name: 'ETPL Digitide', code: 'ETP-03', active: 1 },
          { name: 'Head Office', code: 'HO-04', active: 2 },
        ].map((p, i) => (
          <PropertyFlowTile key={i} name={p.name} code={p.code} active={p.active} />
        ))}
      </View>
    </>
  );

  const renderProfile = () => {
    const unlocked = defaultAchievements.filter((a) => a.unlocked);
    const locked = defaultAchievements.filter((a) => !a.unlocked);
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
          <ProfileStat icon="flag" value={`${unlocked.length}/${defaultAchievements.length}`} label="BADGES" tint="#60A5FA" />
        </View>

        {/* Achievements */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>Achievements</Text>
          <Text style={styles.sectionHeaderHint}>
            {unlocked.length} of {defaultAchievements.length} unlocked
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

  // BLOCK rendering until we have actual data (prevents empty UI flash)
  if (!data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <WeatherBackground condition={undefined} />
        <SkeletonLoader />
      </View>
    );
  }

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
          {activeTab === 'dashboard' && renderMyDashboard()}
          {activeTab === 'daily' && renderDailyBoard()}
          {activeTab === 'flow' && renderLiveFlow()}
          {activeTab === 'profile' && renderProfile()}
        </View>
      </ScrollView>

      <MobileFooter
        activeTab="dashboard"
        moreMenuItems={[
          { label: 'Overview', icon: 'grid-outline', action: () => setActiveTab('dashboard') },
          { label: 'Requests', icon: 'ticket-outline', route: 'tickets' },
          { label: 'Live Flow Map', icon: 'git-branch-outline', action: () => setActiveTab('flow') },
          { label: 'Visitors', icon: 'people-outline', route: 'visitors' },
          { label: 'Diesel Logger', icon: 'flame-outline', route: 'diesel', color: '#F97316' },
          { label: 'Electricity Logger', icon: 'flash-outline', route: 'electricity', color: '#EAB308' },
          { label: 'Checklists', icon: 'clipboard-outline', route: 'checklist' },
          { label: 'Settings', icon: 'settings-outline', route: 'settings' },
          { label: 'Profile', icon: 'person-outline', action: () => setActiveTab('profile') },
          { label: 'Sign Out', icon: 'log-out-outline', action: () => setShowSignOut(true), color: '#EF4444' }
        ]}
      />

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

  // Ticket card (for stack)
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
  flowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  flowTile: {
    width: (SCREEN_W - 52) / 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  flowTileInner: {
    padding: 14,
  },
  flowTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flowTileCode: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  flowTileName: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  flowTileAvatars: {
    flexDirection: 'row',
    marginTop: 12,
  },
  flowTileAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: '#4C3FB8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flowTileAvatarText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  flowTileStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  flowTileDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  flowTileStatusText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
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
