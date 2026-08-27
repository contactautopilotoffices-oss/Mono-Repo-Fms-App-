'use client';

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, usePathname } from 'expo-router';
import SafeBlurView from '@/components/ui/SafeBlurView';

type NavId = 'home' | 'tickets' | 'rooms' | 'communities';

interface NavItemDef {
  id: NavId;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const navItems: NavItemDef[] = [
  { id: 'home', icon: 'grid-outline', activeIcon: 'grid', label: 'Dashboard' },
  { id: 'tickets', icon: 'ticket-outline', activeIcon: 'ticket', label: 'Requests' },
  { id: 'rooms', icon: 'business-outline', activeIcon: 'business', label: 'Rooms' },
  { id: 'communities', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles', label: 'Community' },
];

export default function TenantBottomNav() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();

  const activeId: NavId = (() => {
    if (!pathname) return 'home';
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    const secondLast = parts[parts.length - 2] ?? '';

    if (last === 'requests') return 'tickets';
    if (last === 'rooms') return 'rooms';
    if (last === 'communities') return 'communities';
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
      case 'rooms':
        router.navigate(`/property/${propertyId}/rooms` as any);
        break;
      case 'communities':
        router.navigate(`/property/${propertyId}/tenant/communities` as any);
        break;
    }
  };

  return (
    <SafeBlurView intensity={80} tint="dark" style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom + 6 : 14 }]}>
      <View style={styles.navBar}>
        {navItems.map((item) => {
          const isActive = activeId === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => handlePress(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? item.activeIcon : item.icon}
                size={22}
                color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeBlurView>
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
    backgroundColor: 'rgba(14, 14, 22, 0.94)',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 16,
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
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
