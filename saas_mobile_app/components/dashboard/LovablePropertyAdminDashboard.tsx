// @ts-nocheck
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
import ContentSkeletonLoader from './lovable/ContentSkeletonLoader';
import { Ionicons } from '@expo/vector-icons';
import Animated, { LinearTransition } from 'react-native-reanimated';
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
import ChecklistProgressCard from '@/components/dashboard/ChecklistProgressCard';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import DashboardPropertySwitcher from '@/components/dashboard/DashboardPropertySwitcher';
import GlobalNavigationDrawer from '@/components/shared/GlobalNavigationDrawer';
import { SPACING, STATUS_COLORS } from '@/constants/designSystem';
import { GlassTile, MiniBarChart, AttentionCard, LiveDieselSphere, LiveWaterSphere, LiveEnergyRing } from './DashboardComponents';
import { useDashboardQuery, invalidateDashboard } from '@/hooks/useDashboardQuery';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import PPMDashboardTile from './PPMDashboardTile';

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
  const { data, isLoading, isFetching, forceRefresh, error } = useDashboardQuery(propertyId, {
    initialLoadingOnMount: false, // Instant render from cache
  });

  // Extract data from React Query cache
  const tickets = data?.tickets ?? [];
  const ticketCounts = data?.ticketCounts ?? {
    all: { total: 0, open: 0, closed: 0 },
    month: { total: 0, open: 0, closed: 0 },
    today: { total: 0, open: 0, closed: 0 }
  };
  const ticketTrend = data?.ticketTrend ?? [];
  const ticketInsights = data?.ticketInsights ?? {
    thisWeekCreated: 0, lastWeekCreated: 0, weekOverWeekChangePct: 0,
    avgResolutionHours: null as number | null, slaBreachCount: 0, busiestDay: null as string | null,
    openPriorityCounts: { urgent: 0, high: 0, medium: 0, low: 0 },
  };
  const sopCount = data?.sopCount ?? 0;
  const sopTotal = data?.sopTotal ?? 0;
  const energyStats = data?.energyStats ?? { today: 0, month: 0, all: 0 };
  const energyKwh = data?.energyKwh ?? 0;
  const energyTrend = data?.energyTrend ?? 12;
  const propertyName = propertyId === 'all' 
    ? 'All Properties Overview' 
    : (data?.propertyName ?? membership?.properties?.find(p => p.id === propertyId)?.name ?? 'Property');
  const vmsStats = data?.vmsStats ?? { 
    today: { total: 0, in: 0, out: 0 },
    month: { total: 0, in: 0, out: 0 },
    all: { total: 0, in: 0, out: 0 }
  };
  const vendorStats = data?.vendorStats ?? { 
    today: { revenue: 0, commission: 0 },
    month: { revenue: 0, commission: 0 },
    all: { revenue: 0, commission: 0 }
  };
  const dieselStats = data?.dieselStats ?? { 
    level: 0, 
    consumption: { today: 0, month: 0, all: 0 } 
  };
  const waterStats = data?.waterStats ?? { 
    quantity: { today: 0, month: 0, all: 0 }, 
    cost: { today: 0, month: 0, all: 0 },
    sources: { 
      today: {} as Record<string, { count: number, cost: number, qty: number }>, 
      month: {} as Record<string, { count: number, cost: number, qty: number }>, 
      all: {} as Record<string, { count: number, cost: number, qty: number }> 
    }
  };
  const healthScore = data?.healthScore ?? 100;
  const attentionItems = data?.attentionItems ?? [];
  const tenantUserIds = data?.tenantUserIds ?? [];
  const propertyPhoto =
    membership?.properties?.find((p) => p.id === propertyId)?.image_url ??
    data?.propertyLogoUrl ??
    null;
  const ppmSchedules = data?.ppmSchedules ?? [];
  const visitorItems = data?.visitorItems ?? [];

  // ─── UI State (ephemeral) ───
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [showTileDetail, setShowTileDetail] = useState<TileDetail | null>(null);
  const [showNeedsAttention, setShowNeedsAttention] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [showDrawer, setShowDrawer] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | 'month' | 'all'>('all');
  const [visitorsExpanded, setVisitorsExpanded] = useState(false);

  const toggleVisitors = () => {
    setVisitorsExpanded(!visitorsExpanded);
  };

  // Permission Onboarding
  useEffect(() => {
    hasRequestedPermissions().then(requested => {
      if (!requested) setShowPermissionOnboarding(true);
    });
  }, []);

  // ─── Computed Values ───
  const totalTickets = ticketCounts[timeFilter]?.total || 0;
  const openTickets = ticketCounts[timeFilter]?.open || 0;
  const resolvedTickets = ticketCounts[timeFilter]?.closed || 0;

  const healthStatus: 'optimal' | 'watch' | 'critical' = openTickets > 15 ? 'critical' : openTickets > 5 ? 'watch' : 'optimal';
  const healthColor = STATUS_COLORS[healthStatus].bg;
  const ticketHistory = useMemo(() => [12, 18, 15, 22, 19, 25, openTickets || 14], [openTickets]);
  const energyHistory = data?.energyHistory ?? [0, 0, 0, 0, 0, 0, 0];
  const dieselHistory = data?.dieselHistory ?? [0, 0, 0, 0, 0, 0, 0];

  const last7DayLabels = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }), []);

  const energyPeakValue = Math.max(...energyHistory);
  const energyPeakIndex = energyHistory.indexOf(energyPeakValue);
  const energyPeakLabel = last7DayLabels[energyPeakIndex] || '';

  const aiEnergyAnalysis = energyTrend > 0
    ? `Energy consumption is trending ${energyTrend}% higher than average. Peak usage was observed on ${energyPeakLabel} (${energyPeakValue.toLocaleString()} units).`
    : energyTrend < 0 
      ? `Energy consumption is trending ${Math.abs(energyTrend)}% lower than average. Peak usage was on ${energyPeakLabel} (${energyPeakValue.toLocaleString()} units).`
      : `Energy consumption is relatively stable, with peak usage on ${energyPeakLabel} (${energyPeakValue.toLocaleString()} units).`;

  const checklistPct = sopTotal > 0 ? Math.round((sopCount / sopTotal) * 100) : 100;

  // ─── Needs Attention Logic ───
  const needsAttentionItems = useMemo(() => {
    const RESOLVED_STATUSES = ['resolved', 'closed'];
    const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'waitlist', 'blocked', 'client_raised', 'work_started'];

    const activeRpcItems = (attentionItems || []).reduce<any[]>((acc, item) => {
      if (item.entity_type === 'ticket') {
        const t = tickets.find((tk) => tk.id === item.entity_id);
        if (t && RESOLVED_STATUSES.includes(t.status)) return acc;
      }
      // Deduplicate by entity_id (or id) to avoid duplicate React keys
      const key = item.entity_id ?? item.id;
      if (!acc.some((i) => (i.entity_id ?? i.id) === key)) {
        acc.push(item);
      }
      return acc;
    }, []);

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

      return { ...item,
        title: matchingTicket?.title || item.title,
        photoBeforeUrl: matchingTicket?.photo_before_url || null,
        priorityScore,
        createdAt: matchingTicket?.created_at || null,
        slaDeadline: matchingTicket?.created_at && matchingTicket?.sla_hours
          ? new Date(new Date(matchingTicket.created_at).getTime() + matchingTicket.sla_hours * 3600000).toISOString()
          : null,
      };
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

  // ─── Ticket AI Analysis (rule-based summary over real 7-day insights) ───
  const ticketAiAnalysis = useMemo(() => {
    const { weekOverWeekChangePct, avgResolutionHours, slaBreachCount, busiestDay, openPriorityCounts } = ticketInsights;
    const parts: string[] = [];

    if (openTickets > 15) parts.push('Critical ticket backlog detected.');
    else if (openPriorityCounts.urgent > 0) parts.push(`${openPriorityCounts.urgent} urgent ticket${openPriorityCounts.urgent > 1 ? 's' : ''} need immediate attention.`);
    else parts.push('Ticket volume is within normal parameters.');

    if (weekOverWeekChangePct !== 0) {
      parts.push(`Volume is ${weekOverWeekChangePct > 0 ? 'up' : 'down'} ${Math.abs(weekOverWeekChangePct)}% vs last week${busiestDay ? `, busiest on ${busiestDay}` : ''}.`);
    }

    if (avgResolutionHours != null) {
      parts.push(`Avg resolution time is ${avgResolutionHours < 24 ? `${avgResolutionHours}h` : `${Math.round(avgResolutionHours / 24)}d`}.`);
    }

    if (slaBreachCount > 0) {
      parts.push(`${slaBreachCount} ticket${slaBreachCount > 1 ? 's have' : ' has'} breached SLA this week — review first.`);
    }

    return parts.join(' ');
  }, [ticketInsights, openTickets]);

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
      chartData: ticketTrend.length > 0
        ? ticketTrend.map((d) => ({ label: d.label, value: d.created }))
        : Array.from({ length: 7 }, () => ({ label: '', value: 0 })),
      chartColor: '#3B82F6',
      trendDirection: ticketInsights.weekOverWeekChangePct >= 0 ? 'up' : 'down',
      trendLabel: `${ticketInsights.weekOverWeekChangePct > 0 ? '+' : ''}${ticketInsights.weekOverWeekChangePct}% vs last week`,
      breakdownTitle: 'Status Breakdown',
      breakdown: [
        { label: 'Open', value: openTickets, color: STATUS_COLORS.critical.bg },
        { label: 'Resolved', value: resolvedTickets, color: STATUS_COLORS.optimal.bg },
        { label: 'Total', value: totalTickets, color: '#3B82F6' },
      ],
      secondaryBreakdownTitle: 'Open Tickets by Priority',
      secondaryBreakdown: [
        { label: 'Urgent', value: ticketInsights.openPriorityCounts.urgent, color: STATUS_COLORS.critical.bg },
        { label: 'High', value: ticketInsights.openPriorityCounts.high, color: '#F59E0B' },
        { label: 'Medium', value: ticketInsights.openPriorityCounts.medium, color: STATUS_COLORS.watch.bg },
        { label: 'Low', value: ticketInsights.openPriorityCounts.low, color: STATUS_COLORS.optimal.bg },
      ],
      aiAnalysis: ticketAiAnalysis,
    },
    checklist: (() => {
      const ds = data?.sopStats?.day ?? { total: sopTotal, completed: sopCount };
      const ns = data?.sopStats?.night ?? { total: 0, completed: 0 };
      const dayPct = ds.total > 0 ? Math.round((ds.completed / ds.total) * 100) : 100;
      const nightPct = ns.total > 0 ? Math.round((ns.completed / ns.total) * 100) : 100;
      const overallPct = checklistPct;
      const pendingDay = Math.max(0, ds.total - ds.completed);
      const pendingNight = Math.max(0, ns.total - ns.completed);

      let aiText = '';
      if (overallPct >= 90) {
        aiText = `Excellent compliance at ${overallPct}%. `;
      } else if (overallPct >= 50) {
        aiText = `Compliance is at ${overallPct}% — needs improvement. `;
      } else {
        aiText = `⚠️ Compliance critically low at ${overallPct}%. Immediate attention required. `;
      }
      if (ns.total > 0) {
        aiText += `Day shift: ${dayPct}% (${ds.completed}/${ds.total}). Night shift: ${nightPct}% (${ns.completed}/${ns.total}). `;
        if (nightPct < dayPct && nightPct < 80) {
          aiText += 'Night shift completion is lagging behind day shift — consider reviewing overnight staffing.';
        } else if (dayPct < nightPct && dayPct < 80) {
          aiText += 'Day shift needs attention — completion rate is lower than the night shift.';
        }
      } else {
        aiText += `${ds.completed} of ${ds.total} day checklists completed. ${pendingDay > 0 ? pendingDay + ' still pending.' : 'All done!'}`;
      }

      return {
        id: 'checklist', iconName: 'checkbox-outline', label: 'Checklist', title: `${propertyName} · Daily Checklist`,
        metrics: [
          { label: 'Completed', value: sopCount.toString() },
          { label: 'Total', value: sopTotal.toString() },
          { label: 'Success %', value: `${overallPct}%` },
        ],
        chartTitle: 'Completion Trend',
        chartData: [{ label: 'Goal', value: 100 }, { label: 'Current', value: overallPct }],
        chartColor: overallPct >= 80 ? STATUS_COLORS.optimal.bg : overallPct >= 50 ? STATUS_COLORS.watch.bg : STATUS_COLORS.critical.bg,
        trendDirection: overallPct >= 80 ? 'up' as const : 'down' as const,
        trendLabel: `${overallPct}% compliance`,
        breakdownTitle: 'Completion Status',
        breakdown: [
          { label: `☀️ Day Done`, value: ds.completed, color: '#F59E0B' },
          { label: `☀️ Day Pending`, value: pendingDay, color: 'rgba(245,158,11,0.3)' },
          ...(ns.total > 0 ? [
            { label: `🌙 Night Done`, value: ns.completed, color: '#6366F1' },
            { label: `🌙 Night Pending`, value: pendingNight, color: 'rgba(99,102,241,0.3)' },
          ] : []),
        ],
        aiAnalysis: aiText.trim(),
      };
    })(),
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
        { label: 'Units', value: (energyStats[timeFilter] || 0).toLocaleString() },
        { label: 'Trend', value: `${energyTrend > 0 ? '+' : ''}${energyTrend}%` },
        { label: 'Peak Day', value: energyPeakLabel },
      ],
      chartTitle: 'Daily Consumption',
      chartData: last7DayLabels.map((d, i) => ({ label: d, value: energyHistory[i] })),
      chartColor: '#FFD60A',
      trendDirection: energyTrend > 0 ? 'up' : 'down',
      trendLabel: `${Math.abs(energyTrend)}% vs avg`,
      aiAnalysis: aiEnergyAnalysis,
    },
  };

  // ─── Loading State ───
  // Show header shell instantly (from cached membership) with skeleton content below
  const isDataReady = !!data;

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
          <DashboardPropertySwitcher
            canSwitchProperty={canSwitchProperty}
            propertyPhoto={propertyPhoto}
            propertyId={propertyId}
            orgId={orgId}
          />
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowCreateModal(true)} activeOpacity={0.7}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowNotifications(true)}>
            <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
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
        {error ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, paddingHorizontal: 20 }}>
            <Ionicons name="warning-outline" size={48} color="#EF4444" />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16 }}>Dashboard Error</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
              {error.message || 'Failed to fetch dashboard data.'}
            </Text>
            <TouchableOpacity 
              onPress={forceRefresh}
              style={{ backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        ) : !isDataReady ? (
          <ContentSkeletonLoader />
        ) : (
          <>
        <Animated.View  style={styles.overviewHeader}>
          <Text style={styles.overviewTitle}>PROPERTY OVERVIEW</Text>
        </Animated.View>

        <View style={{ marginTop: SPACING.lg }}>
          {/* Global Time Toggle (Ticket card handles the UI, but it applies to all) */}
          <GlassTile label="Tickets" icon="ticket" delay={80} status={healthStatus} onPress={() => setShowTileDetail(tileDetails.tickets)}>
            <View style={styles.timeToggleRow}>
              {(['today', 'month', 'all'] as const).map((f) => (
                <TouchableOpacity key={f} style={[styles.timeToggleBtn, timeFilter === f && styles.timeToggleBtnActive]} onPress={() => setTimeFilter(f)} activeOpacity={0.7}>
                  <Text style={[styles.timeToggleText, timeFilter === f && styles.timeToggleTextActive]}>
                    {f === 'today' ? 'Today' : f === 'month' ? 'This Month' : 'All Time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <AnimatedNumber style={styles.tileMetricMid} value={totalTickets} />
                <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>TOTAL</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <AnimatedNumber style={[styles.tileMetricMid, { color: '#FCA5A5' }]} value={openTickets} />
                <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>OPEN</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <AnimatedNumber style={[styles.tileMetricMid, { color: '#10B981' }]} value={resolvedTickets} />
                <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>CLOSED</Text>
              </View>
            </View>
          </GlassTile>

          {/* Needs Attention */}
          {needsAttentionItems.length > 0 && (() => {
            const critCount = needsAttentionItems.filter(i => i.severity === 'critical').length;
            const highCount = needsAttentionItems.filter(i => i.severity === 'high').length;
            const medCount = needsAttentionItems.filter(i => !['critical', 'high'].includes(i.severity)).length;
            return (
            <>
              <Animated.View  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 2, textTransform: 'uppercase' }}>⚠️ NEEDS ATTENTION</Text>
                <TouchableOpacity onPress={() => setShowNeedsAttention(true)}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#3B82F6' }}>VIEW ALL</Text>
                </TouchableOpacity>
              </Animated.View>
              {/* Severity Summary Bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.md, gap: 12 }}>
                {critCount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>{critCount} Critical</Text>
                  </View>
                )}
                {highCount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>{highCount} High</Text>
                  </View>
                )}
                {medCount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' }} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>{medCount} Medium</Text>
                  </View>
                )}
              </View>
              {needsAttentionItems.slice(0, 3).map((item, index) => (
                <AttentionCard key={item.id} item={item} index={index} onAction={() => item.entity_type === 'ticket' && router.push(`/property/${propertyId}/tickets/${item.entity_id}`)} />
              ))}
            </>
            );
          })()}

          {/* Checklist */}
          <ChecklistProgressCard stats={data?.sopStats} items={data?.sopItems} delay={200} onPress={() => setShowTileDetail(tileDetails.checklist)} />

          {/* PPM Calendar with dots and upcoming tasks */}
          <PPMDashboardTile
            propertyId={propertyId}
            delay={220}
            schedules={ppmSchedules}
            loading={isLoading}
          />

          {/* Energy */}
          <GlassTile label="Main Meter" icon="flash" delay={280} status={energyTrend > 10 ? 'watch' : 'optimal'} onPress={() => setShowTileDetail(tileDetails.energy)}>
            <View style={styles.tileTopRow}>
              <View>
                <Text style={styles.tileMetricMid}><AnimatedNumber value={energyStats[timeFilter] || 0} /> <Text style={styles.tileSuffix}>Units</Text></Text>
                <Text style={styles.tileSubtext}>
                  {timeFilter === 'today' ? 'Daily' : timeFilter === 'month' ? 'Monthly' : 'Total'} Consumption
                </Text>
              </View>
              <LiveEnergyRing percentage={75} />
            </View>
            <MiniBarChart data={energyHistory} highlightColor="rgba(214,158,46,0.85)" />
            <Text style={[styles.tileSubtext, { textAlign: 'center', marginTop: 12, fontSize: 10 }]}>Last 7 Days Consumption</Text>
          </GlassTile>

          {/* Visitors */}
          <GlassTile label="Visitors" icon="people-outline" delay={320} onPress={() => router.push(`/property/${propertyId}/visitors`)} onLongPress={toggleVisitors}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.tileMetricMid}>{vmsStats?.[timeFilter]?.total || 0}</Text>
                <Text style={styles.tileSubtext}>Total Visitors</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#10B981', fontWeight: '700' }}>{vmsStats?.[timeFilter]?.in || 0}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>IN</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>{vmsStats?.[timeFilter]?.out || 0}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>OUT</Text>
                </View>
              </View>
            </View>

            {/* Expanded Visitor Items */}
            {visitorsExpanded && visitorItems && visitorItems.length > 0 && (
              <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', gap: 12 }}>
                {visitorItems.slice(0, 5).map((visitor: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: visitor.status === 'checked_in' ? '#10B981' : 'rgba(255,255,255,0.3)' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{visitor.name || 'Unknown'}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }} numberOfLines={1}>{visitor.purpose || 'Visit'}</Text>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                      {new Date(visitor.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </GlassTile>

          {/* Vendor Revenue */}
          <GlassTile label="Cafeteria Revenue" icon="fast-food-outline" delay={360} onPress={() => router.push(`/property/${propertyId}/cafeteria`)}>
            <View style={styles.tileTopRow}>
              <View>
                <Text style={styles.tileMetricMid}>₹{(vendorStats[timeFilter]?.revenue || 0).toLocaleString()}</Text>
                <Text style={styles.tileSubtext}>Total Revenue</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: '#F59E0B', fontSize: 16, fontWeight: '800' }}>₹{Math.round(vendorStats[timeFilter]?.commission || 0).toLocaleString()}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>COMMISSION</Text>
              </View>
            </View>
          </GlassTile>

          {/* Diesel */}
          <GlassTile label="Diesel Stock" icon="water-outline" delay={400} onPress={() => router.push(`/property/${propertyId}/diesel`)}>
            <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
              <LiveDieselSphere level={dieselStats.level} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>{dieselStats.consumption?.[timeFilter] || 0} L</Text>
                <Text style={styles.tileSubtext}>{timeFilter === 'today' ? 'Daily' : timeFilter === 'month' ? 'Monthly' : 'Total'} Consumption</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>DG Gen (kWh)</Text>
                <Text style={{ color: '#F59E0B', fontSize: 16, fontWeight: '800' }}>{dieselStats.dg_kwh?.[timeFilter] || 0}</Text>
              </View>
            </View>

            {/* Generator Wise Breakdown */}
            {dieselStats.generators && dieselStats.generators.length > 0 && (
              <View style={{ marginTop: 16, gap: 8 }}>
                {dieselStats.generators.map((gen: any) => (
                  <View key={gen.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>{gen.name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Level</Text>
                        <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '700' }}>{gen.levelPct}%</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Used (Today)</Text>
                        <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>{gen.consumption} L</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </GlassTile>

          {/* Water */}
          <GlassTile label="Water Usage" icon="water" delay={420} onPress={() => router.push(`/property/${propertyId}/water`)}>
            <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
              <LiveWaterSphere level={50} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>{(waterStats.quantity?.[timeFilter] || 0).toLocaleString()} Units</Text>
                <Text style={styles.tileSubtext}>{timeFilter === 'today' ? 'Daily' : timeFilter === 'month' ? 'Monthly' : 'Total'} Consumption</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Cost</Text>
                <Text style={{ color: '#0EA5E9', fontSize: 16, fontWeight: '800' }}>₹{Math.round(waterStats.cost?.[timeFilter] || 0).toLocaleString()}</Text>
              </View>
            </View>
            
            {/* Water Sources Breakdown */}
            {waterStats.sources?.[timeFilter] && Object.keys(waterStats.sources[timeFilter]).length > 0 && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                {Object.entries(waterStats.sources[timeFilter]).map(([source, stats]) => (
                  <View key={source} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, textTransform: 'capitalize' }}>
                      {source} <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>({stats.count} trips)</Text>
                    </Text>
                    <Text style={{ color: '#0EA5E9', fontSize: 12, fontWeight: '600' }}>
                      ₹{Math.round(stats.cost).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </GlassTile>
        </View>
          </>
        )}
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
  headerIconBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: 'rgba(255,255,255,0.08)', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.1)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    position: 'relative' 
  },
  notificationBadge: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#000' },
  overviewHeader: { paddingHorizontal: SPACING.xl, marginTop: 20 },
  overviewTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', lineHeight: 26, letterSpacing: -0.5 },
  tileTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileMetricMid: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  tileSuffix: { fontSize: 16, color: 'rgba(255,255,255,0.3)', fontWeight: '600' },
  tileSubtext: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  timeToggleRow: { flexDirection: 'row', gap: 4, marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, width: '100%' },
  timeToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  timeToggleBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  timeToggleText: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  timeToggleTextActive: { color: '#FFF', fontWeight: '700' },
  trendChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(31,194,110,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  trendChipText: { color: '#1FC26E', fontSize: 12, fontWeight: '700' },
});