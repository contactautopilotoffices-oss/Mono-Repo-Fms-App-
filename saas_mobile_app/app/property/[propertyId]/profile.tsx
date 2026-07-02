import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { requestCameraPermissionWithSettings, requestMediaLibraryPermissionWithSettings } from '@/utils/permissions';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/constants/Colors';
import { apiFetch } from '@/utils/api/mobileApi';
import { readFileAsArrayBuffer, compressImage } from '@/utils/mediaUtils';

import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  ArrowLeft,
  Camera,
  Save,
  X,
  Mail,
  Phone,
  Shield,
  Building2,
  Image as ImageIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { createClient } from '@/utils/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  user_photo_url?: string | null;
  role?: string;
  designation?: string;
}

export default function ProfileScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { user, membership } = useAuth();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [isSaving, setIsSaving] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);

  // Edit form state — only full_name and phone are editable
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // ─── Fetch profile ─────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!user) return null;
    try {
      const response = await apiFetch<any>(`/api/users/${user.id}`);
      if (response.success && response.data) return response.data;
      if (response.id || response.full_name) return response;
      return null;
    } catch (error: any) {
      if (error?.message?.includes('404')) {
        // Fallback to basic auth info if user not in public.users yet
        return {
          id: user.id,
          full_name: user.email?.split('@')[0] || 'User',
          email: user.email || '',
        };
      }
      console.error('Error fetching profile:', error);
      return null;
    }
  }, [user]);

  const { data: profile, isLoading, isFetching, refetch } = useServerQuery<UserProfile | null>(
    queryKeys.user.profile(user?.id ?? 'none'),
    fetchProfile,
    { staleTime: 1000 * 60 * 5 }
  );

  useEffect(() => {
    if (profile) {
      setEditName(profile.full_name || '');
      setEditPhone(profile.phone || '');
    }
  }, [profile]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // ─── Save profile ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!profile) return;
    if (!editName.trim()) {
      Alert.alert('Error', 'Full name is required');
      return;
    }
    setIsSaving(true);
    try {
      const response = await apiFetch(`/api/users/${profile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: editName.trim(),
          phone: editPhone.trim() || null,
        }),
      });
      if (!response.success) throw new Error(response.error);

      // Update auth context so name updates globally
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { full_name: editName.trim() }
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.property.settings(propertyId) });

      Alert.alert('Success', 'Profile updated successfully');
      refetch();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Photo upload ──────────────────────────────────────────────────────────
  const handlePhotoCapture = async () => {
    const isGranted = await requestCameraPermissionWithSettings();
    if (!isGranted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]) {
      const fileUri = result.assets[0].uri;
      await uploadPhoto(fileUri);
    }
    setShowPhotoMenu(false);
  };

  const handlePhotoPick = async () => {
    const isGranted = await requestMediaLibraryPermissionWithSettings();
    if (!isGranted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
    bottomSheetModalRef.current?.dismiss();
  };

  const uploadPhoto = async (uri: string) => {
    try {
      if (!user?.id || !profile) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      const compressedUri = await compressImage(uri);
      const formData = new FormData();
      formData.append('file', {
        uri: compressedUri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      } as any);

      // Upload via server API
      const response = await apiFetch(`/api/users/${profile.id}/photo`, {
        method: 'POST',
        body: formData as any,
      });

      if (!response.success) throw new Error(response.error);

      // Update auth context so avatar updates globally
      if (response.data?.url) {
        const supabase = createClient();
        await supabase.auth.updateUser({
          data: { avatar_url: response.data.url }
        });
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.property.settings(propertyId) });
      refetch();
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo');
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const getRoleDisplay = () => {
    if (!membership || !propertyId) return 'Member';
    const prop = membership.properties.find((p) => p.id === propertyId);
    if (!prop) return 'Member';
    return prop.role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getPropertyName = () => {
    if (!membership || !propertyId) return 'Unknown Property';
    const prop = membership.properties.find((p) => p.id === propertyId);
    return prop?.name || 'Unknown Property';
  };

  const getInitials = () => {
    return profile?.full_name?.[0]?.toUpperCase() ||
           profile?.email?.[0]?.toUpperCase() ||
           user?.email?.[0]?.toUpperCase() ||
           'U';
  };



  if (isLoading) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={isDark ? ['#0B1120', '#0f172a', '#1e1b4b'] : ['#eef2f6', '#f8fafc']} style={StyleSheet.absoluteFillObject} />
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color="#708F96" />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* ── Header ── */}
      <View style={[s.headerWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderBottomWidth: 1 }]}>
        <View style={s.headerTop}>
          <TouchableOpacity style={[s.backOrb, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor="#708F96" />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* ── Avatar Section ── */}
        <View style={s.avatarSection}>
          <View style={s.avatarWrap}>
            <TouchableOpacity onPress={() => { if (profile?.user_photo_url) setShowFullPhoto(true); }} activeOpacity={0.8}>
              {profile?.user_photo_url ? (
                <Image source={{ uri: profile.user_photo_url }} style={s.avatarImg} />
              ) : (
                <View style={s.avatarPlaceholder}>
                  <Text style={s.avatarPlaceholderText}>{getInitials()}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.cameraBtn} onPress={() => setShowPhotoMenu(true)} activeOpacity={0.8}>
              <Camera size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={[s.nameText, { color: colors.text }]}>{profile?.full_name || 'User'}</Text>
          <Text style={[s.emailText, { color: colors.textSecondary }]}>{profile?.email || user?.email}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleBadgeText}>{getRoleDisplay()}</Text>
          </View>
        </View>

        {/* ── Editable Info ── */}
        <WidgetCard isDark={isDark}>
          <Text style={[s.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>EDITABLE INFORMATION</Text>

          {/* Full Name */}
          <View style={s.fieldGroup}>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>FULL NAME</Text>
            <TextInput
              style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', color: colors.text }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter your full name"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          {/* Phone */}
          <View style={[s.fieldGroup, { marginTop: 14 }]}>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>PHONE NUMBER</Text>
            <TextInput
              style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', color: colors.text }]}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Enter phone number"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity style={s.actionBtn} onPress={handleSave} activeOpacity={0.8} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Save size={16} color="#fff" />
                <Text style={s.actionBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </WidgetCard>

        {/* ── Read-Only Info ── */}
        <WidgetCard isDark={isDark}>
          <Text style={[s.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>ACCOUNT DETAILS</Text>

          <InfoRow colors={colors} icon={<Mail size={20} color="#708F96" />} label="Email Address" value={profile?.email || user?.email || 'Not set'} />
          <InfoRow colors={colors} icon={<Shield size={20} color="#708F96" />} label="Role" value={getRoleDisplay()} />
          <InfoRow colors={colors} icon={<Building2 size={20} color="#708F96" />} label="Property" value={getPropertyName()} />
        </WidgetCard>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Photo Options Modal (Standard) ── */}
      <Modal visible={showPhotoMenu} transparent animationType="slide" onRequestClose={() => setShowPhotoMenu(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowPhotoMenu(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.sheetContent, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom > 0 ? insets.bottom : 24 }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Profile picture</Text>
              <TouchableOpacity onPress={() => setShowPhotoMenu(false)}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <View style={s.sheetOptionsRow}>
              <TouchableOpacity style={s.sheetOptionIconBtn} onPress={handlePhotoCapture} activeOpacity={0.7}>
                <View style={s.sheetIconCircle}>
                  <Camera size={24} color={colors.text} />
                </View>
                <Text style={[s.sheetOptionText, { color: colors.textSecondary }]}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sheetOptionIconBtn} onPress={handlePhotoPick} activeOpacity={0.7}>
                <View style={s.sheetIconCircle}>
                  <ImageIcon size={24} color={colors.text} />
                </View>
                <Text style={[s.sheetOptionText, { color: colors.textSecondary }]}>Gallery</Text>
              </TouchableOpacity>

              {profile?.user_photo_url && (
                <TouchableOpacity style={s.sheetOptionIconBtn} onPress={() => { setShowPhotoMenu(false); setShowFullPhoto(true); }} activeOpacity={0.7}>
                  <View style={s.sheetIconCircle}>
                    <ImageIcon size={24} color={colors.text} />
                  </View>
                  <Text style={[s.sheetOptionText, { color: colors.textSecondary }]}>View Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── View Full Photo Modal ── */}
      <Modal visible={showFullPhoto} transparent animationType="fade" onRequestClose={() => setShowFullPhoto(false)}>
        <View style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <TouchableOpacity style={s.fullPhotoClose} onPress={() => setShowFullPhoto(false)}>
            <X size={30} color="#fff" />
          </TouchableOpacity>
          {profile?.user_photo_url && (
             <Image source={{ uri: profile.user_photo_url }} style={{ width: '100%', height: '80%', resizeMode: 'contain' }} />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Widget Component ────────────────────────────────────────────────────────
const WidgetCard = ({ children, style, isDark }: { children: React.ReactNode; style?: any; isDark: boolean }) => (
  <View style={[
    s.widget,
    { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
    style
  ]}>
    {children}
  </View>
);

// ─── Info Row (read-only) ──────────────────────────────────────────────────
const InfoRow = ({ icon, label, value, colors }: { icon: React.ReactNode; label: string; value: string; colors: any }) => (
  <View style={s.infoRow}>
    <View style={s.widgetIconWrap}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={[s.widgetLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[s.widgetValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  </View>
);

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
        color: '#fff',
    letterSpacing: 0.3,
  },

  // Scroll
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },

  // ─── Widget ────────────────────────────────────────────────────────
  widget: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 16,
    textTransform: 'uppercase',
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'rgba(112,143,150,0.4)',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(112,143,150,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(112,143,150,0.4)',
  },
  avatarPlaceholderText: {
    fontSize: 36,
        color: '#708F96',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  nameText: {
    fontSize: 20,
        textAlign: 'center',
  },
  emailText: {
    fontSize: 13,
        textAlign: 'center',
    marginTop: 2,
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(112,143,150,0.15)',
  },
  roleBadgeText: {
    fontSize: 11,
        color: '#708F96',
    textTransform: 'capitalize',
  },

  // Fields
  fieldGroup: {},
  fieldLabel: {
    fontSize: 10,
        letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
      },

  // Action button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#708F96',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(112,143,150,0.1)',
  },
  widgetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(112,143,150,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  widgetLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  widgetValue: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '80%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  sheetOptionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
  },
  sheetOptionIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetOptionText: {
    fontSize: 13,
  },
  fullPhotoClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  }
});
