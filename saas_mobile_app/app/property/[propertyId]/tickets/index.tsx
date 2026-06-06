import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { serverApi } from '@/lib/serverApi';

import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context';
import TicketListItem from '@/components/tickets/TicketListItem';
import MediaCaptureModal, { MediaFile } from '@/components/shared/MediaCaptureModal';
import { GlassCard } from '@/constants/designSystem';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { RotatingBorder } from '@/components/shared/RotatingBorder';
import { TicketCreateModal } from '@/components/tickets/TicketCreateModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';



type StatusFilter = 'all' | 'mine' | 'open' | 'in_progress' | 'resolved' | 'closed';
type DateRangeFilter = 'all' | 'today' | 'week' | 'month';
type SortBy = 'newest' | 'oldest' | 'priority_high' | 'priority_low';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'technical', label: 'Technical' },
  { value: 'soft_services', label: 'Soft Service' },
  { value: 'plumbing', label: 'Plumbing' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'priority_high', label: 'Priority: High → Low' },
  { value: 'priority_low', label: 'Priority: Low → High' },
];

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0, urgent: 1, high: 2, medium: 3, low: 4,
};

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',                label: 'All' },
  { key: 'mine',               label: 'My Tickets' },
  { key: 'open',               label: 'Opened' },
  { key: 'in_progress',        label: 'In Progress' },
  { key: 'resolved',           label: 'Resolved' },
  { key: 'closed',             label: 'Closed' },
];

const DATE_RANGES: { key: DateRangeFilter; label: string }[] = [
  { key: 'all',   label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

interface TicketEscalationLog {
  from_level: number;
  to_level: number | null;
  escalated_at: string;
  from_employee?: { full_name: string; user_photo_url?: string | null } | null;
  to_employee?: { full_name: string; user_photo_url?: string | null } | null;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  ticket_number: string;
  created_at: string;
  updated_at: string;
  property_id: string;
  organization_id: string;
  assignee: { id: string; full_name: string; user_photo_url?: string | null } | null;
  creator:  { id: string; full_name: string; property_memberships?: { role: string }[] } | null;
  photo_before_url?: string | null;
  internal?: boolean | null;
  raised_by?: string | null;
  ticket_escalation_logs?: TicketEscalationLog[];
}

const PAGE_SIZE = 20;

export default function TicketsScreen() {
  const { propertyId, filter } = useGlobalSearchParams<{ propertyId: string; filter?: string }>();
  const router = useRouter();
  const isNeedsAttentionMode = filter === 'needs_attention';
  // Keep supabase for realtime subscriptions if any, else we can remove it later
  const { membership, user: authUser } = useAuth();
  const isTenant = membership?.role === 'tenant' || membership?.properties?.find((p: any) => p.id === propertyId)?.role === 'tenant';
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [limit, setLimit] = useState(PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [raisedByFilter, setRaisedByFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string }[]>([]);
  const insets = useSafeAreaInsets();
  const orgId = membership?.org_id ?? '';

  const hasActiveFilters = categoryFilter !== 'all' || searchQuery.trim() !== '' || sortBy !== 'newest' || raisedByFilter !== 'all' || assignedToFilter !== 'all';

  const isValidProperty = Boolean(propertyId && propertyId !== 'undefined' && propertyId !== 'null');

  const buildQueryParams = useCallback((offset: number, limit: number) => {
    if (!isValidProperty) return null;
    
    const propIds = propertyId === 'all' 
      ? (membership?.properties?.map(p => p.id) ?? [])
      : [propertyId];

    if (propIds.length === 0) return null;

    const queryFilters: any[] = [];
    
    if (propertyId === 'all') {
      queryFilters.push({ op: 'in', column: 'property_id', values: propIds });
    } else {
      queryFilters.push({ op: 'eq', column: 'property_id', value: propertyId });
    }

    if (isNeedsAttentionMode) {
      // Fetch all active tickets so we can client-side filter for needs attention
      // Not in resolved or closed
      // Since 'not in' is not directly supported by standard serverApi without custom logic,
      // we can fetch open, assigned, in_progress, etc.
      queryFilters.push({ op: 'in', column: 'status', values: ['open', 'assigned', 'in_progress', 'needs_approval'] });
    } else if (statusFilter === 'mine') {
      queryFilters.push({ op: 'eq', column: 'assigned_to', value: authUser?.id ?? '' });
    } else if (statusFilter === 'open') {
      queryFilters.push({ op: 'in', column: 'status', values: ['open', 'assigned'] });
    } else if (statusFilter === 'in_progress') {
      queryFilters.push({ op: 'in', column: 'status', values: ['in_progress'] });
    } else if (statusFilter !== 'all') {
      queryFilters.push({ op: 'eq', column: 'status', value: statusFilter });
    }

    if (dateRange !== 'all') {
      const now = new Date();
      const end = now.toISOString().split('T')[0] + 'T23:59:59';
      let start: string;
      if (dateRange === 'today') {
        start = now.toISOString().split('T')[0];
      } else if (dateRange === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        start = d.toISOString().split('T')[0];
      } else {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        start = d.toISOString().split('T')[0];
      }
      queryFilters.push({ op: 'gte', column: 'created_at', value: start });
      queryFilters.push({ op: 'lte', column: 'created_at', value: end });
    }

    // Advanced filters
    if (categoryFilter !== 'all') {
      // NOTE: Filtering on joined tables in PostgREST is complex.
      // We assume skill_groups table filtering might not be fully supported by serverApi directly
      // as easily as .eq('skill_group.code', ...). 
      // If serverApi supports embedded filters, great.
      queryFilters.push({ op: 'eq', column: 'skill_group.code', value: categoryFilter });
    }
    if (raisedByFilter !== 'all') {
      queryFilters.push({ op: 'eq', column: 'raised_by', value: raisedByFilter });
    }
    if (assignedToFilter !== 'all') {
      queryFilters.push({ op: 'eq', column: 'assigned_to', value: assignedToFilter });
    }

    // Tenants must never see internal tickets
    if (isTenant) {
      queryFilters.push({ op: 'neq', column: 'internal', value: true });
    }

    return {
      table: 'tickets',
      action: 'select',
      select: `id, title, description, status, priority, ticket_number, created_at, updated_at,
               property_id, organization_id, photo_before_url, internal, raised_by, assigned_to,
               skill_group:skill_groups(name, code),
               assignee:users!assigned_to(id, full_name, user_photo_url),
               creator:users!raised_by(id, full_name, property_memberships(role)),
               ticket_escalation_logs(from_level, to_level, escalated_at,
                 from_employee:users!from_employee_id(full_name, user_photo_url),
                 to_employee:users!to_employee_id(full_name, user_photo_url))`,
      filters: queryFilters,
      orders: [{ column: 'created_at', ascending: sortBy === 'oldest' }],
      limit,
      offset,
    };
  }, [propertyId, statusFilter, dateRange, authUser?.id, membership?.properties, isNeedsAttentionMode, categoryFilter, raisedByFilter, assignedToFilter, sortBy, isTenant]);

const defaultCounts: Record<StatusFilter, number> = {
  all: 0, mine: 0, open: 0, in_progress: 0, resolved: 0, closed: 0,
};

const getStatusCounts = useCallback(async () => {
  if (!isValidProperty) return defaultCounts;
  try {
    const counts: Record<StatusFilter, number> = { ...defaultCounts };

    const propIds = propertyId === 'all'
      ? (membership?.properties?.map(p => p.id) ?? [])
      : [propertyId];

    if (propIds.length === 0) return counts;

    const getDateRange = (range: DateRangeFilter) => {
      const now = new Date();
      const end = now.toISOString().split('T')[0] + 'T23:59:59';
      if (range === 'today') return { start: now.toISOString().split('T')[0], end };
      if (range === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return { start: d.toISOString().split('T')[0], end }; }
      if (range === 'month') { const d = new Date(now); d.setDate(d.getDate() - 30); return { start: d.toISOString().split('T')[0], end }; }
      return { start: '1970-01-01', end };
    };
    const { start, end } = getDateRange(dateRange);

    const baseFilters: any[] = [];
    if (dateRange !== 'all') {
      baseFilters.push({ op: 'gte', column: 'created_at', value: start });
      baseFilters.push({ op: 'lte', column: 'created_at', value: end });
    }
    if (propertyId === 'all') {
      baseFilters.push({ op: 'in', column: 'property_id', values: propIds });
    } else {
      baseFilters.push({ op: 'eq', column: 'property_id', value: propertyId });
    }
    // Tenants must never see internal tickets in counts either
    if (isTenant) {
      baseFilters.push({ op: 'neq', column: 'internal', value: true });
    }

    const fetchCount = async (additionalFilters: any[]) => {
      const res = await serverApi.query({
        table: 'tickets',
        action: 'select',
        select: 'id',
        selectOptions: { count: 'exact', head: true },
        filters: [...baseFilters, ...additionalFilters],
      });
      return res.count ?? 0;
    };

    counts.all = await fetchCount([]);
    counts.mine = await fetchCount([{ op: 'eq', column: 'assigned_to', value: authUser?.id ?? '' }]);
    counts.open = await fetchCount([{ op: 'in', column: 'status', values: ['open', 'assigned'] }]);
    counts.in_progress = await fetchCount([{ op: 'in', column: 'status', values: ['in_progress'] }]);
    counts.resolved = await fetchCount([{ op: 'eq', column: 'status', value: 'resolved' }]);
    counts.closed = await fetchCount([{ op: 'eq', column: 'status', value: 'closed' }]);

    return counts;
  } catch (err) {
    console.error('Error fetching status counts:', err);
    return defaultCounts;
  }
}, [propertyId, dateRange, authUser?.id, membership?.properties, isTenant]);

const fetchTickets = useCallback(async () => {
  if (!isValidProperty) return { tickets: [] as Ticket[], hasMore: false, statusCounts: defaultCounts };
  try {
    const qParams = buildQueryParams(0, limit + 1);
    if (!qParams) return { tickets: [] as Ticket[], hasMore: false, statusCounts: defaultCounts };
    
    const res = await serverApi.query<Ticket[]>(qParams as any);
    
    let items: Ticket[] = (res.data ?? []) as Ticket[];
    if (res.error && (res.error as any).code === 'PGRST116') {
      items = [];
    } else if (res.error) {
      throw new Error(res.error.message);
    }

    const isTenant = membership?.role === 'tenant';
    if (isTenant) {
      items = items.filter(t => !t.internal);
    }
    
    const hasMoreItems = items.length > limit;
    const counts = await getStatusCounts();
    return { tickets: items.slice(0, limit), hasMore: hasMoreItems, statusCounts: counts };
  } catch (err) {
    console.error('Error fetching tickets:', err);
    return { tickets: [] as Ticket[], hasMore: false, statusCounts: defaultCounts };
  }
}, [propertyId, buildQueryParams, limit, getStatusCounts, membership?.role]);

const { data, isLoading, isFetching, refetch } = useServerQuery(
  [...queryKeys.property.tickets(propertyId), statusFilter, dateRange, String(isNeedsAttentionMode), String(limit)],
  fetchTickets,
  { 
    staleTime: 1000 * 60 * 5,
    enabled: isValidProperty,
  }
);

const displayedTickets = useMemo(() => {
    let source: Ticket[] = data?.tickets ?? [];
    if (isNeedsAttentionMode) {
      source = source.filter((t: Ticket) => {
        // Critical priority always needs attention
        if (t.priority === 'critical') return true;
        // High priority + active status
        if (t.priority === 'high' && !['resolved', 'closed'].includes(t.status)) return true;
        // Client-raised ticket: creator is a tenant user (cross-referenced via property_memberships.role)
        // Only tickets where is_internal=false AND creator.role='tenant' are client-raised.
        // Property admin/staff tickets have is_internal=true or creator.role != 'tenant'.
        const creatorRoles = t.creator?.property_memberships;
        const isTenantCreator = creatorRoles?.some(m => m.role === 'tenant') ?? false;
        if (t.is_internal === false && isTenantCreator && !['resolved', 'closed'].includes(t.status)) return true;
        // Stale ticket (>3 days open with active status)
        const daysOpen = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysOpen > 3 && ['open', 'assigned', 'in_progress'].includes(t.status)) return true;
        return false;
      });
    }
    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase().trim();
    return source.filter((t: Ticket) =>
      t.title.toLowerCase().includes(q) ||
      (t.ticket_number ?? '').toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q)
    );
  }, [data, isNeedsAttentionMode, searchQuery]);
const hasMore = data?.hasMore ?? false;
const statusCounts = data?.statusCounts ?? defaultCounts;

const loadMore = () => {
  if (!hasMore || !propertyId) return;
  setLimit(prev => prev + PAGE_SIZE);
};

const onRefresh = () => {
  if (limit !== PAGE_SIZE) {
    setLimit(PAGE_SIZE);
  } else {
    refetch();
  }
};

  // Fetch users for Raised By / Assigned To filters
  const fetchFilterOptions = useCallback(async () => {
    if (!isValidProperty || propertyId === 'all') return;
    try {
      const res = await serverApi.query<{ user_id: string; users?: { id: string; full_name: string } }>({
        table: 'property_memberships',
        action: 'select',
        select: 'user_id, users:user_id(id, full_name)',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'eq', column: 'is_active', value: true }
        ],
      });
      const data = res.data ?? [];
      const users = data
        .map((m: any) => ({ id: m.users?.id, full_name: m.users?.full_name }))
        .filter((u: any) => u.id && u.full_name);
      // Deduplicate by id
      const seen = new Set<string>();
      const unique = users.filter((u: any) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
      setAllUsers(unique);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // Override status filter to 'all' when entering needs-attention mode
  useEffect(() => {
    if (isNeedsAttentionMode && statusFilter !== 'all') {
      setStatusFilter('all');
    }
  }, [isNeedsAttentionMode]);

  // Refetch when advanced filters change
  useEffect(() => {
    if (!isNeedsAttentionMode) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, raisedByFilter, assignedToFilter, sortBy, searchQuery]);

  const renderTicket = ({ item }: { item: Ticket }) => {
    const logs = item.ticket_escalation_logs;
    let escalationChain: { name: string; avatar?: string | null }[] | undefined;
    if (logs && logs.length > 0) {
      const sorted = [...logs].sort(
        (a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime()
      );
      escalationChain = [];
      sorted.forEach((log, i) => {
        if (i === 0 && log.from_employee?.full_name) {
          escalationChain!.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url ?? undefined });
        }
        if (log.to_employee?.full_name) {
          escalationChain!.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url ?? undefined });
        }
      });
      if (escalationChain.length === 0) escalationChain = undefined;
    }
    return (
      <TicketListItem
        id={item.id}
        title={item.title}
        status={item.status}
        priority={item.priority ?? 'medium'}
        ticketNumber={item.ticket_number ?? item.id.slice(0, 8).toUpperCase()}
        createdAt={item.created_at}
        assignedTo={item.assignee?.full_name}
        assigneePhotoUrl={item.assignee?.user_photo_url}
        photoUrl={item.photo_before_url ?? undefined}
        escalationChain={escalationChain}
        onPress={() => router.push(`/property/${propertyId}/tickets/${item.id}`)}
      />
    );
  };

  const bg = isDark ? '#0F1521' : '#F5F0E8';
  const cardBg = isDark ? 'rgba(30,38,55,0.88)' : 'rgba(255,255,255,0.88)';
  const textPrimary = isDark ? '#F0F4F8' : '#1A2332';
  const textSecondary = isDark ? '#A0AEC0' : '#64748B';
  const borderColor = isDark ? 'rgba(80,100,130,0.30)' : 'rgba(180,195,210,0.35)';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <LinearGradient 
        colors={isDark ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']} 
        style={StyleSheet.absoluteFillObject} 
      />

      <View style={[styles.container, { paddingBottom: 0 }]}>
        {/* Modern Header */}
        <SafeBlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitleMain, { color: textPrimary }]}>
              {isNeedsAttentionMode ? 'Needs Attention' : 'Requests'}
            </Text>
            <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.headerAddBtn}>
              <Ionicons name="options-outline" size={22} color={textPrimary} />
              {hasActiveFilters && (
                <View style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#F59E0B',
                }} />
              )}
            </TouchableOpacity>
          </View>

          {/* Filter Tabs - Glass Style */}
          {!isNeedsAttentionMode && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabScroll}
              style={styles.tabBarContainer} showsVerticalScrollIndicator={false}>
              {FILTER_TABS.map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tab,
                    statusFilter === tab.key && {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)',
                    },
                  ]}
                  onPress={() => setStatusFilter(tab.key)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: statusFilter === tab.key ? textPrimary : textSecondary },
                      statusFilter === tab.key && { fontWeight: '800' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  <View style={[styles.countBadge, {
                    backgroundColor: statusFilter === tab.key ? '#7CB9A8' : 'rgba(124,185,168,0.2)',
                  }]}>
                    <Text style={[styles.countBadgeText, { color: statusFilter === tab.key ? '#FFF' : '#7CB9A8' }]}>
                      {statusCounts[tab.key]}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {isNeedsAttentionMode && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: textSecondary, fontWeight: '600' }}>
                Critical, tenant & stale tickets
              </Text>
            </View>
          )}
        </SafeBlurView>

        {/* Date Range Filter */}
        <View style={[styles.dateFilterRow, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            style={styles.dateFilterBtn}
            onPress={() => setShowDateFilter(!showDateFilter)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={15} color={textSecondary} />
            <Text style={[styles.dateFilterLabel, { color: textSecondary }]}>
              {DATE_RANGES.find(d => d.key === dateRange)?.label ?? 'All Time'}
            </Text>
            <Ionicons
              name={showDateFilter ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Date Range Dropdown */}
        {showDateFilter && (
          <View style={[styles.dateFilterDropdown, { backgroundColor: cardBg, borderColor }]}>
            {DATE_RANGES.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.dateFilterOption,
                  dateRange === opt.key && { backgroundColor: isDark ? 'rgba(124,185,168,0.12)' : 'rgba(124,185,168,0.08)' },
                ]}
                onPress={() => { setDateRange(opt.key); setShowDateFilter(false); }}
              >
                <Text style={[styles.dateFilterOptionText, {
                  color: dateRange === opt.key ? '#7CB9A8' : textSecondary,
                  fontWeight: dateRange === opt.key ? '700' : '500',
                }]}>
                  {opt.label}
                </Text>
                {dateRange === opt.key && (
                  <Ionicons name="checkmark" size={16} color="#7CB9A8" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Ticket List */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#7CB9A8" />
          </View>
        ) : displayedTickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ticket-outline" size={64} color={isDark ? '#4B5563' : '#CBD5E1'} />
            <Text style={[styles.emptyTitle, { color: textPrimary }]}>No Requests</Text>
            <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
              {isNeedsAttentionMode
                ? 'No tickets need attention right now. Great job!'
                : statusFilter === 'all'
                  ? 'No requests found for this property.'
                  : `No ${statusFilter.replace('_', ' ')} requests.`}
            </Text>
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.emptyCreateBtnText}>Raise a Request</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayedTickets}
            renderItem={renderTicket}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={isFetching}
                onRefresh={onRefresh}
                tintColor="#7CB9A8"
                colors={['#7CB9A8']}
              />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isFetching && limit > PAGE_SIZE ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color="#7CB9A8" />
                </View>
              ) : hasMore ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
                  <Text style={styles.loadMoreBtnText}>Load More</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        )}


      </View>

        <TicketCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          propertyId={propertyId ?? ''}
          organizationId={orgId}
          role={(membership as any)?.role === 'org_super_admin' ? 'super_admin' : ((membership as any)?.role === 'property_admin' ? 'admin' : 'tenant')}
        />

        {/* Filter Modal */}
        <Modal
          visible={showFilterModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFilterModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={() => setShowFilterModal(false)}
              />
              <View style={[
                styles.filterModalContent,
                { backgroundColor: isDark ? '#1E2633' : '#FFF' }
              ]}>
                {/* Handle */}
                <View style={{ width: 40, height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: textPrimary }}>Filters</Text>
                  <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                    <Ionicons name="close" size={22} color={textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '70%' }}>
                  {/* Search */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.filterLabel, { color: textSecondary }]}>Search</Text>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
                      borderRadius: 12, paddingHorizontal: 12, backgroundColor: isDark ? '#2D3748' : '#F8FAFC'
                    }}>
                      <Ionicons name="search" size={16} color={textSecondary} />
                      <TextInput
                        style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: textPrimary, fontSize: 14 }}
                        placeholder="Search by title or ticket ID..."
                        placeholderTextColor={isDark ? '#64748B' : '#CBD5E1'}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                          <Ionicons name="close-circle" size={16} color={textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Category */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.filterLabel, { color: textSecondary }]}>Category</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {CATEGORIES.map(cat => (
                        <TouchableOpacity
                          key={cat.value}
                          style={{
                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                            backgroundColor: categoryFilter === cat.value
                              ? (isDark ? 'rgba(124,185,168,0.2)' : 'rgba(124,185,168,0.1)')
                              : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'),
                            borderWidth: 1,
                            borderColor: categoryFilter === cat.value ? '#7CB9A8' : (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
                          }}
                          onPress={() => setCategoryFilter(cat.value)}
                        >
                          <Text style={{
                            fontSize: 12, fontWeight: categoryFilter === cat.value ? '700' : '500',
                            color: categoryFilter === cat.value ? '#7CB9A8' : textSecondary
                          }}>
                            {cat.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Sort By */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.filterLabel, { color: textSecondary }]}>Sort By</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {SORT_OPTIONS.map(opt => (
                        <TouchableOpacity
                          key={opt.value}
                          style={{
                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                            backgroundColor: sortBy === opt.value
                              ? (isDark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)')
                              : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'),
                            borderWidth: 1,
                            borderColor: sortBy === opt.value ? '#3B82F6' : (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
                          }}
                          onPress={() => setSortBy(opt.value)}
                        >
                          <Text style={{
                            fontSize: 12, fontWeight: sortBy === opt.value ? '700' : '500',
                            color: sortBy === opt.value ? '#3B82F6' : textSecondary
                          }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Raised By */}
                  {allUsers.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={[styles.filterLabel, { color: textSecondary }]}>Raised By</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                            backgroundColor: raisedByFilter === 'all'
                              ? (isDark ? 'rgba(124,185,168,0.2)' : 'rgba(124,185,168,0.1)')
                              : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'),
                            borderWidth: 1,
                            borderColor: raisedByFilter === 'all' ? '#7CB9A8' : (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
                          }}
                          onPress={() => setRaisedByFilter('all')}
                        >
                          <Text style={{
                            fontSize: 12, fontWeight: raisedByFilter === 'all' ? '700' : '500',
                            color: raisedByFilter === 'all' ? '#7CB9A8' : textSecondary
                          }}>All</Text>
                        </TouchableOpacity>
                        {allUsers.map(u => (
                          <TouchableOpacity
                            key={u.id}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                              backgroundColor: raisedByFilter === u.id
                                ? (isDark ? 'rgba(124,185,168,0.2)' : 'rgba(124,185,168,0.1)')
                                : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'),
                              borderWidth: 1,
                              borderColor: raisedByFilter === u.id ? '#7CB9A8' : (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
                            }}
                            onPress={() => setRaisedByFilter(u.id)}
                          >
                            <Text style={{
                              fontSize: 12, fontWeight: raisedByFilter === u.id ? '700' : '500',
                              color: raisedByFilter === u.id ? '#7CB9A8' : textSecondary
                            }}>{u.full_name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Assigned To */}
                  {allUsers.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={[styles.filterLabel, { color: textSecondary }]}>Assigned To</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                            backgroundColor: assignedToFilter === 'all'
                              ? (isDark ? 'rgba(124,185,168,0.2)' : 'rgba(124,185,168,0.1)')
                              : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'),
                            borderWidth: 1,
                            borderColor: assignedToFilter === 'all' ? '#7CB9A8' : (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
                          }}
                          onPress={() => setAssignedToFilter('all')}
                        >
                          <Text style={{
                            fontSize: 12, fontWeight: assignedToFilter === 'all' ? '700' : '500',
                            color: assignedToFilter === 'all' ? '#7CB9A8' : textSecondary
                          }}>All</Text>
                        </TouchableOpacity>
                        {allUsers.map(u => (
                          <TouchableOpacity
                            key={u.id}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                              backgroundColor: assignedToFilter === u.id
                                ? (isDark ? 'rgba(124,185,168,0.2)' : 'rgba(124,185,168,0.1)')
                                : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'),
                              borderWidth: 1,
                              borderColor: assignedToFilter === u.id ? '#7CB9A8' : (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
                            }}
                            onPress={() => setAssignedToFilter(u.id)}
                          >
                            <Text style={{
                              fontSize: 12, fontWeight: assignedToFilter === u.id ? '700' : '500',
                              color: assignedToFilter === u.id ? '#7CB9A8' : textSecondary
                            }}>{u.full_name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </ScrollView>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', borderRadius: 12 }}
                    onPress={() => {
                      setSearchQuery('');
                      setCategoryFilter('all');
                      setSortBy('newest');
                      setRaisedByFilter('all');
                      setAssignedToFilter('all');
                    }}
                  >
                    <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 14 }}>Clear All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1.5, paddingVertical: 12, alignItems: 'center', backgroundColor: '#7CB9A8', borderRadius: 12 }}
                    onPress={() => {
                      setShowFilterModal(false);
                      refetch();
                    }}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>Apply Filters</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleMain: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBarContainer: {
    marginTop: 0,
  },
  tabScroll: {
    gap: 8,
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  countBadge: {
    marginLeft: 8,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  dateFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dateFilterLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  dateFilterDropdown: {
    position: 'absolute',
    top: 180,
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  dateFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateFilterOptionText: {
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 100,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreBtn: {
    marginVertical: 16,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#7CB9A8',
    borderRadius: 20,
  },
  loadMoreBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyCreateBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#7CB9A8',
    borderRadius: 12,
  },
  emptyCreateBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7CB9A8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  filterModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(124,185,168,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalForm: { flex: 1 },
  field: { marginBottom: 20 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    height: 120,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mediaPlaceholder: {
    height: 100,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mediaPlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mediaPreview: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeMedia: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: '#7CB9A8',
    padding: 18,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 40,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  successView: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  successText: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});
