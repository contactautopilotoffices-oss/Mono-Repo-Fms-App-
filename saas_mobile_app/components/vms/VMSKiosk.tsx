/**
 * VMSKiosk — Self-service visitor check-in kiosk component.
 * Works full-screen for iPad/Tablet kiosk mode or embedded in any screen.
 * Uses same visitor_logs table via vmsService.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { vmsService } from '@/services/vmsService';
import CameraCapture from './CameraCapture';
import { LogIn, X, Building2, User, Phone, Users, CheckCircle } from 'lucide-react-native';

interface StaffMember {
  id: string;
  name: string;
  full_name?: string;
  email?: string;
  role?: string;
}

interface VMSKioskProps {
  propertyId: string;
  propertyName?: string;
  onExit?: () => void;
  onCheckInSuccess?: (visitorId: string, visitorName: string) => void;
}

const PURPOSES = [
  { label: 'Meeting', value: 'meeting' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Vendor', value: 'vendor' },
  { label: 'Interview', value: 'interview' },
];

const CATEGORIES = {
  meeting: 'visitor',
  delivery: 'delivery',
  vendor: 'vendor',
  interview: 'visitor',
};

export default function VMSKiosk({
  propertyId,
  propertyName,
  onExit,
  onCheckInSuccess,
}: VMSKioskProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  // Form state
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [hostName, setHostName] = useState('');
  const [hostUid, setHostUid] = useState<string | null>(null);
  const [hostSuggestions, setHostSuggestions] = useState<StaffMember[]>([]);
  const [purpose, setPurpose] = useState('meeting');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [company, setCompany] = useState('');

  // UI state
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [confirmedName, setConfirmedName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch host suggestions
  useEffect(() => {
    const fetchHosts = async () => {
      if (hostName.length < 2) {
        setHostSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const res = await vmsService.searchHosts(propertyId, hostName);
      if (res.success && res.data) {
        const mapped = res.data.map((h) => ({
          id: h.id,
          name: h.name,
          full_name: h.full_name,
          email: h.email,
          role: h.role,
        }));
        setHostSuggestions(mapped);
        setShowSuggestions(mapped.length > 0);
      }
    };
    const debounce = setTimeout(fetchHosts, 300);
    return () => clearTimeout(debounce);
  }, [hostName, propertyId]);

  const handleSelectHost = (h: StaffMember) => {
    setHostName(h.full_name || h.name);
    setHostUid(h.id);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name');
      return;
    }
    if (!hostName.trim()) {
      Alert.alert('Required', 'Please enter the host name');
      return;
    }

    setLoading(true);
    try {
      const res = await vmsService.checkIn({
        propertyId,
        name: name.trim(),
        mobile: mobile.trim() || undefined,
        category: CATEGORIES[purpose as keyof typeof CATEGORIES] ?? 'visitor',
        whom_to_meet: hostName.trim(),
        whom_to_meet_uid: hostUid || undefined,
        coming_from: company.trim() || undefined,
        purpose,
      });

      if (res.success && res.data) {
        // Upload photo if captured
        if (photoUri) {
          await vmsService.uploadPhoto(photoUri, res.data.visitorId);
        }

        setConfirmedName(name.trim());
        setStep('success');
        onCheckInSuccess?.(res.data.visitorId, res.data.visitor.name);
      } else {
        Alert.alert('Check-in Failed', String(res.error || 'Please try again.'));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Check-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setMobile('');
    setHostName('');
    setHostUid(null);
    setPurpose('meeting');
    setPhotoUri(null);
    setCompany('');
    setHostSuggestions([]);
    setShowSuggestions(false);
    setStep('form');
  };

  // ── Success Screen ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.primary }]}>
        <View style={styles.successContent}>
          <View style={styles.successCheckCircle}>
            <CheckCircle size={56} color="#fff" />
          </View>
          <Text style={styles.successWelcome}>Welcome!</Text>
          <Text style={styles.successName}>{confirmedName}</Text>
          <Text style={styles.successSub}>
            Your host has been notified.{'\n'}Please wait in the reception area.
          </Text>

          <TouchableOpacity
            style={styles.newVisitorBtn}
            onPress={resetForm}
            activeOpacity={0.8}
          >
            <Users size={20} color="#fff" />
            <Text style={styles.newVisitorText}>Register New Visitor</Text>
          </TouchableOpacity>

          {onExit && (
            <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
              <Text style={styles.exitText}>Exit Kiosk</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Form Screen ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container]}>
        <LinearGradient
          colors={['#0f172a', '#1e1b4b', '#0f172a']}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerLeft}>
            <Building2 size={20} color="#fff" />
            <View>
              <Text style={styles.headerTitle}>Visitor Check-In</Text>
              {propertyName && (
                <Text style={styles.headerSub}>{propertyName}</Text>
              )}
            </View>
          </View>
          {onExit && (
            <TouchableOpacity style={styles.closeBtn} onPress={onExit}>
              <X size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Form */}
        <ScrollView
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Your Name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }]}
            placeholder="Enter your full name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          {/* Mobile */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }]}
            placeholder="Mobile number"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
          />

          {/* Company */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Company / Coming From</Text>
          <TextInput
            style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }]}
            placeholder="Company or location"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={company}
            onChangeText={setCompany}
          />

          {/* Host */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Whom to Meet *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: showSuggestions && hostSuggestions.length > 0 ? colors.primary : 'rgba(255,255,255,0.15)', color: '#fff' }]}
            placeholder="Host name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={hostName}
            onChangeText={(val) => {
              setHostName(val);
              setHostUid(null);
            }}
            onFocus={() => hostSuggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />

          {/* Host Suggestions */}
          {showSuggestions && hostSuggestions.length > 0 && (
            <View style={[styles.suggestionsWrap, { borderColor: 'rgba(255,255,255,0.15)' }]}>
              {hostSuggestions.map((h) => (
                <TouchableOpacity
                  key={h.id}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectHost(h)}
                >
                  <User size={16} color={colors.textSecondary} />
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionName}>{h.full_name || h.name}</Text>
                    {h.role && (
                      <Text style={styles.suggestionRole}>{h.role.replace(/_/g, ' ')}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Purpose */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Purpose of Visit</Text>
          <View style={styles.purposeGrid}>
            {PURPOSES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.purposeChip,
                  {
                    backgroundColor:
                      purpose === p.value ? colors.primary : 'rgba(255,255,255,0.06)',
                    borderColor:
                      purpose === p.value ? colors.primary : 'rgba(255,255,255,0.15)',
                  },
                ]}
                onPress={() => setPurpose(p.value)}
              >
                <Text
                  style={[
                    styles.purposeChipText,
                    { color: purpose === p.value ? '#fff' : colors.textSecondary },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Photo */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Visitor Photo (optional)</Text>
          <View style={styles.cameraWrap}>
            <CameraCapture
              value={photoUri}
              onCapture={setPhotoUri}
              onClear={() => setPhotoUri(null)}
              label="Take Photo"
              size={100}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: colors.primary },
              loading && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <LogIn size={22} color="#fff" />
                <Text style={styles.submitText}>Check In</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formContent: { padding: 24, paddingBottom: 40 },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
  },
  suggestionsWrap: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,40,0.95)',
  },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  suggestionInfo: { flex: 1 },
  suggestionName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  suggestionRole: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, textTransform: 'capitalize' },
  purposeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  purposeChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  purposeChipText: { fontSize: 14, fontWeight: '600' },
  cameraWrap: { marginTop: 8, alignItems: 'center' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 16, marginTop: 28 },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  // Success
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successContent: { alignItems: 'center', paddingHorizontal: 32 },
  successCheckCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successWelcome: { fontSize: 28, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  successName: { fontSize: 38, fontWeight: '700', color: '#fff', marginTop: 8, textAlign: 'center' },
  successSub: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 24, marginTop: 12 },
  newVisitorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#fff',
    marginTop: 40,
  },
  newVisitorText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  exitBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12 },
  exitText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});
