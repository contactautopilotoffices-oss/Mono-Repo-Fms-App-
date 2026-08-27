'use client';

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter, useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SafeBlurView from '@/components/ui/SafeBlurView';
import GlobalNavigationDrawer from '@/components/shared/GlobalNavigationDrawer';
import { useAuth } from '@/hooks/useAuth';

export default function GlobalBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { propertyId: localPropId } = useGlobalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { membership } = useAuth();
  const [showDrawer, setShowDrawer] = useState(false);

  // Safely extract propertyId from pathname to prevent stale layout bugs in Expo Router
  const propertyId = useMemo(() => {
    if (!pathname) return localPropId;
    const parts = pathname.split('/');
    const propIdx = parts.indexOf('property');
    if (propIdx !== -1 && parts.length > propIdx + 1) {
      return parts[propIdx + 1];
    }
    return localPropId;
  }, [pathname, localPropId]);

  const propRole = useMemo(() => {
    const prop = membership?.properties?.find((p: any) => p.id === propertyId);
    return (prop?.role || membership?.org_role || 'staff').toLowerCase().replace(/\s+/g, '_');
  }, [membership, propertyId]);

  const isManager = propRole.includes('manager') || propRole.includes('supervisor') || propRole.includes('admin');
  const isSoftServicesStaff = (propRole.includes('soft_service') || propRole.includes('housekeeping')) && !isManager;
  const isSecurity = propRole.includes('security');

  // Detect active tab from current pathname
  const activeTab = useMemo(() => {
    if (!pathname) return 'more';
    const p = pathname.toLowerCase();
    if (p.endsWith('/dashboard') || p.endsWith('/security') || p.endsWith('/property/' + propertyId?.toLowerCase()) || p.match(/\/property\/[^\/]+$/)) return 'dashboard';
    if (p.includes('/tickets')) return 'tickets';
    if (p.includes('/checklist')) return 'checklist';
    if (p.includes('/stock')) return 'stock';
    return 'more';
  }, [pathname, propertyId]);

  const navigate = (route: string) => {
    const validPropId = (propertyId && propertyId !== 'undefined' && propertyId !== 'null') 
      ? propertyId 
      : (membership?.properties?.[0]?.id ?? 'all');
      
    router.push(`/property/${validPropId}/${route}` as any);
  };

  return (
    <>
      <View style={styles.container}>
        <SafeBlurView intensity={80} style={[styles.navPill, { paddingBottom: insets.bottom > 0 ? insets.bottom + 6 : 14 }]} tint="dark">
          {/* 1. Dashboard / Overview */}
          <TouchableOpacity
            style={[styles.navItem, activeTab === 'dashboard' && styles.navItemActive]}
            onPress={() => navigate(isSecurity ? 'security' : 'dashboard')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={activeTab === 'dashboard' ? (isSecurity ? 'shield' : 'grid') : (isSecurity ? 'shield-outline' : 'grid-outline')}
              size={22}
              color={activeTab === 'dashboard' ? '#FFF' : 'rgba(255,255,255,0.45)'}
            />
            <Text style={[styles.navLabel, activeTab === 'dashboard' && styles.navLabelActive]}>
              {isSecurity ? 'Overview' : 'Dashboard'}
            </Text>
          </TouchableOpacity>

          {/* 2. Tickets */}
          <TouchableOpacity
            style={[styles.navItem, activeTab === 'tickets' && styles.navItemActive]}
            onPress={() => navigate('tickets')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={activeTab === 'tickets' ? 'ticket' : 'ticket-outline'}
              size={22}
              color={activeTab === 'tickets' ? '#FFF' : 'rgba(255,255,255,0.45)'}
            />
            <Text style={[styles.navLabel, activeTab === 'tickets' && styles.navLabelActive]}>
              Tickets
            </Text>
          </TouchableOpacity>

          {/* 3. Checklists (for soft services) or Stock */}
          {isSoftServicesStaff ? (
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'checklist' && styles.navItemActive]}
              onPress={() => navigate('checklist')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'checklist' ? 'checkbox' : 'checkbox-outline'}
                size={22}
                color={activeTab === 'checklist' ? '#FFF' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.navLabel, activeTab === 'checklist' && styles.navLabelActive]}>
                Checklists
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'stock' && styles.navItemActive]}
              onPress={() => navigate('stock')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'stock' ? 'cube' : 'cube-outline'}
                size={22}
                color={activeTab === 'stock' ? '#FFF' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.navLabel, activeTab === 'stock' && styles.navLabelActive]}>
                Stock
              </Text>
            </TouchableOpacity>
          )}

          {/* 4. More */}
          <TouchableOpacity
            style={[styles.navItem, activeTab === 'more' && styles.navItemActive]}
            onPress={() => setShowDrawer(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={22}
              color={activeTab === 'more' ? '#FFF' : 'rgba(255,255,255,0.45)'}
            />
            <Text style={[styles.navLabel, activeTab === 'more' && styles.navLabelActive]}>
              More
            </Text>
          </TouchableOpacity>
        </SafeBlurView>
      </View>

      <GlobalNavigationDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        propertyId={propertyId ?? ''}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  navPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(14, 14, 22, 0.94)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  navItemActive: {
    opacity: 1,
  },
  navLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  navLabelActive: {
    color: '#FFF',
    fontWeight: '700',
  },
});
