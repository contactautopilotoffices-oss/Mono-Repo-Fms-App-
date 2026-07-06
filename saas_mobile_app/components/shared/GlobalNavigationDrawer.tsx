'use client';

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import SignOutModal from '../ui/SignOutModal';
import AnimatedLogo from '@/components/shared/AnimatedLogo';

interface GlobalNavigationDrawerProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
}

interface MenuItem {
  label: string;
  route: string;
  icon: string;
  color?: string;
}

interface MenuSection {
  title: string;
  badge?: { text: string; color: string };
  items: MenuItem[];
  color?: string;
}

export default function GlobalNavigationDrawer({ visible, onClose, propertyId }: GlobalNavigationDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, membership } = useAuth();
  const [showSignOut, setShowSignOut] = useState(false);

  // Get user role from membership
  const userRole = useMemo(() => {
    const role = membership?.properties?.[0]?.role || membership?.org_role || 'tenant';
    return role.toLowerCase();
  }, [membership]);

  const navigateTo = (route: string) => {
    onClose();
    router.push(`/property/${propertyId}/${route}` as any);
  };

  // Define menu sections based on role - matching web app
  const menuSections = useMemo((): MenuSection[] => {
    // TENANT - matches TenantDashboard.tsx
    if (userRole === 'tenant') {
      return [
        {
          title: 'CORE',
          badge: { text: 'CLIENT', color: '#10B981' },
          items: [
            { label: 'Dashboard', route: 'dashboard', icon: 'grid-outline' },
            { label: 'My Requests', route: 'tenant/requests', icon: 'ticket-outline' },
            { label: 'Visitor Management', route: 'visitors', icon: 'people-outline' },
            { label: 'Meeting Rooms', route: 'rooms', icon: 'calendar-outline' },
          ],
        },
        {
          title: 'ACCOUNT',
          items: [
            { label: 'Settings', route: 'settings', icon: 'settings-outline' },
            { label: 'Profile', route: 'profile', icon: 'person-outline' },
          ],
        },
      ];
    }

    // STAFF - matches StaffDashboard.tsx
    if (userRole === 'staff' || userRole === 'maintenance_staff' || userRole === 'mst') {
      return [
        {
          title: userRole === 'staff' ? 'STAFF PORTAL' : 'MAINTENANCE PORTAL',
          items: [
            { label: 'Overview', route: 'dashboard', icon: 'grid-outline' },
            { label: 'Requests', route: 'tickets', icon: 'ticket-outline' },
            { label: 'Visitors', route: 'visitors', icon: 'people-outline' },
            { label: 'Diesel', route: 'diesel', icon: 'flame-outline' },
            { label: 'Electricity Logger', route: 'electricity', icon: 'flash-outline' },
            { label: 'Water Logger', route: 'water', icon: 'water-outline' },
            { label: 'Checklists', route: 'checklist', icon: 'clipboard-outline' },
            { label: 'Gamification Info', route: 'gamification', icon: 'star-outline' },
          ],
        },
        {
          title: 'ACCOUNT',
          items: [
            { label: 'Settings', route: 'settings', icon: 'settings-outline' },
            { label: 'Profile', route: 'profile', icon: 'person-outline' },
          ],
        },
      ];
    }

    // PROPERTY ADMIN - matches PropertyAdminDashboard.tsx
    if (userRole === 'property_admin' || userRole === 'org_admin' || userRole === 'org_super_admin') {
      return [
        {
          title: 'CORE',
          badge: { text: 'ADMIN', color: '#3B82F6' },
          items: [
            { label: 'Dashboard', route: 'dashboard', icon: 'grid-outline' },
            { label: 'Requests', route: 'tickets', icon: 'ticket-outline' },
            { label: 'Reports', route: 'reports', icon: 'stats-chart-outline' },
          ],
        },
        {
          title: 'MANAGEMENT',
          items: [
            { label: 'User Directory', route: 'users', icon: 'people-outline' },
            { label: 'Visitors', route: 'visitors', icon: 'walk-outline' },
            { label: 'Meeting Rooms', route: 'rooms', icon: 'calendar-outline' },
            { label: 'Diesel', route: 'diesel', icon: 'flame-outline' },
            { label: 'Electricity', route: 'electricity', icon: 'flash-outline' },
            { label: 'Water', route: 'water', icon: 'water-outline' },
            { label: 'Cafeteria', route: 'cafeteria', icon: 'fast-food-outline' },
            { label: 'Stock', route: 'stock', icon: 'cube-outline' },
            { label: 'Procurement', route: 'procurement', icon: 'cart-outline' },
            { label: 'Checklists', route: 'checklist', icon: 'clipboard-outline' },
            { label: 'PPM', route: 'ppm', icon: 'calendar-clear-outline' },
          ],
        },
        {
          title: 'SYSTEM',
          items: [
            { label: 'Settings', route: 'settings', icon: 'settings-outline' },
            { label: 'Profile', route: 'profile', icon: 'person-outline' },
          ],
        },
      ];
    }

    // SECURITY - matches SecurityDashboard.tsx
    if (userRole === 'security' || userRole === 'security_guard') {
      return [
        {
          title: 'SECURITY',
          badge: { text: 'SECURITY', color: '#3B82F6' },
          items: [
            { label: 'Overview', route: 'security', icon: 'shield-outline', color: '#3B82F6' },
            { label: 'Requests', route: 'tickets', icon: 'ticket-outline' },
            { label: 'Check In / Out', route: 'visitors', icon: 'log-in-outline', color: '#10B981' },
            { label: 'Visitor Registry', route: 'visitors', icon: 'people-outline' },
            { label: 'Diesel', route: 'diesel', icon: 'flame-outline' },
            { label: 'Water', route: 'water', icon: 'water-outline' },
            { label: 'Checklists', route: 'checklist', icon: 'clipboard-outline' },
          ],
        },
        {
          title: 'SYSTEM',
          items: [
            { label: 'Settings', route: 'settings', icon: 'settings-outline' },
            { label: 'Profile', route: 'profile', icon: 'person-outline' },
          ],
        },
      ];
    }

    // SUPER TENANT - matches SuperTenantDashboard.tsx
    if (userRole === 'super_tenant') {
      return [
        {
          title: 'CORE',
          badge: { text: 'SUPER CLIENT', color: '#8B5CF6' },
          items: [
            { label: 'Dashboard', route: 'dashboard', icon: 'grid-outline' },
            { label: 'My Requests', route: 'tenant/requests', icon: 'ticket-outline' },
          ],
        },
        {
          title: 'SERVICES',
          items: [
            { label: 'Visitor Management', route: 'visitors', icon: 'people-outline' },
            { label: 'Meeting Rooms', route: 'rooms', icon: 'calendar-outline' },
          ],
        },
        {
          title: 'ACCOUNT',
          items: [
            { label: 'Settings', route: 'settings', icon: 'settings-outline' },
            { label: 'Profile', route: 'profile', icon: 'person-outline' },
          ],
        },
      ];
    }

    // MASTER ADMIN
    if (userRole === 'master_admin') {
      return [
        {
          title: 'ADMIN',
          badge: { text: 'MASTER ADMIN', color: '#EF4444' },
          items: [
            { label: 'Dashboard', route: 'dashboard', icon: 'grid-outline' },
            { label: 'All Requests', route: 'tickets', icon: 'ticket-outline' },
          ],
        },
        {
          title: 'MANAGEMENT',
          items: [
            { label: 'User Directory', route: 'users', icon: 'people-outline' },
            { label: 'Visitors', route: 'visitors', icon: 'walk-outline' },
            { label: 'Diesel', route: 'diesel', icon: 'flame-outline', color: '#F97316' },
            { label: 'Electricity', route: 'electricity', icon: 'flash-outline' },
            { label: 'Water', route: 'water', icon: 'water-outline' },
            { label: 'Cafeteria', route: 'cafeteria', icon: 'fast-food-outline' },
            { label: 'Stock', route: 'stock', icon: 'cube-outline' },
            { label: 'Procurement', route: 'procurement', icon: 'cart-outline' },
          ],
        },
        {
          title: 'SYSTEM',
          items: [
            { label: 'Settings', route: 'settings', icon: 'settings-outline' },
            { label: 'Profile', route: 'profile', icon: 'person-outline' },
          ],
        },
      ];
    }

    // DEFAULT - Fallback for unknown roles
    return [
      {
        title: 'NAVIGATION',
        items: [
          { label: 'Dashboard', route: 'dashboard', icon: 'grid-outline' },
          { label: 'Requests', route: 'tickets', icon: 'ticket-outline' },
          { label: 'Visitors', route: 'visitors', icon: 'walk-outline' },
          { label: 'Settings', route: 'settings', icon: 'settings-outline' },
        ],
      },
    ];
  }, [userRole]);

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={[styles.drawerPanel, { paddingTop: insets.top + 16 }]}>
            {/* Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerLogoContainer}>
                <AnimatedLogo size="lg" />
              </View>
              <TouchableOpacity onPress={onClose} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {menuSections.map((section, sectionIndex) => (
                <View key={section.title} style={sectionIndex > 0 ? styles.sectionContainer : undefined}>
                  {/* Section Header */}
                  <View style={styles.sectionHeader}>
                    {section.badge && (
                      <View style={[styles.roleBadge, { backgroundColor: section.badge.color + '20' }]}>
                        <Text style={[styles.roleBadgeText, { color: section.badge.color }]}>
                          {section.badge.text}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.sectionTitle, section.color && { color: section.color }]}>
                      {section.title}
                    </Text>
                  </View>

                  {/* Section Items */}
                  {section.items.map((item) => (
                    <TouchableOpacity
                      key={item.route + item.label}
                      style={styles.menuItem}
                      onPress={() => navigateTo(item.route)}
                    >
                      <View style={styles.menuItemContent}>
                        <Ionicons
                          name={item.icon as any}
                          size={20}
                          color={item.color || 'rgba(255,255,255,0.6)'}
                        />
                        <Text style={[styles.menuItemLabel, item.color && { color: item.color }]}>
                          {item.label}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              {/* Sign Out */}
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={() => setShowSignOut(true)}
              >
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SignOutModal
        visible={showSignOut}
        onClose={() => setShowSignOut(false)}
        onSignOut={async () => {
          setShowSignOut(false);
          onClose();
          await signOut();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row' },
  drawerPanel: {
    width: 288,
    height: '100%',
    backgroundColor: '#0B0B0F',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
    paddingTop: 16,
    paddingBottom: 12,
  },
  drawerLogoContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  drawerLogo: {
    width: 130,
    height: 36,
    resizeMode: 'contain',
    // Bright appearance on dark background
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  drawerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sectionContainer: { marginTop: 24 },
  sectionHeader: { marginBottom: 8, paddingHorizontal: 8 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 2,
  },
  menuItemContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuItemLabel: { fontSize: 15, fontWeight: '500', color: '#FFF' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 32,
    marginBottom: 40,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  signOutText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },
});
