/**
 * Security Dashboard - Simplified Security Officer Portal
 *
 * Features (matching web app):
 * - Overview: KPI stats, security alerts
 * - Visitor Management: View visitor logs
 * - Security Incidents: View/report incidents
 * - Quick access to Diesel and SOPs
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useGlobalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useAuth } from '@/hooks/useAuth';
import { vmsService } from '@/services/vmsService';
import { ticketService } from '@/services/ticketService';
import {
  Shield,
  Users,
  AlertTriangle,
  Ticket as TicketIcon,
  ClipboardList,
  Siren,
  ChevronRight,
  UserCheck,
  Clock,
  Fuel,
  Eye,
  Settings,
} from 'lucide-react-native';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';

// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiStats {
  activeVisitors: number;
  incidentsToday: number;
  securityAlerts: number;
  openTickets: number;
}

interface VisitorLog {
  id: string;
  visitor_id: string;
  name: string;
  mobile?: string;
  category: string;
  whom_to_meet: string;
  checkin_time: string;
  checkout_time?: string;
  status: 'checked_in' | 'checked_out';
}

// ─── KPI Card Component ──────────────────────────────────────────────────────

function KpiCard({ label, value, icon, color, delay }: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)} style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: color + '20' }]}>
        {icon}
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Animated.View>
  );
}

// ─── Visitor Row Component ─────────────────────────────────────────────────

function VisitorRow({ visitor, delay }: { visitor: VisitorLog; delay: number }) {
  const isActive = visitor.status === 'checked_in';

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)}>
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
        style={styles.visitorRow}
      >
        <View style={[styles.visitorAvatar, { backgroundColor: isActive ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)' }]}>
          <UserCheck size={18} color={isActive ? '#10B981' : 'rgba(255,255,255,0.4)'} />
        </View>
        <View style={styles.visitorInfo}>
          <Text style={styles.visitorName}>{visitor.name}</Text>
          <Text style={styles.visitorMeta}>
            Meeting: {visitor.whom_to_meet}
          </Text>
          <Text style={styles.visitorTime}>
            {new Date(visitor.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={styles.visitorStatus}>
          <Text style={[styles.statusBadge, { color: isActive ? '#10B981' : '#64748B' }]}>
            {isActive ? 'Active' : 'Left'}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Quick Action Button ───────────────────────────────────────────────────

function QuickAction({ label, icon, color, bgColor, onPress, delay }: {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  onPress: () => void;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)} style={styles.quickActionWrap}>
      <TouchableOpacity
        style={[styles.quickAction, { backgroundColor: bgColor }]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <View style={[styles.quickActionIcon, { backgroundColor: color + '20' }]}>
          {icon}
        </View>
        <Text style={[styles.quickActionLabel, { color }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────

export default function SecurityDashboard() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // ── Fetch Data ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!propertyId) return { stats: { activeVisitors: 0, incidentsToday: 0, securityAlerts: 0, openTickets: 0 }, visitors: [] as VisitorLog[] };

    try {
      // Fetch today's visitors
      const visitorsRes = await vmsService.getVisitorLogs(propertyId, { dateFilter: 'today' });
      const visitors: VisitorLog[] = visitorsRes.success ? visitorsRes.data ?? [] : [];
      const activeVisitors = visitors.filter(v => v.status === 'checked_in').length;

      // Fetch security incidents
      let incidentsToday = 0;
      try {
        const incidentRes = await ticketService.getTickets({
          propertyId,
          status: 'open',
          category: 'security_incident',
        });
        if (incidentRes.success && incidentRes.data) {
          incidentsToday = incidentRes.data.length;
        }
      } catch {}

      // Fetch open tickets
      let openTickets = 0;
      try {
        const ticketsRes = await ticketService.getTickets({ propertyId, status: 'open' });
        if (ticketsRes.success && ticketsRes.data) {
          openTickets = ticketsRes.data.length;
        }
      } catch {}

      return {
        stats: { activeVisitors, incidentsToday, securityAlerts: incidentsToday, openTickets },
        visitors: visitors.slice(0, 10),
      };
    } catch (err) {
      console.error('[Security] Fetch error:', err);
      return { stats: { activeVisitors: 0, incidentsToday: 0, securityAlerts: 0, openTickets: 0 }, visitors: [] as VisitorLog[] };
    }
  }, [propertyId]);

  const { data, isLoading, refetch } = useServerQuery(
    queryKeys.property.security(propertyId),
    fetchStats,
    { staleTime: 1000 * 60 }
  );

  const stats = data?.stats ?? { activeVisitors: 0, incidentsToday: 0, securityAlerts: 0, openTickets: 0 };
  const visitors = data?.visitors ?? [];

  // ── SOS Emergency ───────────────────────────────────────────────────────
  const handleSOS = () => {
    Alert.alert(
      'Emergency SOS',
      'This will create an emergency security ticket. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              await ticketService.createTicket({
                propertyId: propertyId!,
                title: 'EMERGENCY - Security Alert',
                description: 'Emergency SOS triggered from mobile app',
                category: 'security_incident',
                priority: 'urgent',
              });
              Alert.alert('SOS Sent', 'Emergency ticket created. Help is being dispatched.');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Shield size={22} color="#3B82F6" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Security</Text>
            <Text style={styles.headerSubtitle}>Officer Portal</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push(`/property/${propertyId}/visitors` as any)}
        >
          <Users size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      {/* Live Badge */}
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#fff" />}
        showsVerticalScrollIndicator={false}
      >
        {/* KPIs */}
        <View style={styles.kpiRow}>
          <KpiCard
            label="Active Visitors"
            value={stats.activeVisitors}
            icon={<Users size={20} color="#3B82F6" />}
            color="#3B82F6"
            delay={0}
          />
          <KpiCard
            label="Incidents"
            value={stats.incidentsToday}
            icon={<AlertTriangle size={20} color="#F59E0B" />}
            color="#F59E0B"
            delay={80}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            label="Security Alerts"
            value={stats.securityAlerts}
            icon={<Siren size={20} color="#EF4444" />}
            color="#EF4444"
            delay={160}
          />
          <KpiCard
            label="Open Tickets"
            value={stats.openTickets}
            icon={<TicketIcon size={20} color="#10B981" />}
            color="#10B981"
            delay={240}
          />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.quickActions}>
          <QuickAction
            label="Visitors"
            icon={<Users size={22} color="#3B82F6" />}
            color="#3B82F6"
            bgColor="rgba(59,130,246,0.15)"
            onPress={() => router.push(`/property/${propertyId}/visitors` as any)}
            delay={300}
          />
          <QuickAction
            label="Incidents"
            icon={<AlertTriangle size={22} color="#F59E0B" />}
            color="#F59E0B"
            bgColor="rgba(245,158,11,0.15)"
            onPress={() => router.push(`/property/${propertyId}/tickets?category=security_incident` as any)}
            delay={360}
          />
        </View>
        <View style={styles.quickActions}>
          <QuickAction
            label="Diesel"
            icon={<Fuel size={22} color="#6B7280" />}
            color="#6B7280"
            bgColor="rgba(107,114,128,0.15)"
            onPress={() => router.push(`/property/${propertyId}/diesel` as any)}
            delay={420}
          />
          <QuickAction
            label="SOPs"
            icon={<ClipboardList size={22} color="#8B5CF6" />}
            color="#8B5CF6"
            bgColor="rgba(139,92,246,0.15)"
            onPress={() => router.push(`/property/${propertyId}/checklist` as any)}
            delay={480}
          />
        </View>

        {/* SOS Button */}
        <Animated.View entering={FadeInUp.delay(520).duration(400)}>
          <TouchableOpacity style={styles.sosBtn} onPress={handleSOS} activeOpacity={0.8}>
            <Siren size={22} color="#EF4444" />
            <Text style={styles.sosText}>EMERGENCY SOS</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Recent Visitors */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Visitors</Text>
          <TouchableOpacity onPress={() => router.push(`/property/${propertyId}/visitors` as any)}>
            <Text style={styles.seeAll}>View All</Text>
          </TouchableOpacity>
        </View>

        {visitors.length === 0 ? (
          <Animated.View entering={FadeInUp.delay(560).duration(400)} style={styles.emptyState}>
            <Users size={40} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No visitors today</Text>
            <Text style={styles.emptySub}>Visitor logs will appear here</Text>
          </Animated.View>
        ) : (
          visitors.slice(0, 5).map((v, i) => (
            <VisitorRow key={v.id} visitor={v} delay={560 + i * 60} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '700', color: '#10B981', letterSpacing: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, gap: 14 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  kpiIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  kpiValue: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  kpiLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  seeAll: { fontSize: 12, color: '#708F96' },
  quickActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  quickActionWrap: { flex: 1 },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionLabel: { fontSize: 13, fontWeight: '600' },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.1)',
    marginTop: 8,
  },
  sosText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  emptySub: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  visitorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  visitorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visitorInfo: { flex: 1 },
  visitorName: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  visitorMeta: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  visitorTime: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  visitorStatus: { alignItems: 'flex-end' },
  statusBadge: { fontSize: 11, fontWeight: '600' },
});
