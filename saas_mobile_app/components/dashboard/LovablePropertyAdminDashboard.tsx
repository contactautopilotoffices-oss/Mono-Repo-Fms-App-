/**
 * LovablePropertyAdminDashboard
 *
 * UNIFIED CACHE ARCHITECTURE
 *
 * - Source of Truth: React Query (via useDashboardQuery)
 * - UI State: Zustand (ephemeral only)
 * - NO server data in Zustand
 *
 * Data flows from React Query cache → component renders instantly
 * Background refresh updates UI when stale
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SkeletonLoader from './lovable/SkeletonLoader';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import SignOutModal from '@/components/ui/SignOutModal';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';
import DetailModal, { type TileDetail } from '@/components/dashboard/DetailModal';
import NeedsAttentionModal from '@/components/dashboard/NeedsAttentionModal';
import NotificationModal from '@/components/notifications/NotificationModal';
import { TicketCreateModal } from '@/components/tickets/TicketCreateModal';
import PPMActivityTile from '@/components/dashboard/PPMActivityTile';
import ChecklistProgressCard from '@/components/dashboard/ChecklistProgressCard';
import PPMProgressCard from '@/components/dashboard/PPMProgressCard';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import PropertySwitcherModal from '@/components/dashboard/PropertySwitcherModal';
import GlobalNavigationDrawer from '@/components/shared/GlobalNavigationDrawer';
import { SPACING, STATUS_COLORS } from '@/constants/designSystem';
import { GlassTile, MiniBarChart, AttentionCard } from './DashboardComponents';
import { useDashboardQuery, invalidateDashboard } from '@/hooks/useDashboardQuery';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

interface Props {
  propertyId: string;
}

export default function LovablePropertyAdminDashboard({ propertyId }: Props) {
  const router = useRouter();
  const { user, signOut, membership } = useAuth();
  const insets = useSafeAreaInsets();
  const { weather } = useWeather();

  // ─── NEW: Unified React Query Data (Source of Truth) ───
  // Renders immediately from cache, refetches in background
  const { data, isLoading, isFetching, forceRefresh } = useDashboardQuery(propertyId, {
    initialLoadingOnMount: false, // Instant render from cache
  });

  // Extract data from React Query cache
  const tickets = data?.tickets ?? [];
  const ticketCounts = data?.ticketCounts ?? {
    all: { total: 0, open: 0, closed: 0 },
    month: { total: 0, open: 0, closed: 0 },
    today: { total: 0, open: 0, closed: 0 }
  };
  const sopCount = data?.sopCount ?? 0;
  const sopTotal = data?.sopTotal ?? 0;
  const energyKwh = data?.energyKwh ?? 0;
  const energyTrend = data?.energyTrend ?? 12;
  const propertyName = propertyId === 'all' 
    ? 'All Properties Overview' 
    : (data?.propertyName ?? membership?.properties?.find(p => p.id === propertyId)?.name ?? 'Property');
  const vmsStats = data?.vmsStats ?? { total: 0, in: 0, out: 0 };
  const vendorStats = data?.vendorStats ?? { revenue: 0, commission: 0 };
  const dieselStats = data?.dieselStats ?? { level: 0, consumption: 0 };
  const healthScore = data?.healthScore ?? 100;
  const attentionItems = data?.attentionItems ?? [];
  const tenantUserIds = data?.tenantUserIds ?? [];
  const ppm = data?.ppm ?? { total: 0, done: 0, pending: 0, overdue: 0, postponed: 0 };
  const propertyPhoto = data?.propertyLogoUrl ?? null;

  // ─── UI State (ephemeral) ───
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [showTileDetail, setShowTileDetail] = useState<TileDetail | null>(null);
  const [showNeedsAttention, setShowNeedsAttention] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPropertySwitcher, setShowPropertySwitcher] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [ticketTimeFilter, setTicketTimeFilter] = useState<'today' | 'month' | 'all'>('all');

  // Permission Onboarding
  useEffect(() => {
    hasRequestedPermissions().then(requested => {
      if (!requested) setShowPermissionOnboarding(true);
    });
  }, []);

  // ─── Computed Values ───
  const totalTickets = ticketCounts[ticketTimeFilter]?.total || 0;
  const openTickets = ticketCounts[ticketTimeFilter]?.open || 0;
  const resolvedTickets = ticketCounts[ticketTimeFilter]?.closed || 0;

  const healthStatus: 'optimal' | 'watch' | 'critical' = openTickets > 15 ? 'critical' : openTickets > 5 ? 'watch' : 'optimal';
  const healthColor = STATUS_COLORS[healthStatus].bg;
  const checklistPct = sopTotal > 0 ? Math.round((sopCount / sopTotal) * 100) : 100;

  const ticketHistory = useMemo(() => [12, 18, 15, 22, 19, 25, openTickets || 14], [openTickets]);
  const energyHistory = useMemo(() => [35, 55, 70, 92, 78, 60, 45], []);

  // ─── Needs Attention Logic ───
  const needsAttentionItems = useMemo(() => {
    const RESOLVED_STATUSES = ['resolved', 'closed'];
    const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'waitlist', 'blocked', 'client_raised', 'work_started'];

    const activeRpcItems = (attentionItems || []).filter((item) => {
      if (item.entity_type === 'ticket') {
        const t = tickets.find((tk) => tk.id === item.entity_id);
        if (t && RESOLVED_STATUSES.includes(t.status)) return false;
      }
      return true;
    });

    const items: any[] = [...activeRpcItems];
    const seenIds = new Set(items.map((i) => i.entity_id));

    tickets.forEach((t) => {
      if (RESOLVED_STATUSES.includes(t.status)) return;

      if (t.raised_by && tenantUserIds.includes(t.raised_by) && !seenIds.has(t.id)) {
        items.push({ id: `tenant-${t.id}`, entity_id: t.id, entity_type: 'ticket', severity: 'high', type: 'tenant_ticket', title: 'Client Ticket', description: t.title || 'Client raised ticket', action_label: 'View' });
        seenIds.add(t.id);
      }

      if (t.priority === 'critical' && !seenIds.has(t.id)) {
        items.push({ id: `critical-${t.id}`, entity_id: t.id, entity_type: 'ticket', severity: 'critical', type: 'critical_ticket', title: 'Critical Ticket', description: t.title || 'Critical priority ticket', action_label: 'Urgent' });
        seenIds.add(t.id);
      }

      if (['urgent', 'high'].includes(t.priority) && !seenIds.has(t.id)) {
        items.push({ id: `urgent-${t.id}`, entity_id: t.id, entity_type: 'ticket', severity: 'high', type: 'critical_ticket', title: t.priority === 'urgent' ? 'Urgent Ticket' : 'High Priority Ticket', description: t.title || `${t.priority} priority ticket`, action_label: 'Review' });
        seenIds.add(t.id);
      }

      if (!seenIds.has(t.id) && ACTIVE_STATUSES.includes(t.status)) {
        const daysOpen = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysOpen > 3) {
          items.push({ id: `stale-${t.id}`, entity_id: t.id, entity_type: 'ticket', severity: 'medium', type: 'stale_ticket', title: 'Stale Ticket', description: `${t.title || 'Ticket'} · Open ${Math.floor(daysOpen)}d`, action_label: 'Follow Up' });
          seenIds.add(t.id);
        }
      }
    });

    return items.map((item) => {
      const matchingTicket = tickets.find((t) => t.id === item.entity_id);
      const isClientTicket = matchingTicket ? (matchingTicket.internal === false && !!matchingTicket.raised_by && tenantUserIds.includes(matchingTicket.raised_by)) : false;
      const isCritical = item.severity === 'critical';
      const isHighUrgent = ['urgent', 'high'].includes(matchingTicket?.priority ?? '');
      const isStale = item.type === 'stale_ticket';

      let priorityScore = 0;
      if (isCritical) priorityScore += 15;
      if (isClientTicket) priorityScore += 10;
      if (isHighUrgent) priorityScore += 8;
      if (isStale) priorityScore += 3;

      return { ...item, photoBeforeUrl: matchingTicket?.photo_before_url || null, priorityScore };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [attentionItems, tickets, tenantUserIds]);

  // ─── Role Checks ───
  const orgId = membership?.org_id ?? '';
  const orgRole = (membership?.org_role ?? '').toLowerCase();
  const isOrgAdmin = ['org_super_admin', 'org_admin', 'owner'].includes(orgRole);
  const propertyRole = (membership?.properties?.find(p => p.id === propertyId)?.role ?? '').toLowerCase();
  const isPropertyAdmin = ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager', 'spoc', 'administrator'].includes(propertyRole);
  const hasMultipleProperties = (membership?.properties?.length ?? 0) > 1;
  const canSwitchProperty = isOrgAdmin || (isPropertyAdmin && hasMultipleProperties);

  // ─── Tile Details ───
  const tileDetails: Record<string, TileDetail> = {
    tickets: {
      id: 'tickets', iconName: 'ticket', label: 'Tickets', title: `${propertyName} · Tickets`,
      metrics: [
        { label: 'Open', value: openTickets.toString() },
        { label: 'Resolved', value: resolvedTickets.toString() },
        { label: 'Total', value: totalTickets.toString() },
      ],
      chartTitle: '7-Day Volume',
      chartData: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ label: d, value: ticketHistory[i] })),
      chartColor: '#3B82F6',
      trendDirection: openTickets > 10 ? 'up' : 'down',
      trendLabel: `${openTickets} open tickets`,
      breakdownTitle: 'Status Breakdown',
      breakdown: [
        { label: 'Open', value: openTickets, color: STATUS_COLORS.critical.bg },
        { label: 'Resolved', value: resolvedTickets, color: STATUS_COLORS.optimal.bg },
        { label: 'Total', value: totalTickets, color: '#3B82F6' },
      ],
      aiAnalysis: openTickets > 15 ? 'Critical ticket backlog detected.' : 'Ticket volume is within normal parameters.',
    },
    checklist: {
      id: 'checklist', iconName: 'checkbox-outline', label: 'Checklist', title: `${propertyName} · Daily Checklist`,
      metrics: [
        { label: 'Completed', value: sopCount.toString() },
        { label: 'Total', value: sopTotal.toString() },
        { label: 'Success %', value: `${checklistPct}%` },
      ],
      chartTitle: 'Completion Trend',
      chartData: [{ label: 'Goal', value: 100 }, { label: 'Current', value: checklistPct }],
      chartColor: STATUS_COLORS.optimal.bg,
      trendDirection: 'up',
      trendLabel: `${checklistPct}% compliance`,
      breakdownTitle: 'Completion Status',
      breakdown: [
        { label: 'Completed', value: sopCount, color: STATUS_COLORS.optimal.bg },
        { label: 'Pending', value: Math.max(0, sopTotal - sopCount), color: STATUS_COLORS.watch.bg },
      ],
      aiAnalysis: checklistPct > 90 ? 'Operational compliance is excellent.' : 'Checklist completion is below target.',
    },
    health: {
      id: 'health', iconName: 'heart', label: 'Health', title: `${propertyName} · Facility Health`,
      metrics: [
        { label: 'Open Issues', value: openTickets.toString() },
        { label: 'Status', value: healthStatus.toUpperCase() },
        { label: 'Trend', value: openTickets > 5 ? 'Declining' : 'Stable' },
      ],
      chartTitle: 'Health Index',
      chartData: [
        { label: 'Risk', value: Math.min(openTickets * 5, 100) },
        { label: 'Healthy', value: Math.max(0, 100 - openTickets * 5) },
      ],
      chartColor: healthColor,
      trendDirection: openTickets > 5 ? 'down' : 'up',
      trendLabel: 'Real-time index',
      breakdownTitle: 'Health Components',
      breakdown: [
        { label: 'Tickets', value: openTickets, color: healthColor },
        { label: 'Checklist Compliance', value: `${checklistPct}%`, color: STATUS_COLORS.optimal.bg },
      ],
      aiAnalysis: healthStatus === 'critical' ? 'Facility health has declined significantly.' : 'Facility health is stable.',
    },
    energy: {
      id: 'energy', iconName: 'flash', label: 'Energy', title: `${propertyName} · Energy Consumption`,
      metrics: [
        { label: 'Today (kWh)', value: energyKwh.toString() },
        { label: 'Trend', value: `${energyTrend > 0 ? '+' : ''}${energyTrend}%` },
        { label: 'Peak', value: '14:00' },
      ],
      chartTitle: 'Hourly Consumption',
      chartData: ['06', '09', '12', '15', '18', '21', '00'].map((d, i) => ({ label: d, value: energyHistory[i] })),
      chartColor: '#FFD60A',
      trendDirection: energyTrend > 0 ? 'up' : 'down',
      trendLabel: `${Math.abs(energyTrend)}% vs avg`,
      breakdownTitle: 'Source Mix',
      breakdown: [
        { label: 'Grid', value: '68%', color: '#3B82F6' },
        { label: 'DG', value: '24%', color: '#C4A000' },
        { label: 'Solar', value: '8%', color: '#1FC26E' },
      ],
      aiAnalysis: energyTrend > 10 ? 'Energy consumption is trending higher than average.' : 'Energy consumption is stable.',
    },
  };

  // ─── Loading State ───
  // BLOCK rendering until we have actual data (prevents empty UI flash)
  if (!data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#121212' }]}>
        <StatusBar barStyle="light-content" />
        <SkeletonLoader />
      </View>
    );
  }

  // ─── Refresh Handler ───
  const onRefresh = async () => {
    setIsRefreshing(true);
    await forceRefresh();
    setIsRefreshing(false);
  };

  // ─── Render ───
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <WeatherBackground condition={weather?.condition} />

      <Animated.View  style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.hamburgerBtn} onPress={() => setShowDrawer(true)} activeOpacity={0.7}>
          <Ionicons name="menu" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <TouchableOpacity style={styles.profileRow} activeOpacity={0.7} onPress={() => router.push(`/property/${propertyId}/profile`)}>
            <View style={styles.avatar}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarText}>
                  {user?.user_metadata?.full_name ? user.user_metadata.full_name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                </Text>
              )}
            </View>
            <View style={styles.nameContainer}>
              <Text style={styles.greetingText}>Hey, {user?.user_metadata?.full_name?.split(' ')[0] || 'Admin'}</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>{propertyName}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRight}>
          {canSwitchProperty && (
            <TouchableOpacity style={[styles.headerIconBtn, { overflow: 'hidden', padding: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }]} onPress={() => setShowPropertySwitcher(true)} activeOpacity={0.7}>
              {propertyPhoto ? (
                <Image source={{ uri: propertyPhoto }} style={{ width: 32, height: 32, borderRadius: 16 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="business" size={18} color="#FFFFFF" />
                </View>
              )}
              <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: '#0B0B0F', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="swap-vertical" size={10} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowCreateModal(true)} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowNotifications(true)}>
            <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
            <View style={styles.notificationBadge} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        <Animated.View  style={styles.overviewHeader}>
          <Text style={styles.overviewTitle}>PROPERTY OVERVIEW</Text>
        </Animated.View>

        <View style={{ marginTop: SPACING.lg }}>
          {/* Tickets Tile */}
          <GlassTile label="Tickets" icon="ticket" delay={80} status={healthStatus} onPress={() => setShowTileDetail(tileDetails.tickets)}>
            <View style={styles.timeToggleRow}>
              {(['today', 'month', 'all'] as const).map((f) => (
                <TouchableOpacity key={f} style={[styles.timeToggleBtn, ticketTimeFilter === f && styles.timeToggleBtnActive]} onPress={() => setTicketTimeFilter(f)} activeOpacity={0.7}>
                  <Text style={[styles.timeToggleText, ticketTimeFilter === f && styles.timeToggleTextActive]}>
                    {f === 'today' ? 'Today' : f === 'month' ? 'This Month' : 'All Time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ alignItems: 'flex-start' }}>
                <AnimatedNumber style={styles.tileMetricMid} value={totalTickets} />
                <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>TOTAL</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <AnimatedNumber style={[styles.tileMetricMid, { color: '#FCA5A5' }]} value={openTickets} />
                <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>OPEN</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AnimatedNumber style={[styles.tileMetricMid, { color: '#10B981' }]} value={resolvedTickets} />
                <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>CLOSED</Text>
              </View>
            </View>
          </GlassTile>

          {/* Needs Attention */}
          {needsAttentionItems.length > 0 && (
            <>
              <Animated.View  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 2, textTransform: 'uppercase' }}>⚠️ NEEDS ATTENTION</Text>
                <TouchableOpacity onPress={() => setShowNeedsAttention(true)}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#3B82F6' }}>VIEW ALL</Text>
                </TouchableOpacity>
              </Animated.View>
              {needsAttentionItems.slice(0, 3).map((item, index) => (
                <AttentionCard key={item.id} item={item} index={index} onAction={() => item.entity_type === 'ticket' && router.push(`/property/${propertyId}/tickets/${item.entity_id}`)} />
              ))}
            </>
          )}

          {/* Checklist */}
          <ChecklistProgressCard completed={sopCount} total={sopTotal} delay={200} onPress={() => setShowTileDetail(tileDetails.checklist)} />

          {/* PPM */}
          <PPMProgressCard propertyId={propertyId} organizationId={orgId} done={ppm.done} total={ppm.total} pending={ppm.pending} overdue={ppm.overdue} postponed={ppm.postponed} delay={240} onPress={() => router.push(`/property/${propertyId}/ppm`)} />

          <PPMActivityTile propertyId={propertyId} organizationId={orgId} delay={320} />

          {/* Energy */}
          <GlassTile label="Energy Usage" icon="flash" delay={280} status={energyTrend > 10 ? 'watch' : 'optimal'} onPress={() => setShowTileDetail(tileDetails.energy)}>
            <View style={styles.tileTopRow}>
              <View>
                <Text style={styles.tileMetricMid}><AnimatedNumber value={energyKwh} /> <Text style={styles.tileSuffix}>kWh</Text></Text>
                <Text style={styles.tileSubtext}>Grid + DG consumption today</Text>
              </View>
              <View style={styles.trendChip}>
                <Ionicons name={energyTrend > 0 ? 'trending-up' : 'trending-down'} size={12} color="#1FC26E" />
                <Text style={styles.trendChipText}>+{energyTrend}%</Text>
              </View>
            </View>
            <MiniBarChart data={energyHistory} highlightColor="rgba(214,158,46,0.85)" />
          </GlassTile>

          {/* Visitors */}
          <GlassTile label="Visitors" icon="people-outline" delay={320} onPress={() => router.push(`/property/${propertyId}/visitors`)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.tileMetricMid}>{vmsStats.total}</Text>
                <Text style={styles.tileSubtext}>Total Visitors</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#10B981', fontWeight: '700' }}>{vmsStats.in}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>IN</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>{vmsStats.out}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>OUT</Text>
                </View>
              </View>
            </View>
          </GlassTile>

          {/* Vendor Revenue */}
          <GlassTile label="Cafeteria Revenue" icon="fast-food-outline" delay={360} onPress={() => router.push(`/property/${propertyId}/vendor`)}>
            <View style={styles.tileTopRow}>
              <View>
                <Text style={styles.tileMetricMid}>₹{vendorStats.revenue.toLocaleString()}</Text>
                <Text style={styles.tileSubtext}>Total Revenue</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: '#F59E0B', fontSize: 16, fontWeight: '800' }}>₹{Math.round(vendorStats.commission).toLocaleString()}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>COMMISSION</Text>
              </View>
            </View>
          </GlassTile>

          {/* Diesel */}
          <GlassTile label="Diesel Status" icon="water-outline" delay={400} onPress={() => router.push(`/property/${propertyId}/diesel`)}>
            <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, borderColor: 'rgba(245,158,11,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800' }}>{dieselStats.level}%</Text>
              </View>
              <View>
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>Current Level</Text>
                <Text style={styles.tileSubtext}>Tank A + Tank B summary</Text>
              </View>
            </View>
          </GlassTile>
        </View>
      </ScrollView>

      {/* Modals */}
      {showTileDetail && <DetailModal onClose={() => setShowTileDetail(null)} detail={showTileDetail} />}
      <NeedsAttentionModal
        visible={showNeedsAttention}
        onClose={() => setShowNeedsAttention(false)}
        items={needsAttentionItems}
        propertyName={propertyName}
        onItemPress={(item) => {
          setShowNeedsAttention(false);
          if (item.entity_type === 'ticket') router.push(`/property/${propertyId}/tickets/${item.entity_id}` as any);
        }}
      />
      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
      <CassandraSessionModal visible={showChat} onClose={() => setShowChat(false)} orgId={orgId} propertyId={propertyId} initialMode="text" />
      <TicketCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        propertyId={propertyId}
        organizationId={orgId}
        role="admin"
        onSuccess={forceRefresh}
      />
      <NotificationModal visible={showNotifications} onClose={() => setShowNotifications(false)} propertyId={propertyId} />
      <PermissionOnboarding visible={showPermissionOnboarding} onComplete={() => setShowPermissionOnboarding(false)} />

      {canSwitchProperty && (
        <PropertySwitcherModal
          visible={showPropertySwitcher}
          onClose={() => setShowPropertySwitcher(false)}
          currentPropertyId={propertyId}
          orgId={orgId}
          onSelect={(newPropertyId) => {
            setShowPropertySwitcher(false);
            router.replace(`/property/${newPropertyId}/dashboard` as never);
          }}
        />
      )}

      <GlobalNavigationDrawer visible={showDrawer} onClose={() => setShowDrawer(false)} propertyId={propertyId} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingBottom: 12 },
  hamburgerBtn: { padding: 4 },
  headerCenter: { flex: 1, paddingHorizontal: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: 32, height: 32, borderRadius: 16 },
  avatarText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  nameContainer: { justifyContent: 'center' },
  greetingText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  headerIconBtn: { position: 'relative' },
  notificationBadge: { position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  overviewHeader: { paddingHorizontal: SPACING.xl, marginTop: 20 },
  overviewTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', lineHeight: 26, letterSpacing: -0.5 },
  tileTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileMetricMid: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  tileSuffix: { fontSize: 16, color: 'rgba(255,255,255,0.3)', fontWeight: '600' },
  tileSubtext: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  timeToggleRow: { flexDirection: 'row', gap: 6, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, width: '100%' },
  timeToggleBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  timeToggleBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  timeToggleText: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  timeToggleTextActive: { color: '#FFF', fontWeight: '700' },
  trendChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(31,194,110,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  trendChipText: { color: '#1FC26E', fontSize: 12, fontWeight: '700' },
  nameContainer: { flexDirection: 'column' as const },
});