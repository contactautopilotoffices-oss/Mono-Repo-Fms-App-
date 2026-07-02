import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { checklistService } from '@/services/checklistService';
import ScannerView from '@/components/shared/ScannerView';
import {
  ClipboardList,
  Play,
  RotateCcw,
  Clock,
} from 'lucide-react-native';

interface SOPTemplate {
  id: string;
  title: string;
  description: string | null;
  frequency: string | null;
  start_time: string | null;
  end_time: string | null;
  property_id: string;
  organization_id: string | null;
  is_active: boolean;
}

type ScreenState = 'scanning' | 'found' | 'notfound';

export default function ChecklistScanScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';

  const [state, setState] = useState<ScreenState>('scanning');
  const [template, setTemplate] = useState<SOPTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const lookupTemplate = useCallback(async (code: string) => {
    if (!propertyId || !code) return;
    setIsLoading(true);
    try {
      // Try parsing as URL first (e.g., autopilot://checklist/xyz or https://.../checklist/xyz)
      let templateId = code.trim();
      try {
        if (code.includes('://') || code.startsWith('http')) {
          const url = new URL(code);
          const pathParts = url.pathname.split('/').filter(Boolean);
          const idx = pathParts.indexOf('checklist');
          if (idx >= 0 && pathParts[idx + 1]) {
            templateId = pathParts[idx + 1];
          } else if (pathParts.length > 0) {
            templateId = pathParts[pathParts.length - 1];
          }
        }
      } catch {
        // Not a URL, use raw code as templateId
      }

      const res = await checklistService.fetchChecklistData(propertyId);
      if (res.error) throw new Error(String(res.error || 'Lookup failed'));

      const templates = res.templates || [];
      const found = templates.find((t: any) => t.id === templateId && t.is_active);

      if (found) {
        setTemplate(found as SOPTemplate);
        setState('found');
      } else {
        setState('notfound');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to look up checklist');
      setState('scanning');
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  const handleOpen = () => {
    if (!template) return;
    // Navigate to checklist index and trigger auto-start for this template
    router.push(`/property/${propertyId}/checklist?startTemplateId=${template.id}` as any);
  };

  const handleReset = () => {
    setState('scanning');
    setTemplate(null);
  };

  if (state === 'scanning' || state === 'notfound') {
    return (
      <ScannerView
        title="Checklist Scanner"
        subtitle="Scan checklist QR code"
        onScan={lookupTemplate}
        onClose={() => router.back()}
        isLoading={isLoading}
      />
    );
  }

  if (!template) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Text style={{ color: colors.text, fontSize: 22 }}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Checklist Found</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardInner}>
            <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}>
              <ClipboardList size={28} color={colors.primary} />
            </View>
            <Text style={[styles.templateTitle, { color: colors.text }]}>{template.title}</Text>
            {template.description && <Text style={[styles.templateDesc, { color: colors.textSecondary }]}>{template.description}</Text>}

            <View style={styles.metaRow}>
              {template.frequency && (
                <View style={[styles.metaBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <RotateCcw size={12} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>{template.frequency}</Text>
                </View>
              )}
              {template.start_time && template.end_time && (
                <View style={[styles.metaBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Clock size={12} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>{template.start_time} - {template.end_time}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.openBtn, { backgroundColor: colors.primary }]} onPress={handleOpen}>
          <Play size={18} color="#FFFFFF" />
          <Text style={styles.openBtnText}>Open Checklist</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rescanBtn} onPress={handleReset}>
          <RotateCcw size={14} color={colors.textSecondary} />
          <Text style={[styles.rescanText, { color: colors.textSecondary }]}>Scan Another</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: 14 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8, borderBottomWidth: 1, borderRadius: 0 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Poppins-Bold' },

  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  cardInner: { padding: 24, alignItems: 'center', position: 'relative', zIndex: 1 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  templateTitle: { fontSize: 20, fontFamily: 'Poppins-Bold', textAlign: 'center' },
  templateDesc: { fontSize: 13, fontFamily: 'Urbanist-Medium', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  metaBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  metaText: { fontSize: 11, fontFamily: 'Urbanist-Bold' },

  openBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  openBtnText: { fontSize: 15, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  rescanText: { fontSize: 13, fontFamily: 'Urbanist-Bold' },
});
