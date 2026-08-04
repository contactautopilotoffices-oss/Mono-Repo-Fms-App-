import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, StatusBar, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Shield, Lock, Eye, FileText, Trash2, Mail, Smartphone, Database, Globe, Scale, AlertTriangle, RefreshCw, Server } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const bg = isDark ? '#0F1521' : '#F8FAFC';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#0F172A';
  const textSecondary = isDark ? 'rgba(255,255,255,0.7)' : '#475569';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const accentColor = '#0EA5E9';

  const openEmail = () => {
    Linking.openURL('mailto:contact.autopilotoffices@gmail.com');
  };

  const openURL = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.iconHeader}>
            <Shield size={28} color={accentColor} />
            <Text style={[styles.lastUpdated, { color: textSecondary }]}>Last updated: August 1, 2026</Text>
          </View>
          <Text style={[styles.title, { color: textPrimary }]}>Autopilot FMS Privacy Policy</Text>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            This Privacy Policy governs the data collection, processing, storage, and privacy practices of <Text style={{ fontWeight: '700', color: textPrimary }}>Autopilot FMS</Text> (&quot;Autopilot&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). It is designed to fully comply with Google Play Developer Policies, Google Play Data Safety declaration requirements, and international data protection standards.
          </Text>
        </View>

        {/* Operational Evidence Disclosure */}
        <View style={[styles.card, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.1)' : '#F0F9FF', borderColor: accentColor }]}>
          <View style={styles.sectionHeader}>
            <Shield size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Enterprise Operational Media Disclosure</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            Photos, videos, and attachments uploaded through Autopilot FMS are captured and processed <Text style={{ fontWeight: '700', color: textPrimary }}>solely as operational evidence</Text> for maintenance work orders, inspection verification, proof of completion, visitor gate logging, asset audits, and facility compliance. Such media is strictly scoped to your enterprise organization.
          </Text>
        </View>

        {/* 1. Data Controller Information */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <FileText size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>1. Data Controller Information</Text>
          </View>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>Company Legal Name: </Text>Autopilot Offices / Autopilot FMS</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>Support Email: </Text>contact.autopilotoffices@gmail.com</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>Inquiry Contact: </Text>Privacy & Compliance Desk</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>Service Type: </Text>Enterprise Facility Management SaaS</Text>
        </View>

        {/* 2. Google Play Data Safety Alignment */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Database size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>2. Complete Data Collection List</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            Below is the complete list of data types collected by Autopilot FMS matching Google Play Data Safety declarations:
          </Text>
          
          <View style={styles.subBox}>
            <Text style={[styles.subBoxTitle, { color: accentColor }]}>Personal Info</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>Name, Email Address, Phone Number, Profile Photo for user account authentication, notification dispatch, and facility directories.</Text>
          </View>

          <View style={styles.subBox}>
            <Text style={[styles.subBoxTitle, { color: accentColor }]}>Photos & Videos</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>Maintenance photos, inspection videos, visitor gate photos used exclusively for ticket proof and equipment audits.</Text>
          </View>

          <View style={styles.subBox}>
            <Text style={[styles.subBoxTitle, { color: accentColor }]}>Location Data</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>Precise or coarse location captured optionally during attendance check-ins or technician site inspections.</Text>
          </View>

          <View style={styles.subBox}>
            <Text style={[styles.subBoxTitle, { color: accentColor }]}>Device & Identifiers</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>Device model, OS version, Push Notification Token (FCM) used for real-time ticket alerts and session security.</Text>
          </View>

          <View style={styles.subBox}>
            <Text style={[styles.subBoxTitle, { color: accentColor }]}>Crash Logs & Performance</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>App crash stack traces and performance metrics gathered automatically for stability and bug fixes.</Text>
          </View>
        </View>

        {/* 3. Mobile Device Permissions */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Smartphone size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>3. Android Permissions Used</Text>
          </View>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>CAMERA: </Text>Capturing live ticket proof, scanning QR codes, photographing visitor badges.</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>READ_MEDIA_IMAGES / GALLERY: </Text>Selecting photo attachments from device gallery.</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>POST_NOTIFICATIONS: </Text>Receiving push notifications for urgent work order updates.</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>ACCESS_FINE_LOCATION: </Text>Verifying technician check-in location on site.</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>INTERNET / NETWORK STATE: </Text>Transmitting cloud-synchronized ticket data with backend.</Text>
        </View>

        {/* 4. Third Party Services */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Globe size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>4. Third-Party Services</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            We integrate with trusted enterprise providers. View their policies:
          </Text>
          <TouchableOpacity onPress={() => openURL('https://supabase.com/privacy')}>
            <Text style={[styles.linkText, { color: accentColor }]}>• Supabase (Database & Auth) ↗</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openURL('https://policies.google.com/privacy')}>
            <Text style={[styles.linkText, { color: accentColor }]}>• Google Firebase Cloud Messaging (FCM) ↗</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openURL('https://vercel.com/legal/privacy-policy')}>
            <Text style={[styles.linkText, { color: accentColor }]}>• Vercel (Web Platform & API Services) ↗</Text>
          </TouchableOpacity>
        </View>

        {/* 5. Data Retention */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Server size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>5. Data Retention Schedule</Text>
          </View>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>Account Info: </Text>Retained during active subscription or until deleted by organization admin.</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>Tickets & Audit Logs: </Text>Retained 1 to 5 years per organization data policy.</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• <Text style={{ fontWeight: '700', color: textPrimary }}>Crash Logs: </Text>Purged automatically within 90 days.</Text>
        </View>

        {/* 6. Children's Privacy */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <AlertTriangle size={20} color="#F59E0B" />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>6. Children&apos;s Privacy</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            Autopilot FMS is intended solely for business and enterprise users. The app is not directed to children under 13 years of age. We do not knowingly collect data from children.
          </Text>
        </View>

        {/* 7. User Rights */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Scale size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>7. User Rights & Controls</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            You have the right to access, correct, delete, or export your personal data, or revoke device permissions at any time via device Settings.
          </Text>
        </View>

        {/* 8. International Data Transfers */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Globe size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>8. Data Storage & Transfers</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            Data may be stored on secure encrypted cloud infrastructure (AWS / Supabase) located in multiple regions depending on your organization deployment.
          </Text>
        </View>

        {/* 9. Local Storage & Security */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Lock size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>9. Security & Encryption Details</Text>
          </View>
          <Text style={[styles.bullet, { color: textSecondary }]}>• TLS 1.2+ Network Transit Encryption</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• JWT Auth & Role-Based Access Control (RBAC)</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• Row-Level Security (RLS) Database Backups</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>• Audit Logging & Password Hashing</Text>
        </View>

        {/* 10. Legal Basis */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <FileText size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>10. Legal Basis for Processing</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            We process data to provide contracted services, fulfill legitimate business interests, comply with safety regulations, or based on user consent.
          </Text>
        </View>

        {/* 11. Account & Data Deletion */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Trash2 size={20} color="#EF4444" />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>11. Account Deletion Instructions</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            To request full account or data deletion:
          </Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>1. Go to Profile Settings &gt; Request Account Deletion in the app.</Text>
          <Text style={[styles.bullet, { color: textSecondary }]}>2. Email <Text style={{ color: accentColor }} onPress={openEmail}>contact.autopilotoffices@gmail.com</Text> with subject &quot;Account Deletion Request&quot;.</Text>
        </View>

        {/* 12. Policy Changes */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <RefreshCw size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>12. Changes to Policy</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            We may update this Privacy Policy periodically. Material changes will be reflected by updating the Last Updated date.
          </Text>
        </View>

        {/* 13 & 14. Contact Us */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.sectionHeader}>
            <Mail size={20} color={accentColor} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>13. Contact & Support</Text>
          </View>
          <Text style={[styles.paragraph, { color: textSecondary }]}>
            For questions or privacy inquiries:
          </Text>
          <TouchableOpacity onPress={openEmail}>
            <Text style={[styles.contactEmail, { color: accentColor }]}>contact.autopilotoffices@gmail.com</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  lastUpdated: {
    fontSize: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  bullet: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  subBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  subBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  contactEmail: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
});
