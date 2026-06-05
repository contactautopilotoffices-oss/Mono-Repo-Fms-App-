import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';

import SafeBlurView from '@/components/ui/SafeBlurView';
import { vmsService } from '@/services/vmsService';
import { SPACING } from '@/constants/designSystem';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

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

export default function TenantVisitorsPage() {
  const router = useRouter();
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const weatherHook = useWeather();

  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch visitors for this tenant
  const { data, isLoading: isLoadingVisitors } = useQuery({
    queryKey: ['tenant_visitors', propertyId, user?.id],
    queryFn: async () => {
      const res = await vmsService.fetchVisitors(propertyId!, {
        dateFilter: 'custom',
        customDate: 'last_30_days', // Optional: could be 'month' or custom logic, using 'month' as default fallback
      });
      const allVisitors = res.data?.visitors || [];
      // Filter client-side since we cannot touch the Express backend yet
      return allVisitors.filter(v => String(v.whom_to_meet_uid) === String(user?.id));
    },
    enabled: !!propertyId && !!user?.id,
  });

  const handleSubmit = useCallback(async () => {
    // Disabled functionality since it is "Coming Soon"
    Alert.alert('Coming Soon', 'Visitor pre-registration will be available soon.');
  }, []);

  const today = new Date().toISOString().split('T')[0];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a1a', '#121212', '#0a0a0a']} style={StyleSheet.absoluteFillObject} />
      {weatherHook.weather && <WeatherBackground condition={weatherHook.weather.condition} />}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Visitor Management</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Visitors List Section */}
        <Animated.View entering={FadeInUp.delay(80).duration(500)} style={styles.listSection}>
          <Text style={styles.sectionLabel}>Recent Visitors</Text>
          
          {isLoadingVisitors ? (
            <ActivityIndicator size="small" color="#708F96" style={{ marginVertical: 20 }} />
          ) : !data || data.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-circle-outline" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No visitors found.</Text>
            </View>
          ) : (
            data.map((visitor) => (
              <View key={visitor.id} style={styles.visitorCard}>
                <View style={styles.visitorIcon}>
                  <Ionicons name="person" size={20} color="#708F96" />
                </View>
                <View style={styles.visitorInfo}>
                  <Text style={styles.visitorName}>{visitor.name}</Text>
                  <Text style={styles.visitorMeta}>
                    {format(new Date(visitor.checkin_time), 'MMM d, h:mm a')} • {visitor.category}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: visitor.status === 'checked_in' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)' }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: visitor.status === 'checked_in' ? '#10B981' : '#A0A0A0' }
                  ]}>
                    {visitor.status === 'checked_in' ? 'Checked In' : 'Checked Out'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Animated.View>

        {/* Pre-register Visitors Section */}
        <Animated.View entering={FadeInUp.delay(160).duration(500)} style={styles.introCard}>
          <SafeBlurView intensity={40} style={styles.introBlur} tint="dark">
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.2)']}
              style={StyleSheet.absoluteFillObject}
            />
            
            {/* Coming Soon Overlay */}
            <View style={styles.comingSoonOverlay}>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>COMING SOON</Text>
              </View>
            </View>

            <View style={styles.introContent}>
              <View style={[styles.introIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <Ionicons name="people-outline" size={28} color="#10B981" />
              </View>
              <Text style={styles.introTitle}>Pre-register Visitors</Text>
              <Text style={styles.introDesc}>
                Secure building access & visitor check-in system. Pre-register your guests for a smooth entry experience.
              </Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Visitor Details</Text>

              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Smith"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={visitorName}
                onChangeText={setVisitorName}
                editable={false}
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={visitorPhone}
                onChangeText={setVisitorPhone}
                keyboardType="phone-pad"
                editable={false}
              />

              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Visit Date *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={today}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={visitDate}
                    onChangeText={setVisitDate}
                    editable={false}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Visit Time *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="14:00"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={visitTime}
                    onChangeText={setVisitTime}
                    editable={false}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Purpose of Visit</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Business meeting, Interview, Delivery..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={purpose}
                onChangeText={setPurpose}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={false}
              />

              <TouchableOpacity
                style={[styles.submitBtn, { opacity: 0.5 }]}
                onPress={handleSubmit}
                disabled={true}
                activeOpacity={0.8}
              >
                <Text style={styles.submitBtnText}>Pre-register Visitor</Text>
              </TouchableOpacity>
            </View>
          </SafeBlurView>
        </Animated.View>

      </ScrollView>

      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listSection: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  visitorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  visitorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  visitorInfo: {
    flex: 1,
  },
  visitorName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  visitorMeta: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 12,
  },
  introCard: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  introBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  comingSoonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonBadge: {
    backgroundColor: '#708F96',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    transform: [{ rotate: '-5deg' }],
  },
  comingSoonText: {
    fontFamily: FONT_DISPLAY,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  introContent: {
    padding: 20,
    alignItems: 'center',
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  introTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  introDesc: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
  },
  formSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  timeRow: {
    flexDirection: 'row',
  },
  submitBtn: {
    backgroundColor: '#708F96',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: {
    fontFamily: FONT_BODY,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
