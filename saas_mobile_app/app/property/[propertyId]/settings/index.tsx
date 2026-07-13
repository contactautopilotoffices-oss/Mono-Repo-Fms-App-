// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Image,
  Modal,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Colors, DASHBOARD_BACKGROUNDS, type DashboardBgKey } from '@/constants/Colors';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { LinearGradient } from 'expo-linear-gradient';
import { mmkvAsyncStorage as AsyncStorage } from '@/utils/storage';
import * as ImagePicker from 'expo-image-picker';

import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  User,
  ChevronRight,
  Shield,
  Building2,
  Palette,
  FileText,
  HelpCircle,
  LogOut,
  MapPin,
  Camera,
  Mic,
  ImageIcon,
  Smartphone,
  Lock,
  Mail,
  Upload,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── Permission helpers (lazy so web doesn't crash) ──────────────────────────
let CameraModule: any = null;
let AudioModule: any = null;
let NotificationsModule: any = null;

if (Platform.OS !== 'web') {
  CameraModule = require('expo-camera').Camera;
  AudioModule = require('expo-av').Audio;
  NotificationsModule = require('expo-notifications');
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Property {
  id: string;
  name: string;
  code: string;
  address?: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  user_photo_url?: string | null;
  role?: string;
  designation?: string;
}

export default function SettingsScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { user, membership, signOut } = useAuth();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const [locationEnabled, setLocationEnabled] = useState(true);
  const [dashboardBg, setDashboardBg] = useState<DashboardBgKey | string>('default');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  // Permissions state
  const [perms, setPerms] = useState({
    camera: 'undetermined' as string,
    audio: 'undetermined' as string,
    notifications: 'undetermined' as string,
  });

  const supabase = React.useMemo(() => createClient(), []);

  // ─── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!propertyId || !user) return { property: null as Property | null, userProfile: null as UserProfile | null };
    try {
      const [propRes, userRes] = await Promise.all([
        serverApi.query<Property[]>({
          table: 'properties',
          action: 'select',
          select: 'id, name, code, address',
          filters: [{ op: 'eq', column: 'id', value: propertyId }],
          limit: 1,
        }),
        serverApi.query<UserProfile[]>({
          table: 'users',
          action: 'select',
          select: 'id, full_name, email, user_photo_url, role, designation',
          filters: [{ op: 'eq', column: 'id', value: user.id }],
          limit: 1,
        }),
      ]);
      return {
        property: propRes.data?.[0] || null,
        userProfile: userRes.data?.[0] || null,
      };
    } catch (error) {
      console.error('Error fetching settings data:', error);
      return { property: null as Property | null, userProfile: null as UserProfile | null };
    }
  }, [propertyId, user]);

  useEffect(() => {
    (async () => {
      const locSetting = await AsyncStorage.getItem('fms_weather_location_enabled');
      setLocationEnabled(locSetting !== 'false');

      const bgSetting = await AsyncStorage.getItem('fms_dashboard_background');
      if (bgSetting) {
        setDashboardBg(bgSetting);
      }
    })();
  }, []);

  // ─── Permissions ───────────────────────────────────────────────────────────
  const refreshPermissions = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const [camStatus, audioStatus, notifStatus] = await Promise.all([
        CameraModule ? CameraModule.getCameraPermissionsAsync() : Promise.resolve({ status: 'undetermined' }),
        AudioModule && AudioModule.getPermissionsAsync ? AudioModule.getPermissionsAsync() : Promise.resolve({ status: 'undetermined' }),
        NotificationsModule ? NotificationsModule.getPermissionsAsync() : Promise.resolve({ status: 'undetermined' }),
      ]);
      setPerms({
        camera: camStatus?.status ?? 'undetermined',
        audio: audioStatus?.status ?? 'undetermined',
        notifications: notifStatus?.status ?? 'undetermined',
      });
    } catch (e) {
      console.log('Permission check error:', e);
    }
  }, []);

  const { data, isLoading, isFetching, refetch } = useServerQuery<{ property: Property | null; userProfile: UserProfile | null }>(
    queryKeys.property.settings(propertyId),
    fetchData,
    { staleTime: 1000 * 60 * 5 }
  );

  const property = data?.property ?? null;
  const userProfile = data?.userProfile ?? null;

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const requestCamera = async () => {
    if (Platform.OS === 'web') return;
    try {
      // If already granted, send user to Settings so they can disable it if desired.
      if (perms.camera === 'granted') {
        Linking.openSettings();
        return;
      }
      const result = await CameraModule.requestCameraPermissionsAsync();
      setPerms(p => ({ ...p, camera: result.status }));
      // If still not granted and the system dialog can't/won't be shown again, offer Settings.
      if (result.status !== 'granted' && (Platform.OS === 'ios' || result.canAskAgain === false)) {
        Alert.alert('Permission Required', 'Camera access is needed for scanning and photo features.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      }
    } catch (e) {
      console.error('Camera permission error:', e);
    }
  };

  const requestAudio = async () => {
    if (Platform.OS === 'web') return;
    try {
      if (perms.audio === 'granted') {
        Linking.openSettings();
        return;
      }
      const result = await AudioModule.requestPermissionsAsync();
      setPerms(p => ({ ...p, audio: result.status }));
      if (result.status !== 'granted' && (Platform.OS === 'ios' || result.canAskAgain === false)) {
        Alert.alert('Permission Required', 'Microphone access is needed for voice features.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      }
    } catch (e) {
      console.error('Audio permission error:', e);
    }
  };

  const requestNotifications = async () => {
    if (Platform.OS === 'web') return;
    try {
      if (perms.notifications === 'granted') {
        Linking.openSettings();
        return;
      }
      const result = await NotificationsModule.requestPermissionsAsync();
      setPerms(p => ({ ...p, notifications: result.status }));
      if (result.status !== 'granted' && (Platform.OS === 'ios' || result.canAskAgain === false)) {
        Alert.alert('Permission Required', 'Push notifications are needed for alerts.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      }
    } catch (e) {
      console.error('Notification permission error:', e);
    }
  };

  // ─── Security / Change Password ────────────────────────────────────────────
  const handleChangePassword = async () => {
    const email = userProfile?.email || user?.email;
    if (!email) {
      Alert.alert('Error', 'No email address found for this account.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      Alert.alert('Check Your Email', `A password reset link has been sent to ${email}. Follow the instructions in the email to set a new password.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send reset email. Please try again.');
    }
    setShowSecurityModal(false);
  };

  // ─── Background picker ─────────────────────────────────────────────────────
  const handleSelectBg = async (key: string) => {
    await AsyncStorage.setItem('fms_dashboard_background', key);
    setDashboardBg(key);
    setShowBgPicker(false);
    Alert.alert('Background Updated', 'Your dashboard background will change on next refresh.');
  };

  const handleUploadBg = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera roll permissions to upload an image.');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16], // Mobile screen ratio
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri) {
        await handleSelectBg(result.assets[0].uri);
      }
    } catch (e) {
      console.error('Image picker error:', e);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const clearBgOverride = async () => {
    await AsyncStorage.removeItem('fms_dashboard_background');
    setDashboardBg('default');
    setShowBgPicker(false);
    Alert.alert('Background Reset', 'Dashboard will now use the default background.');
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    await refetch();
    await refreshPermissions();
  }, [refetch, refreshPermissions]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const getRoleDisplay = () => {
    if (!membership || !propertyId) return 'Member';
    const prop = membership.properties.find((p) => p.id === propertyId);
    if (!prop) return 'Member';
    return prop.role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const handleToggleLocation = async () => {
    const newValue = !locationEnabled;
    setLocationEnabled(newValue);
    await AsyncStorage.setItem('fms_weather_location_enabled', newValue ? 'true' : 'false');
  };

  const permLabel = (status: string) => {
    if (status === 'granted') return 'Allowed';
    if (status === 'denied') return 'Denied';
    return 'Not requested';
  };
  const permColor = (status: string) => {
    if (status === 'granted') return '#22C55E';
    if (status === 'denied') return '#EF4444';
    return '#F59E0B';
  };

  // ─── Widget Card Component ──────────────────────────────────────────────────
  const WidgetCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View style={[
      styles.widget,
      { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
      style
    ]}>
      {children}
    </View>
  );

  // ─── Menu Row Component ────────────────────────────────────────────────────
  const MenuRow = ({
    icon,
    title,
    subtitle,
    onPress,
    toggle,
    toggleValue,
    right,
  }: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onPress: () => void;
    toggle?: boolean;
    toggleValue?: boolean;
    right?: React.ReactNode;
  }) => (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuLeft}>
        <View style={styles.widgetIconWrap}>
          {icon}
        </View>
        <View>
          <Text style={[styles.menuTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>
      </View>
      {toggle ? (
        <View style={[styles.toggleTrack, { backgroundColor: toggleValue ? '#708F96' : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}>
          <View style={[styles.toggleKnob, { transform: [{ translateX: toggleValue ? 18 : 0 }] }]} />
        </View>
      ) : right ? (
        right
      ) : (
        <ChevronRight size={18} color={colors.textTertiary} />
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={{ flex: 1, paddingHorizontal: 16, marginTop: 24 }}>
          <SkeletonLoader type="list" count={5} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* ── Header ── */}
      <View style={[styles.headerWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderBottomWidth: 1 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={[styles.backOrb, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* User card */}
        <TouchableOpacity style={styles.userCard} onPress={() => router.push(`/property/${propertyId}/profile` as any)} activeOpacity={0.8}>
          <View style={[styles.avatarRing, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }]}>
            {userProfile?.user_photo_url || user?.user_metadata?.avatar_url || user?.avatar ? (
              <Image source={{ uri: userProfile?.user_photo_url || user?.user_metadata?.avatar_url || user?.avatar }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.avatarLetter, { color: colors.text }]}>{user?.user_metadata?.full_name?.[0]?.toUpperCase() || userProfile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}</Text>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{user?.user_metadata?.full_name || userProfile?.full_name || 'User'}</Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>{userProfile?.email || user?.email || ''}</Text>
            <Text style={[styles.userRole, { color: colors.textSecondary }]}>{getRoleDisplay()}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor="#708F96" />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* ── Property ── */}
        {property && (
          <WidgetCard>
            <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>PROPERTY</Text>
            <View style={styles.propertyRow}>
              <View style={styles.widgetIconWrap}>
                <Building2 size={20} color="#708F96" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.propertyName, { color: colors.text }]} numberOfLines={1}>{property.name}</Text>
                <Text style={[styles.propertyCode, { color: colors.textSecondary }]}>{property.code}</Text>
              </View>
            </View>
          </WidgetCard>
        )}

        {/* ── Preferences ── */}
        <WidgetCard>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>PREFERENCES</Text>

          <MenuRow
            icon={<MapPin size={18} color="#708F96" />}
            title="Weather Location"
            subtitle={locationEnabled ? 'Using location for live weather' : 'Location disabled'}
            onPress={handleToggleLocation}
            toggle
            toggleValue={locationEnabled}
          />

          <MenuRow
            icon={<ImageIcon size={18} color="#708F96" />}
            title="Dashboard Background"
            subtitle={
              dashboardBg in DASHBOARD_BACKGROUNDS 
                ? DASHBOARD_BACKGROUNDS[dashboardBg as DashboardBgKey]?.label || 'Night'
                : 'Custom Photo'
            }
            onPress={() => setShowBgPicker(true)}
          />
        </WidgetCard>

        {/* ── Permissions ── */}
        <WidgetCard>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>PERMISSIONS</Text>

          <MenuRow
            icon={<Camera size={18} color="#708F96" />}
            title="Camera"
            subtitle={permLabel(perms.camera)}
            onPress={requestCamera}
            toggle
            toggleValue={perms.camera === 'granted'}
          />

          <MenuRow
            icon={<Mic size={18} color="#708F96" />}
            title="Microphone"
            subtitle={permLabel(perms.audio)}
            onPress={requestAudio}
            toggle
            toggleValue={perms.audio === 'granted'}
          />

          <MenuRow
            icon={<Smartphone size={18} color="#708F96" />}
            title="Push Notifications"
            subtitle={permLabel(perms.notifications)}
            onPress={requestNotifications}
            toggle
            toggleValue={perms.notifications === 'granted'}
          />
        </WidgetCard>

        {/* ── Support ── */}
        <WidgetCard>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>SUPPORT</Text>

          <MenuRow icon={<Shield size={18} color="#708F96" />} title="Security" subtitle="Password and authentication" onPress={() => setShowSecurityModal(true)} />
          <MenuRow icon={<FileText size={18} color="#708F96" />} title="Terms & Privacy" subtitle="Legal information" onPress={() => {}} />
          <MenuRow icon={<HelpCircle size={18} color="#708F96" />} title="Help & Support" subtitle="Get assistance" onPress={() => {}} />
        </WidgetCard>

        {/* ── Sign Out ── */}
        <TouchableOpacity style={[styles.signOutBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)' }]} onPress={handleSignOut} activeOpacity={0.8}>
          <LogOut size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 40 }}>
          <Text style={[styles.versionText, { color: colors.textTertiary }]}>Autopilot v1.0.0</Text>
        </View>
      </ScrollView>

      {/* ── Background Picker Modal ── */}
      {showBgPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowBgPicker(false)}>
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowBgPicker(false)} activeOpacity={1} />
            <SafeBlurView intensity={70} tint="dark" style={styles.bgPickerSheet}>
              <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.25)']} style={StyleSheet.absoluteFillObject} />

              <View style={styles.bgPickerHeader}>
                <Text style={[styles.bgPickerTitle, { color: colors.text }]}>Dashboard Background</Text>
                <TouchableOpacity onPress={() => setShowBgPicker(false)} activeOpacity={0.7}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.bgGrid}>
                {(Object.keys(DASHBOARD_BACKGROUNDS) as DashboardBgKey[]).map((key) => {
                  const isSelected = dashboardBg === key;
                  return (
                    <TouchableOpacity key={key} style={[styles.bgOption, isSelected && styles.bgOptionActive]} onPress={() => handleSelectBg(key)} activeOpacity={0.8}>
                      <Image source={DASHBOARD_BACKGROUNDS[key].image} style={styles.bgOptionImg} resizeMode="cover" />
                      <Text style={[styles.bgOptionLabel, { color: colors.text }]}>{DASHBOARD_BACKGROUNDS[key].label}</Text>
                      {isSelected && (
                        <View style={styles.bgOptionCheck}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity style={styles.bgOption} onPress={handleUploadBg} activeOpacity={0.8}>
                  <View style={[styles.bgOptionImg, { backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }]}>
                    <Upload size={24} color="#fff" />
                  </View>
                  <Text style={[styles.bgOptionLabel, { color: colors.text }]}>Upload Photo</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.resetBtn} onPress={clearBgOverride} activeOpacity={0.7}>
                <Text style={styles.resetText}>Reset to Default</Text>
              </TouchableOpacity>
            </SafeBlurView>
          </View>
        </Modal>
      )}

      {/* ── Security Modal ── */}
      {showSecurityModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowSecurityModal(false)}>
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowSecurityModal(false)} activeOpacity={1} />
            <SafeBlurView intensity={70} tint="dark" style={styles.bgPickerSheet}>
              <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.25)']} style={StyleSheet.absoluteFillObject} />

              <View style={styles.bgPickerHeader}>
                <Text style={[styles.bgPickerTitle, { color: colors.text }]}>Security</Text>
                <TouchableOpacity onPress={() => setShowSecurityModal(false)} activeOpacity={0.7}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.securityCard}>
                <View style={styles.securityIconWrap}>
                  <Lock size={28} color="#708F96" />
                </View>
                <Text style={[styles.securityTitle, { color: colors.text }]}>Change Password</Text>
                <Text style={[styles.securityDesc, { color: colors.textSecondary }]}>
                  We will send a password reset email to{'\n'}
                  <Text style={{ color: colors.text, fontFamily: 'Poppins-Bold' }}>{userProfile?.email || user?.email}</Text>
                </Text>
                <TouchableOpacity style={styles.securityActionBtn} onPress={handleChangePassword} activeOpacity={0.8}>
                  <Mail size={18} color="#fff" />
                  <Text style={styles.securityActionText}>Send Reset Email</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.securityCard, { marginTop: 12 }]}>
                <View style={styles.securityIconWrap}>
                  <Shield size={28} color="#708F96" />
                </View>
                <Text style={[styles.securityTitle, { color: colors.text }]}>Account Protection</Text>
                <Text style={[styles.securityDesc, { color: colors.textSecondary }]}>
                  Your account is secured with Supabase Auth. Password reset links expire after 1 hour for your safety.
                </Text>
              </View>
            </SafeBlurView>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.3,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 4,
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarLetter: {
    fontSize: 22,
    fontFamily: 'Poppins-Bold',
    color: '#fff',
  },
  userName: {
    fontSize: 17,
    fontFamily: 'Poppins-Bold',
  },
  userEmail: {
    fontSize: 12,
    fontFamily: 'Urbanist-Regular',
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
  },
  userRole: {
    fontSize: 11,
    fontFamily: 'Urbanist-SemiBold',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
    textTransform: 'capitalize',
  },

  // Scroll
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Widget Card
  widget: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'Urbanist-Bold',
    letterSpacing: 1.2,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  widgetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(112,143,150,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Property
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  propertyName: {
    fontSize: 15,
    fontFamily: 'Poppins-Bold',
  },
  propertyCode: {
    fontSize: 12,
    fontFamily: 'Urbanist-Regular',
    marginTop: 2,
  },

  // Menu Row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(112,143,150,0.1)',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
  },
  menuSubtitle: {
    fontSize: 11,
    fontFamily: 'Urbanist-Regular',
    marginTop: 1,
  },

  // Toggle
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },

  // Permission badge
  permBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  permBadgeText: {
    fontSize: 11,
    fontFamily: 'Urbanist-Bold',
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  signOutText: {
    fontSize: 15,
    fontFamily: 'Poppins-Bold',
    color: '#EF4444',
  },
  versionText: {
    fontSize: 12,
    fontFamily: 'Urbanist-Regular',
  },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bgPickerSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    overflow: 'hidden',
    minHeight: 400,
  },
  bgPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  bgPickerTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
  },

  // Background grid
  bgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bgOption: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bgOptionActive: {
    borderColor: '#708F96',
    borderWidth: 2,
  },
  bgOptionImg: {
    width: '100%',
    height: '75%',
  },
  bgOptionLabel: {
    fontSize: 11,
    fontFamily: 'Urbanist-SemiBold',
    textAlign: 'center',
    paddingVertical: 6,
  },
  bgOptionCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  resetText: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
    color: 'rgba(255,255,255,0.6)',
  },

  // Security modal
  securityCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 20,
    alignItems: 'center',
  },
  securityIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  securityTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    marginBottom: 6,
  },
  securityDesc: {
    fontSize: 13,
    fontFamily: 'Urbanist-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  securityActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#708F96',
    width: '100%',
  },
  securityActionText: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
    color: '#fff',
  },
});
