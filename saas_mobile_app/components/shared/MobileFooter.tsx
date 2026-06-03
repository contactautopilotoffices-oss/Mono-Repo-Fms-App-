import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeBlurView from '@/components/ui/SafeBlurView';
import SidekickFace from '@/components/dashboard/SidekickFace';
import { useAuth } from '@/hooks/useAuth';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';

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
  /** Pass menu items to render in the More menu (role-based). Defaults to MST operations. */
  moreMenuItems?: MoreMenuItem[];
}

export default function MobileFooter({ activeTab: propActiveTab, onMorePress, moreMenuItems }: MobileFooterProps) {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { membership } = useAuth();
  const [showCassandraChat, setShowCassandraChat] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const orgId = membership?.org_id ?? '211e1330-ad83-446d-941f-dcea48396798';

  const activeTab = propActiveTab || 'dashboard';

  const navTo = (route: string) => {
    if (propertyId) {
      router.push(`/property/${propertyId}/${route}` as any);
    }
  };

  // Default MST quick-access menu
  const defaultMoreMenuItems: MoreMenuItem[] = [
    { label: 'Requests', icon: 'ticket-outline', route: 'tickets' },
    { label: 'Visitors', icon: 'walk-outline', route: 'visitors' },
    { label: 'Checklists', icon: 'clipboard-outline', route: 'checklist' },
    { label: 'Flow Map', icon: 'git-branch-outline', route: 'flow-map' },
    { label: 'Stock', icon: 'business-outline', route: 'stock' },
    { label: 'Diesel Logger', icon: 'water-outline', route: 'diesel', color: '#F97316' },
    { label: 'Electricity', icon: 'flash-outline', route: 'electricity', color: '#EAB308' },
    { label: 'Profile', icon: 'person-outline', action: () => onMorePress?.() },
    { label: 'Notifications', icon: 'notifications-outline', action: () => {} },
  ];

  const menuItems = moreMenuItems ?? defaultMoreMenuItems;

  return (
    <View style={styles.container}>
      <SafeBlurView intensity={90} style={[styles.blur, { paddingBottom: Math.max(insets.bottom, 8) }]} tint="dark">
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push(`/property/${propertyId}` as any)}
        >
          <Ionicons
            name={activeTab === 'dashboard' ? 'grid' : 'grid-outline'}
            size={22}
            color={activeTab === 'dashboard' ? '#FFF' : 'rgba(255,255,255,0.4)'}
          />
          <Text style={[styles.navLabel, activeTab === 'dashboard' && styles.navLabelActive]}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push(`/property/${propertyId}/tickets` as any)}
        >
          <Ionicons
            name={activeTab === 'tickets' ? 'ticket' : 'ticket-outline'}
            size={22}
            color={activeTab === 'tickets' ? '#FFF' : 'rgba(255,255,255,0.4)'}
          />
          <Text style={[styles.navLabel, activeTab === 'tickets' && styles.navLabelActive]}>Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItemCenter}
          onPress={() => {
            setShowCassandraChat(true);
          }}
        >
          <View style={styles.orbWrapper}>
            <SidekickFace
              size={48}
              state="idle"
              compact
              onClick={() => setShowCassandraChat(true)}
            />
          </View>
          <Text style={[styles.navLabel, { marginTop: 4 }]}>AI Assistant</Text>
        </TouchableOpacity>

        <View style={styles.navItem}>
          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={() => router.push(`/property/${propertyId}/stock` as any)}
              style={{ alignItems: 'center', paddingHorizontal: 12 }}
            >
              <Ionicons
                name={activeTab === 'stock' ? 'business' : 'business-outline'}
                size={22}
                color={activeTab === 'stock' ? '#FFF' : 'rgba(255,255,255,0.4)'}
              />
              <Text style={[styles.navLabel, activeTab === 'stock' && styles.navLabelActive]}>Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ position: 'absolute', right: -4, top: -8, backgroundColor: 'rgba(59,130,246,0.25)', padding: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)' }}
              onPress={() => router.push(`/property/${propertyId}/stock/scan` as any)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="scan" size={12} color="#60A5FA" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setShowMoreMenu(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.4)" />
          <Text style={styles.navLabel}>More</Text>
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
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CassandraSessionModal
        visible={showCassandraChat}
        onClose={() => setShowCassandraChat(false)}
        orgId={orgId}
        propertyId={membership?.properties?.[0]?.id}
        initialMode="text"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  blur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.12)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 4,
  },
  navItemCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.2,
    gap: 0,
    marginTop: -22,
  },
  navLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#FFF',
  },
  orbWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  // More menu styles
  moreOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  moreBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  morePanel: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '70%',
  },
  morePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  morePanelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  moreCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMenuList: {
    paddingBottom: 8,
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  moreMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  moreMenuLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  moreMenuBadge: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 8,
  },
  moreMenuBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FCA5A5',
  },
});
