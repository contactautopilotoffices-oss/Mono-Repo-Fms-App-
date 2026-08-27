import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { useAuth } from '@/hooks/useAuth';

interface MoreMenuItem {
  label: string;
  icon: string;
  route?: string;
  action?: () => void;
  badge?: string;
  color?: string;
}

interface MobileFooterProps {
  activeTab?: 'dashboard' | 'tickets' | 'stock' | 'more';
  onMorePress?: () => void;
  moreMenuItems?: MoreMenuItem[];
}

export default function MobileFooter({ activeTab: propActiveTab, onMorePress, moreMenuItems }: MobileFooterProps) {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { membership } = useAuth();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Determine user role from membership
  const userRole = membership?.properties?.[0]?.role || membership?.org_role || 'tenant';
  const isTenant = userRole === 'tenant' || userRole === 'super_tenant';
  const isMst = userRole === 'mst' || userRole === 'master_admin';

  const activeTab = propActiveTab || 'dashboard';

  const navTo = (route: string) => {
    if (propertyId) {
      router.push(`/property/${propertyId}/${route}` as any);
    }
  };

  // Default quick-access menu
  const defaultMoreMenuItems: MoreMenuItem[] = [
    { label: 'Requests', icon: 'ticket-outline', route: isTenant ? 'tenant/requests' : 'tickets' },
    { label: 'Visitors', icon: 'walk-outline', route: isTenant ? 'tenant/visitors' : 'visitors' },
    { label: 'Checklists', icon: 'clipboard-outline', route: 'checklist' },
    { label: 'Stock', icon: 'cube-outline', route: 'stock' },
    { label: 'Diesel', icon: 'water-outline', route: 'diesel', color: '#F97316' },
    { label: 'Electricity', icon: 'flash-outline', route: 'electricity', color: '#EAB308' },
    { label: 'Security', icon: 'shield-checkmark-outline', route: 'security', color: '#3B82F6' },
    { label: 'Profile', icon: 'person-outline', action: () => onMorePress?.() },
    { label: 'Notifications', icon: 'notifications-outline', action: () => {} },
  ];

  const menuItems = moreMenuItems ?? defaultMoreMenuItems.filter((item) => !(isMst && item.route === 'flow-map'));

  return (
    <View style={styles.container}>
      <SafeBlurView intensity={80} style={[styles.blur, { paddingBottom: insets.bottom > 0 ? insets.bottom + 6 : 14 }]} tint="dark">
        {/* 1. Dashboard */}
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'dashboard' && styles.navItemActive]}
          onPress={() => router.push(isTenant ? `/property/${propertyId}/tenant` as any : `/property/${propertyId}` as any)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'dashboard' ? 'grid' : 'grid-outline'}
            size={22}
            color={activeTab === 'dashboard' ? '#FFF' : 'rgba(255,255,255,0.45)'}
          />
          <Text style={[styles.navLabel, activeTab === 'dashboard' && styles.navLabelActive]}>Dashboard</Text>
        </TouchableOpacity>

        {/* 2. Requests / Tickets */}
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'tickets' && styles.navItemActive]}
          onPress={() => router.push(isTenant ? `/property/${propertyId}/tenant/requests` as any : `/property/${propertyId}/tickets` as any)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'tickets' ? 'ticket' : 'ticket-outline'}
            size={22}
            color={activeTab === 'tickets' ? '#FFF' : 'rgba(255,255,255,0.45)'}
          />
          <Text style={[styles.navLabel, activeTab === 'tickets' && styles.navLabelActive]}>
            {isTenant ? 'Requests' : 'Tickets'}
          </Text>
        </TouchableOpacity>

        {/* 3. Stock */}
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'stock' && styles.navItemActive]}
          onPress={() => router.push(`/property/${propertyId}/stock` as any)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'stock' ? 'cube' : 'cube-outline'}
            size={22}
            color={activeTab === 'stock' ? '#FFF' : 'rgba(255,255,255,0.45)'}
          />
          <Text style={[styles.navLabel, activeTab === 'stock' && styles.navLabelActive]}>Stock</Text>
        </TouchableOpacity>

        {/* 4. More */}
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'more' && styles.navItemActive]}
          onPress={() => setShowMoreMenu(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={activeTab === 'more' ? '#FFF' : 'rgba(255,255,255,0.45)'} />
          <Text style={[styles.navLabel, activeTab === 'more' && styles.navLabelActive]}>More</Text>
        </TouchableOpacity>
      </SafeBlurView>

      {/* More Menu Bottom Sheet */}
      <Modal visible={showMoreMenu} transparent animationType="slide" onRequestClose={() => setShowMoreMenu(false)}>
        <View style={styles.moreOverlay}>
          <TouchableOpacity style={styles.moreBackdrop} activeOpacity={1} onPress={() => setShowMoreMenu(false)} />
          <View style={[styles.morePanel, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
            <View style={styles.morePanelHeader}>
              <Text style={styles.morePanelTitle}>Quick Access</Text>
              <TouchableOpacity onPress={() => setShowMoreMenu(false)} style={styles.moreCloseBtn}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.moreMenuList}>
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={`${item.label}-${index}`}
                  style={styles.moreMenuItem}
                  onPress={() => {
                    setShowMoreMenu(false);
                    if (item.route) {
                      navTo(item.route);
                    } else if (item.action) {
                      item.action();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.moreMenuIcon, item.color ? { backgroundColor: `${item.color}25`, borderColor: `${item.color}50` } : {}]}>
                    <Ionicons name={item.icon as any} size={18} color={item.color ?? 'rgba(255,255,255,0.6)'} />
                  </View>
                  <Text style={styles.moreMenuLabel}>{item.label}</Text>
                  {item.badge && (
                    <View style={styles.moreMenuBadge}>
                      <Text style={styles.moreMenuBadgeText}>{item.badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  blur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
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
  moreOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  moreBackdrop: {
    flex: 1,
  },
  morePanel: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '65%',
  },
  morePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  morePanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  moreCloseBtn: {
    padding: 4,
  },
  moreMenuList: {
    padding: 16,
    gap: 8,
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  moreMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  moreMenuLabel: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  moreMenuBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 8,
  },
  moreMenuBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
