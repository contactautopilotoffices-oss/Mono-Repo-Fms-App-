import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { serverApi } from '@/lib/serverApi';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { useSuperAdminStore, type SuperAdminProperty } from '@/stores/superAdminStore';

// Modular Lovable Components
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import SignOutModal from '@/components/ui/SignOutModal';
import DetailModal, { type TileDetail } from '@/components/dashboard/DetailModal';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';

import { 
  BG, 
  LOVABLE_EMAIL, 
  fontSans, 
  fontDisplay 
} from './lovable/constants';
import { 
  Property, 
  Screen, 
  Tab, 
  Org, 
  SystemUser 
} from './lovable/types';

import PropertyCard from './lovable/PropertyCard';
import BottomNav from './lovable/BottomNav';
import PropertyDetailScreen from './lovable/PropertyDetailScreen';
import AnalyticsScreen from './lovable/AnalyticsScreen';
import SkeletonLoader from './lovable/SkeletonLoader';
import {
  SPACING,
  CARD_SURFACES,
} from '@/constants/designSystem';
import { 
  OverviewTab, 
  OrganizationsTab
} from './lovable/ConsoleScreen';

// ─── Main dashboard ────────────────────────────────────────────────────────────
export default function LovableSuperAdminDashboard() {
  const router = useRouter();
  const { user, signOut, membership, isMembershipLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const { weather } = useWeather();

  // Access control — Lovable super admin is email-gated
  const hasAccess = user?.email?.toLowerCase() === LOVABLE_EMAIL?.toLowerCase();

  // orgId — use membership from AuthContext (already fetched), fall back to org_memberships query
  const orgId = membership?.org_id ?? '';

  // ── Zustand store for instant load + background refresh ──────────────────────
  const {
    properties: cachedProperties,
    organizations: cachedOrgs,
    users: cachedUsers,
    hasLoadedInitialData,
    loadedOrgId,
    setSuperAdminData,
    clearCache,
  } = useSuperAdminStore();

  // Local state for real-time UI
  const [screen, setScreen] = useState<Screen>('properties');
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [consoleTab, setConsoleTab] = useState<Tab>('overview');
  const [showChat, setShowChat] = useState(false);
  const [showTileDetail, setShowTileDetail] = useState<TileDetail | null>(null);
  const [showSignOut, setShowSignOut] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Issue #9: Search Debounce
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [consoleSearchQuery, setConsoleSearchQuery] = useState('');

  // Use cached data for instant load, fetch in background
  const properties = cachedProperties.length > 0 ? cachedProperties : (membership?.properties?.map(p => ({
    id: p.id,
    name: p.name,
    code: p.code,
    address: '',
    image_url: p.image_url ?? undefined,
    openTickets: 0,
    resolvedTickets: 0,
    totalTickets: 0,
    healthScore: 100,
    healthStatus: 'optimal' as const,
    checklist: { completed: 0, total: 1, percent: 100 },
    energy: { diesel: 0, electricity: 0, trend: 0 },
    tickets: [],
    status: 'optimal' as const,
  })) ?? []);

  const organizations = cachedOrgs;
  const users = cachedUsers;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Derived stats
  const consoleStats = useMemo(
    () => ({
      orgs: organizations.length,
      properties: properties.length,
      users: users.length,
      tickets: properties.reduce((sum, p) => sum + (p.openTickets ?? 0), 0),
    }),
    [organizations, properties, users]
  );

  // ── Background fetch — same logic as before, writes to Zustand store ──────────
  const fetchAll = useCallback(async () => {
    if (!user) return;
    setFetchError(null);

    try {
      const dashboardResponse = await serverApi.get<{
        organizations: Org[];
        properties: SuperAdminProperty[];
        users: SystemUser[];
      }>('/api/dashboard/super-admin', orgId ? { orgId } : undefined);

      if (dashboardResponse.error) {
        throw new Error(dashboardResponse.error.message);
      }

      const dashboardData = dashboardResponse.data;
      if (!dashboardData) {
        throw new Error('No dashboard data returned');
      }

      // Save to Zustand store for next instant load
      setSuperAdminData({
        properties: (dashboardData.properties ?? []) as any,
        organizations: (dashboardData.organizations ?? []) as any,
        users: (dashboardData.users ?? []) as any,
        loadedOrgId: orgId || membership?.org_id || null,
        hasLoadedInitialData: true,
        lastUpdatedAt: Date.now(),
      });

    } catch (error) {
      setFetchError('Failed to load dashboard. Pull to refresh.');
    } finally {
      setIsRefreshing(false);
    }
  }, [user, membership, orgId, setSuperAdminData]);

  // React Query: staleTime 5 min, only fetch if membership is loaded
  const { refetch } = useDashboardFetch(
    queryKeys.admin.superAdmin(user?.id ?? 'none'),
    fetchAll,
    { staleTime: 1000 * 60 * 5, enabled: !isMembershipLoading }
  );

  // Auto-fetch when orgId changes or on first load with no cache
  useEffect(() => {
    if (!isMembershipLoading && user && loadedOrgId !== orgId) {
      refetch();
    }
  }, [isMembershipLoading, user, orgId, loadedOrgId]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
  };

  const filteredProperties = useMemo(() => {
    let result = properties;
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      result = properties.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
      );
    }
    // Sort logically by code (so PROP-002 comes before PROP-0010)
    return [...result].sort((a, b) => {
      const codeA = (a.code || '').toUpperCase();
      const codeB = (b.code || '').toUpperCase();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [properties, debouncedQuery]);

  // Access denied
  if (!hasAccess) {
    return (
      <View
        style={[
          styles.accessDenied,
          { backgroundColor: BG, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Ionicons name="shield-checkmark" size={64} color="rgba(112,143,150,0.5)" />
        <Text style={styles.accessTitle}>Access Restricted</Text>
        <Text style={styles.accessSubtitle}>
          This dashboard is reserved for authorized personnel.
        </Text>
        <Text style={styles.accessEmail}>{user?.email}</Text>
        <TouchableOpacity style={styles.accessSignOut} onPress={signOut}>
          <Text style={styles.accessSignOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Loading: show skeleton only if no cache AND membership still loading ────────
  const isLoading = !hasLoadedInitialData && properties.length === 0;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: BG, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <SkeletonLoader />
      </View>
    );
  }

  // Console tab content
  const renderConsoleTab = () => {
    switch (consoleTab) {
      case 'overview':
        return (
          <OverviewTab
            stats={consoleStats}
            organizations={organizations}
            onSeeAllOrgs={() => setConsoleTab('organizations')}
          />
        );
      case 'organizations':
        return (
          <OrganizationsTab
            organizations={organizations}
            searchQuery={consoleSearchQuery}
            setSearchQuery={setConsoleSearchQuery}
          />
        );
      default:
        return null;
    }
  };

  const handlePropertyPress = (p: SuperAdminProperty) => {
    router.replace(`/property/${p.id}/dashboard` as never);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1c2135', '#0f121e', '#07090e']}
        style={StyleSheet.absoluteFillObject}
      />
      <WeatherBackground condition={weather?.condition} />

      {/* Main Content Area */}
      <View style={{ flex: 1 }}>
        {screen === 'property-detail' && activeProperty ? (
          <PropertyDetailScreen
            property={activeProperty}
            onBack={() => {
              setScreen('properties');
              setActiveProperty(null);
            }}
            onShowChat={() => setShowChat(true)}
            onShowTileDetail={(detail) => setShowTileDetail(detail)}
          />
        ) : screen === 'properties' ? (
          <Animated.ScrollView
            style={styles.mainScroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor="rgba(255,255,255,0.6)"
              />
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          >
            {/* Header */}
            <View style={[styles.mainHeader, { paddingTop: insets.top + 12 }]}>
              <View>
                <Text style={styles.mainTitle}>Properties</Text>
                <Text style={styles.mainSubtitle}>Super Admin Dashboard</Text>
              </View>
              <TouchableOpacity
                style={styles.signOutIconBtn}
                onPress={() => setShowSignOut(true)}
              >
                <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.60)" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="rgba(255,255,255,0.45)" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search properties..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Error banner */}
            {fetchError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color="#FF9500" />
                <Text style={styles.errorBannerText}>{fetchError}</Text>
                <TouchableOpacity onPress={onRefresh}>
                  <Text style={styles.errorBannerRetry}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Properties list */}
            <View style={styles.propertiesList}>
              {filteredProperties.map((p, i) => (
                <PropertyCard
                  key={p.id}
                  property={p}
                  index={i}
                  onPress={() => handlePropertyPress(p)}
                />
              ))}
              {filteredProperties.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="grid-outline" size={40} color="rgba(255,255,255,0.30)" />
                  <Text style={styles.emptyText}>No properties found</Text>
                </View>
              )}
            </View>
          </Animated.ScrollView>
        ) : screen === 'console' ? (
          <View style={{ flex: 1 }}>
            <View style={[styles.consoleTabs, { marginTop: insets.top + 12 }]}>
              {(['overview', 'organizations'] as Tab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.consoleTab, consoleTab === tab && styles.consoleTabActive]}
                  onPress={() => setConsoleTab(tab)}
                >
                  <Text
                    style={[
                      styles.consoleTabText,
                      consoleTab === tab && styles.consoleTabTextActive,
                    ]}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderConsoleTab()}
          </View>
        ) : screen === 'analytics' ? (
          <AnalyticsScreen />
        ) : null}
      </View>



      {/* Modals */}
      <CassandraSessionModal visible={showChat} onClose={() => setShowChat(false)} orgId={orgId} propertyId={membership?.properties?.[0]?.id} initialMode="voice" />
      <SignOutModal
        visible={showSignOut}
        onClose={() => setShowSignOut(false)}
        onSignOut={signOut}
      />
      <DetailModal
        detail={showTileDetail}
        onClose={() => setShowTileDetail(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingContainer: { flex: 1 },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 20,
      },
  accessSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 8,
    textAlign: 'center',
      },
  accessEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.30)',
    marginTop: 12,
      },
  accessSignOut: {
    marginTop: 32,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  accessSignOutText: { color: '#FFFFFF', fontWeight: '600' },
  consoleTabs: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: 6,
    zIndex: 10,
  },
  consoleTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  consoleTabActive: { backgroundColor: 'rgba(112,143,150,0.25)' },
  consoleTabText: {
        fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  consoleTabTextActive: { color: '#708F96' },
  mainScroll: { flex: 1, zIndex: 10 },
  mainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1.2,
        lineHeight: 36,
  },
  mainSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
      },
  signOutIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_SURFACES.cardBg,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 11,
    borderRadius: 14,
    borderColor: CARD_SURFACES.cardBorder,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
        paddingVertical: 0,
  },
  propertiesList: { paddingHorizontal: SPACING.xl, gap: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.md },
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyText: {
        fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,149,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.30)',
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
        fontSize: 13,
    color: '#FF9500',
  },
  errorBannerRetry: {
        fontSize: 13,
    fontWeight: '700',
    color: '#FF9500',
    textDecorationLine: 'underline',
  },
});
