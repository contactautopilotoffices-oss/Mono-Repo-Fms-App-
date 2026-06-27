import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Building2, ChevronRight, LogOut, MapPin } from 'lucide-react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useTheme } from '@/context';

interface PropertyEntry {
  id: string;
  name: string;
  code?: string;
  role?: string;
}

export default function SuperTenantPropertySelector() {
  const { membership, isMembershipLoading, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Filter only properties where the user is a super_tenant or tenant
  const assignedProperties: PropertyEntry[] = React.useMemo(() => {
    if (!membership?.properties) return [];
    // super_tenant sees all their assigned properties
    return membership.properties.map((p: any) => ({
      id: p.id,
      name: p.name || 'Unnamed Property',
      code: p.code,
      role: p.role,
    }));
  }, [membership]);

  const handleSelect = useCallback((propertyId: string) => {
    router.push(`/property/${propertyId}/tenant` as never);
  }, [router]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace('/login' as never);
  }, [signOut, router]);

  const bgColor = isDark ? '#0A0F1E' : '#F8FAFC';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';
  const textPrimary = isDark ? '#F8FAFC' : '#1A2332';
  const textSecondary = isDark ? 'rgba(248,250,252,0.55)' : '#64748B';

  if (isMembershipLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top + 16 }}>
        <SkeletonLoader type="list" count={4} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header Gradient */}
      <LinearGradient
        colors={isDark
          ? ['rgba(112,143,150,0.12)', 'transparent']
          : ['rgba(112,143,150,0.06)', 'transparent']}
        style={styles.headerGradient}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={[styles.brandBadge, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(112,143,150,0.15)' }]}>
            <Text style={[styles.brandText, { color: '#708F96' }]}>SUPER TENANT</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
            <LogOut size={18} color={textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroSection}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(112,143,150,0.12)', borderColor: 'rgba(112,143,150,0.15)' }]}>
            <Building2 size={32} color="#708F96" />
          </View>
          <Text style={[styles.heroTitle, { color: textPrimary }]}>Your Properties</Text>
          <Text style={[styles.heroSubtitle, { color: textSecondary }]}>
            Select a property to view its dashboard and raise requests.
          </Text>
        </View>
      </View>

      {/* Property List */}
      {assignedProperties.length === 0 ? (
        <View style={styles.emptyState}>
          <Building2 size={48} color={isDark ? 'rgba(255,255,255,0.12)' : '#CBD5E1'} />
          <Text style={[styles.emptyTitle, { color: textPrimary }]}>No Properties Found</Text>
          <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
            You are not assigned to any properties yet. Contact your administrator.
          </Text>
        </View>
      ) : (
        <FlatList
          data={assignedProperties}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[
                styles.propertyCard,
                {
                  backgroundColor: cardBg,
                  borderColor: cardBorder,
                },
              ]}
              onPress={() => handleSelect(item.id)}
              activeOpacity={0.75}
            >
              {/* Left icon */}
              <View style={[styles.cardIcon, { backgroundColor: 'rgba(112,143,150,0.10)' }]}>
                <MapPin size={20} color="#708F96" />
              </View>

              {/* Property info */}
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.code && (
                  <Text style={[styles.cardCode, { color: textSecondary }]}>
                    {item.code}
                  </Text>
                )}
              </View>

              {/* Arrow */}
              <View style={[styles.cardArrow, { backgroundColor: 'rgba(112,143,150,0.08)' }]}>
                <ChevronRight size={16} color="#708F96" />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 32,
  },
  brandBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  brandText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  signOutBtn: {
    padding: 8,
    borderRadius: 8,
  },
  heroSection: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 4,
    gap: 12,
  },
  propertyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardCode: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
