import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, usePathname } from 'expo-router';
import SafeBlurView from '@/components/ui/SafeBlurView';
import SidekickFace from '@/components/dashboard/SidekickFace';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';
import { useCassandraStore } from '@/stores/cassandraStore';
import { useUnreadStore } from '@/stores/unreadStore';
import { useAuth } from '@/hooks/useAuth';

const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';

type NavId = 'home' | 'tickets' | 'cassandra' | 'rooms' | 'communities';

interface NavItemDef {
  id: NavId;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const leftItems: NavItemDef[] = [
  { id: 'home', icon: 'grid', label: 'Dashboard' },
  { id: 'tickets', icon: 'ticket', label: 'Tickets' },
];

const rightItems: NavItemDef[] = [
  { id: 'rooms', icon: 'business', label: 'Rooms' },
  { id: 'communities', icon: 'people', label: 'Communities' },
];

export default function TenantBottomNav() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { membership } = useAuth();
  
  const [showChat, setShowChat] = useState(false);

  // Cassandra voice state
  const voiceState = useCassandraStore((s) => s.voiceState);
  const faceState: any = (() => {
    if (voiceState === 'recording' || voiceState === 'processing' || voiceState === 'connecting') return 'listening';
    if (voiceState === 'speaking') return 'speaking';
    if (voiceState === 'error') return 'alert';
    return 'idle';
  })();

  const ticketChatCount = useUnreadStore((s) => s.ticketChatCount);

  const activeId: NavId = (() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    const secondLast = parts[parts.length - 2] ?? '';

    if (last === 'requests') return 'tickets';
    if (last === 'rooms' || last === 'visitors') return 'rooms';
    if (last === 'communities') return 'communities';
    if (last === 'cassandra') return 'cassandra';
    if (last === 'tenant' || (secondLast === 'tenant' && last === propertyId)) return 'home';
    return 'home';
  })();

  const handlePress = (id: NavId) => {
    if (!propertyId) return;
    switch (id) {
      case 'home':
        router.navigate(`/property/${propertyId}/tenant` as any);
        break;
      case 'tickets':
        router.navigate(`/property/${propertyId}/tenant/requests` as any);
        break;
      case 'cassandra':
        setShowChat(true);
        useUnreadStore.getState().clearTicketChat();
        break;
      case 'rooms':
        router.navigate(`/property/${propertyId}/rooms` as any);
        break;
      case 'communities':
        router.navigate(`/property/${propertyId}/tenant/communities` as any);
        break;
    }
  };

  const NavItem = ({ item }: { item: NavItemDef }) => {
    const isActive = activeId === item.id;
    return (
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handlePress(item.id)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={item.icon as any}
          size={22}
          color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.45)'}
        />
        <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <SafeBlurView intensity={60} tint="dark" style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.navBar}>
          {leftItems.map((item) => (
            <NavItem key={item.id} item={item} />
          ))}

          {/* Center Cassandra Orb */}
          <TouchableOpacity style={styles.navItemCenter} onPress={() => handlePress('cassandra')} activeOpacity={0.8}>
            <View style={styles.orbWrapper}>
              <View style={styles.orb}>
                <SidekickFace state={faceState} size={32} onClick={() => handlePress('cassandra')} />
              </View>
              {ticketChatCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {ticketChatCount > 99 ? '99+' : ticketChatCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.navLabel}>Cassandra</Text>
          </TouchableOpacity>

          {rightItems.map((item) => (
            <NavItem key={item.id} item={item} />
          ))}
        </View>
      </SafeBlurView>

      <CassandraSessionModal 
        visible={showChat} 
        onClose={() => setShowChat(false)} 
        orgId={membership?.org_id || ''} 
        propertyId={propertyId || ''} 
        initialMode="text" 
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
    zIndex: 1000,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(14, 14, 22, 0.92)',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    gap: 3,
    paddingVertical: 6,
    paddingBottom: 4,
  },
  navLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: fontSans,
  },
  navLabelActive: {
    color: '#FFFFFF',
  },
  centerItem: {
    position: 'relative',
  },
  navItemCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.2,
    gap: 3,
    marginTop: -6,
  },
  orbWrapper: {
    position: 'relative',
  },
  orb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
