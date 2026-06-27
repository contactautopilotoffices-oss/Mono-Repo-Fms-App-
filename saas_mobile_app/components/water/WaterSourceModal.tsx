import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Droplets, Truck } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { WaterSource, WaterSourceType } from '@/services/waterService';

interface WaterSourceModalProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  source?: WaterSource | null;
  onSave: (payload: Partial<WaterSource>) => Promise<void>;
  colors: typeof Colors.light;
  isDark?: boolean;
}

export function WaterSourceModal({ visible, onClose, source, onSave, colors, isDark }: WaterSourceModalProps) {
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<WaterSourceType>('jar');
  const [capacity, setCapacity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(source?.name || '');
      setSourceType(source?.source_type || 'jar');
      setCapacity(source?.capacity_litres ? String(source.capacity_litres) : '');
    }
  }, [visible, source]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        source_type: sourceType,
        capacity_litres: capacity ? parseFloat(capacity) : null,
      });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions: { value: WaterSourceType; label: string; icon: React.ReactNode }[] = [
    { value: 'jar', label: 'Jar (Drinking Water)', icon: <Droplets size={18} color="#0EA5E9" /> },
    { value: 'tanker', label: 'Tanker', icon: <Truck size={18} color="#0EA5E9" /> },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[styles.sheetContent, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {source ? 'Edit Source' : 'Add Water Source'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Source Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. 20L Bisleri Jar"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>Source Type</Text>
              <View style={styles.typeRow}>
                {typeOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeBtn,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      sourceType === opt.value && { borderColor: '#0EA5E9', backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }
                    ]}
                    onPress={() => setSourceType(opt.value)}
                  >
                    {opt.icon}
                    <Text style={[styles.typeBtnText, { color: sourceType === opt.value ? '#0EA5E9' : colors.text }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>Capacity (Litres)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={capacity}
                onChangeText={setCapacity}
                placeholder="e.g. 20"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: name.trim() ? '#0EA5E9' : colors.border }]}
                disabled={!name.trim() || isSubmitting}
                onPress={handleSave}
              >
                {isSubmitting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={[styles.submitBtnText, { color: '#fff' }]}>{source ? 'Update Source' : 'Add Source'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    marginTop: 24,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
