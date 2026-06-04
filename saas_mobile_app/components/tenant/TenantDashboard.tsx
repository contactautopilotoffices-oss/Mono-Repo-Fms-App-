import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import { useTenantTickets } from '@/hooks/tenant/useTenantTickets';
import { useSuperTenantProperties } from '@/hooks/tenant/useSuperTenantProperties';
import SignOutModal from '@/components/ui/SignOutModal';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';
import NotificationModal from '@/components/notifications/NotificationModal';
import TenantBottomNav from '@/components/tenant/TenantBottomNav';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import DashboardBackground from '@/components/dashboard/DashboardBackground';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { TicketCreateModal } from '../tickets/TicketCreateModal';
import { AutopilotLogo } from '@/components/ui/AutopilotLogo';
import { getMeetingRoomCredits } from '@/services/meetingRoomService';
import { GlassModuleCard } from './GlassModuleCard';
import SkeletonLoader from '../dashboard/lovable/SkeletonLoader';
import {
  Building2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Users,
  Calendar,
  ChevronRight,
  LayoutGrid,
  Ticket,
  Settings,
} from 'lucide-react-native';

type DashboardTab = 'overview' | 'requests' | 'visitors' | 'rooms' | 'profile';

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

interface TenantDashboardProps {
  propertyId: string;
  isSuperTenant?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function TenantDashboard({ propertyId, isSuperTenant }: TenantDashboardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, membership } = useAuth();
  const { weather } = useWeather();

  const [showChat, setShowChat] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId);
  const [propertyName, setPropertyName] = useState('Property');
  const [remainingHours, setRemainingHours] = useState<number | null>(null);

  const { tickets, loading: ticketsLoading, refetch: refetchTickets } = useTenantTickets(selectedPropertyId, user?.id);
  const { properties: superTenantProperties } = useSuperTenantProperties(isSuperTenant ? user?.id : undefined);

  // Minimum skeleton duration state
  const [showSkeleton, setShowSkeleton] = useState(true);

  useEffect(() => {
    if (!ticketsLoading && tickets.length > 0) {
      const timer = setTimeout(() => setShowSkeleton(false), 600);
      return () => clearTimeout(timer);
    } else if (ticketsLoading) {
      setShowSkeleton(true);
    }
  }, [ticketsLoading, tickets]);

  useEffect(() => {
    if (!selectedPropertyId) return;

    // Use membership instead of direct Supabase call for property name
    if (membership?.properties) {
      const prop = membership.properties.find(p => p.id === selectedPropertyId);
      if (prop) setPropertyName(prop.name || 'Property');
    }

    getMeetingRoomCredits(selectedPropertyId).then((res) => {
      if (res.credit && res.credit.remaining_hours !== undefined) {
        setRemainingHours(res.credit.remaining_hours);
      } else {
        setRemainingHours(null);
      }
    }).catch((err) => {
      console.log('Failed to fetch meeting room credits', err);
    });
  }, [selectedPropertyId, membership]);

  const ticketStats = useMemo(() => {
    const open = tickets.filter((t: any) => !['resolved', 'closed'].includes(t.status)).length;
    const completed = tickets.filter((t: any) => ['resolved', 'closed'].includes(t.status)).length;
    return { open, completed, total: tickets.length };
  }, [tickets]);

  const onRefresh = useCallback(async () => {
    await refetchTickets();
  }, [refetchTickets]);

  const fullName = user?.user_metadata?.full_name || 'Client';
  const firstName = fullName.split(' ')[0];
  const initials = getInitials(fullName);

  const handleTicketCreated = () => {
    setShowTicketModal(false);
    refetchTickets();
  };

  // Show skeleton on first load
  if (showSkeleton) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <DashboardBackground />
        <SkeletonLoader />
      </View>
    );
  }

  const drawerItems = [
    { label: 'Dashboard', route: 'tenant', icon: 'grid-outline' as const },
    { label: 'My Tickets', route: 'tenant/requests', icon: 'ticket-outline' as const },
    { label: 'Meeting Rooms', route: 'rooms', icon: 'calendar-outline' as const },
    { label: 'Visitors', route: 'tenant/visitors', icon: 'people-outline' as const },
    { label: 'Communities', route: 'tenant/communities', icon: 'chatbubbles-outline' as const },
    { label: 'Cassandra AI', route: 'cassandra', icon: 'sparkles-outline' as const },
    { label: 'Profile', route: 'profile', icon: 'person-outline' as const },
    { label: 'Settings', route: 'settings', icon: 'settings-outline' as const },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <DashboardBackground />
      {weather && <WeatherBackground condition={weather.condition} />}

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={ticketsLoading} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        {/* Header — EXACT match to screenshot */}
        <Animated.View entering={FadeInUp.duration(500)} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.iconPill} onPress={() => setShowDrawer(true)} activeOpacity={0.8}>
              <Ionicons name="menu" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={{ flexShrink: 1 }}>
              <Text style={styles.headerGreeting} numberOfLines={1}>
                Hey, {firstName}
              </Text>
              <Text style={styles.headerProperty} numberOfLines={1}>
                {propertyName}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconPill} onPress={() => setShowTicketModal(true)} activeOpacity={0.8}>
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.iconPill} 
              activeOpacity={0.8}
              onPress={() => setShowNotifications(true)}
            >
              <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
              {ticketStats.open > 0 && <View style={styles.notificationDot} />}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Super Tenant Property Picker */}
        {isSuperTenant && superTenantProperties && superTenantProperties.length > 1 && (
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.propertyPicker}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.propertyChips}>
              {superTenantProperties.map((prop) => (
                <TouchableOpacity
                  key={prop.id}
                  style={[styles.propertyChip, selectedPropertyId === prop.property_id && styles.propertyChipActive]}
                  onPress={() => setSelectedPropertyId(prop.property_id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.propertyChipText, selectedPropertyId === prop.property_id && styles.propertyChipTextActive]}>
                    {prop.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Super Tenant Tab Bar */}
        {isSuperTenant && (
          <Animated.View entering={FadeInUp.delay(130).duration(400)} style={styles.tabBarContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
              {[
                { key: 'overview', label: 'Overview', icon: <LayoutGrid size={16} color={activeTab === 'overview' ? '#5A8A8F' : 'rgba(255,255,255,0.5)'} /> },
                { key: 'requests', label: 'Requests', icon: <Ticket size={16} color={activeTab === 'requests' ? '#5A8A8F' : 'rgba(255,255,255,0.5)'} /> },
                { key: 'visitors', label: 'Visitors', icon: <Users size={16} color={activeTab === 'visitors' ? '#5A8A8F' : 'rgba(255,255,255,0.5)'} /> },
                { key: 'rooms', label: 'Rooms', icon: <Calendar size={16} color={activeTab === 'rooms' ? '#5A8A8F' : 'rgba(255,255,255,0.5)'} /> },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.key as DashboardTab)}
                  activeOpacity={0.8}
                >
                  {tab.icon}
                  <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Super Tenant Quick Stats */}
        {isSuperTenant && activeTab === 'overview' && (
          <Animated.View entering={FadeInUp.delay(150).duration(500)} style={styles.superTenantStats}>
            <View style={styles.statsRow}>
              <TouchableOpacity style={styles.statCard} activeOpacity={0.8} onPress={() => { setActiveTab('requests'); }}>
                <View style={[styles.statIcon, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
                  <CheckCircle2 size={20} color="#3B82F6" />
                </View>
                <Text style={styles.statValue}>{ticketStats.open}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statCard} activeOpacity={0.8} onPress={() => setSelectedPropertyId(propertyId)}>
                <View style={[styles.statIcon, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                  <Users size={20} color="#10B981" />
                </View>
                <Text style={styles.statValue}>{superTenantProperties.length}</Text>
                <Text style={styles.statLabel}>Properties</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statCard} activeOpacity={0.8} onPress={() => { setActiveTab('rooms'); }}>
                <View style={[styles.statIcon, { backgroundColor: 'rgba(139,92,246,0.2)' }]}>
                  <Calendar size={20} color="#8B5CF6" />
                </View>
                <Text style={styles.statValue}>{remainingHours !== null ? remainingHours : '--'}</Text>
                <Text style={styles.statLabel}>Hrs Left</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Super Tenant Tab Content */}
        {isSuperTenant && activeTab === 'requests' && (
          <View style={styles.tabContent}>
            <TouchableOpacity style={styles.createTicketBtn} onPress={() => setShowTicketModal(true)}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.createTicketText}>Create New Request</Text>
            </TouchableOpacity>
            <Text style={styles.tabSectionTitle}>Active Requests</Text>
            {tickets.filter(t => !['resolved', 'closed'].includes(t.status as string)).length === 0 ? (
              <View style={styles.emptyTab}>
                <CheckCircle2 size={48} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyTabText}>No active requests</Text>
              </View>
            ) : (
              tickets.filter(t => !['resolved', 'closed'].includes(t.status as string)).map((ticket: any, index: number) => (
                <TouchableOpacity key={ticket.id} style={styles.ticketCard} onPress={() => router.push(`/property/${propertyId}/tenant/requests` as any)}>
                  <View style={styles.ticketLeft}>
                    <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title || 'Request'}</Text>
                    <Text style={styles.ticketMeta}>#{ticket.ticket_number || ticket.id.slice(0, 8)}</Text>
                  </View>
                  <View style={styles.ticketRight}>
                    <Text style={[styles.ticketStatus, { color: ticket.status === 'open' ? '#3B82F6' : '#F59E0B' }]}>
                      {(ticket.status as string).replace('_', ' ').toUpperCase()}
                    </Text>
                    <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {isSuperTenant && activeTab === 'visitors' && (
          <View style={styles.tabContent}>
            <TouchableOpacity style={styles.createTicketBtn} onPress={() => router.push(`/property/${propertyId}/tenant/visitors` as any)}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.createTicketText}>Add Visitor</Text>
            </TouchableOpacity>
            <Text style={styles.tabSectionTitle}>Recent Visitors</Text>
            <View style={styles.emptyTab}>
              <Users size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyTabText}>View visitor logs in the Visitors tab</Text>
              <TouchableOpacity style={styles.viewAllBtn} onPress={() => router.push(`/property/${propertyId}/tenant/visitors` as any)}>
                <Text style={styles.viewAllText}>View All Visitors</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isSuperTenant && activeTab === 'rooms' && (
          <View style={styles.tabContent}>
            <TouchableOpacity style={styles.createTicketBtn} onPress={() => router.push(`/property/${propertyId}/rooms` as any)}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.createTicketText}>Book a Room</Text>
            </TouchableOpacity>
            <Text style={styles.tabSectionTitle}>Meeting Room Credits</Text>
            <View style={styles.creditsCard}>
              <View style={styles.creditsMain}>
                <Text style={styles.creditsValue}>{remainingHours !== null ? remainingHours : '--'}</Text>
                <Text style={styles.creditsUnit}>HOURS</Text>
              </View>
              <Text style={styles.creditsLabel}>Available Credits</Text>
            </View>
            <TouchableOpacity style={styles.viewAllBtn} onPress={() => router.push(`/property/${propertyId}/rooms` as any)}>
              <Text style={styles.viewAllText}>View All Rooms</Text>
              <ChevronRight size={16} color="#5A8A8F" />
            </TouchableOpacity>
          </View>
        )}

        {/* Module Cards — Glass Style (for non-Super Tenant or Super Tenant Overview) */}
        {(!isSuperTenant || activeTab === 'overview') && (
          <View style={styles.cardsContainer}>
            <GlassModuleCard
              icon="chatbubble-ellipses-outline"
              title="Helpdesk & Ticketing"
              description="Report issues, track requests & get support instantly."
              badge={ticketStats.open > 0 ? ticketStats.open : undefined}
              statusLine={`${ticketStats.open} ACTIVE · ${ticketStats.completed} COMPLETED`}
              delay={120}
              onPress={() => router.push(`/property/${propertyId}/tenant/requests` as any)}
            />

            <GlassModuleCard
              icon="people-outline"
              title="Visitor Management"
              description="Secure building access & visitor check-in system."
              statusLine="ACCESS CONTROL"
              delay={200}
              onPress={() => router.push(`/property/${propertyId}/tenant/visitors` as any)}
            />

            <GlassModuleCard
              icon="calendar-outline"
              title="Meeting Rooms"
              description="Reserve meeting spaces & conference rooms with ease."
              statusLine="ROOM BOOKING"
              rightStatusText={remainingHours !== null ? `${remainingHours} HRS LEFT` : undefined}
              delay={280}
              onPress={() => router.push(`/property/${propertyId}/rooms` as any)}
            />
          </View>
        )}
      </ScrollView>

      <TenantBottomNav />

      {/* Modals */}
      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
      <CassandraSessionModal visible={showChat} onClose={() => setShowChat(false)} orgId={membership?.org_id || ''} propertyId={selectedPropertyId} />

      <TicketCreateModal
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        propertyId={selectedPropertyId}
        organizationId={membership?.org_id ?? ''}
        role="tenant"
        onSuccess={handleTicketCreated}
      />

      <NotificationModal 
        visible={showNotifications} 
        onClose={() => setShowNotifications(false)} 
        propertyId={selectedPropertyId} 
        role="tenant"
      />

      {/* Drawer */}
      <Modal visible={showDrawer} transparent animationType="fade" onRequestClose={() => setShowDrawer(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={[styles.drawerPanel, { paddingTop: insets.top + 16, backgroundColor: '#0a0a0a' }]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerLogoContainer}>
                <AutopilotLogo size={54} variant="light" />
              </View>
              <TouchableOpacity onPress={() => setShowDrawer(false)} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <Text style={styles.drawerSectionLabel}>MENU</Text>
              {drawerItems.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={styles.drawerItem}
                  onPress={() => {
                    setShowDrawer(false);
                    if (item.route === 'cassandra') {
                      router.push(`/cassandra?propertyId=${selectedPropertyId}` as any);
                    } else {
                      router.push(`/property/${propertyId}/${item.route}` as any);
                    }
                  }}
                >
                  <Ionicons name={item.icon} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.drawerFooter}>
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={() => {
                  setShowDrawer(false);
                  setShowSignOut(true);
                }}
              >
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setShowDrawer(false)} />
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerGreeting: {
    fontFamily: FONT_DISPLAY,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  headerProperty: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  propertyPicker: {
    marginBottom: 16,
  },
  superTenantStats: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  propertyChips: {
    paddingHorizontal: 16,
    gap: 8,
  },
  propertyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  propertyChipActive: {
    backgroundColor: '#5A8A8F',
    borderColor: '#5A8A8F',
  },
  propertyChipText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  propertyChipTextActive: {
    color: '#FFFFFF',
  },
  tabBarContainer: {
    marginBottom: 16,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabItemActive: {
    backgroundColor: 'rgba(90,138,143,0.2)',
    borderColor: '#5A8A8F',
  },
  tabIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  tabLabelActive: {
    color: '#5A8A8F',
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  tabSectionTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    marginTop: 8,
  },
  createTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5A8A8F',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  createTicketText: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyTab: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTabText: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  ticketCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ticketLeft: {
    flex: 1,
  },
  ticketTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ticketMeta: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  ticketRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketStatus: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '600',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 16,
  },
  viewAllText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '600',
    color: '#5A8A8F',
  },
  creditsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  creditsMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  creditsValue: {
    fontFamily: FONT_DISPLAY,
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  creditsUnit: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  creditsLabel: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  cardsContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  cardTouchable: {
    width: '100%',
  },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardContent: {
    padding: 20,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  cardDescription: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 20,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  cardStatus: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    color: '#B8956A',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  cardStatusRight: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    color: '#4ade80',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  drawerPanel: {
    width: 280,
    height: '100%',
    paddingHorizontal: 20,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  drawerLogoContainer: {
    flexDirection: 'column',
  },
  drawerSubtitle: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
    marginTop: 6,
  },
  drawerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerSectionLabel: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingVertical: 14,
  },
  drawerItemLabel: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 16,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  signOutText: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
});
