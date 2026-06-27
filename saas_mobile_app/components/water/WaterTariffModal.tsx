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
import { X, ChevronDown } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { WaterSource } from '@/services/waterService';
import { CustomDatePicker } from '@/components/shared/CustomDatePicker';

interface WaterTariffModalProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  sources: WaterSource[];
  onSave: (payload: { source_id: string; rate_per_unit: number; effective_from: string; property_id: string }) => Promise<void>;
  colors: typeof Colors.light;
  isDark?: boolean;
}

export function WaterTariffModal({ visible, onClose, propertyId, sources, onSave, colors, isDark }: WaterTariffModalProps) {
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedSourceId(sources[0]?.id || '');
      setRate('');
      setEffectiveFrom(new Date().toISOString().split('T')[0]);
    }
  }, [visible, sources]);

  const handleSave = async () => {
    if (!selectedSourceId || !rate) return;
    setIsSubmitting(true);
    try {
      await onSave({
        source_id: selectedSourceId,
        rate_per_unit: parseFloat(rate),
        effective_from: effectiveFrom,
        property_id: propertyId,
      });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSource = sources.find(s => s.id === selectedSourceId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[styles.sheetContent, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Water Costs (Tariff)</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Source</Text>
              <TouchableOpacity
                style={[styles.picker, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowSourcePicker(!showSourcePicker)}
              >
                <Text style={[styles.pickerText, { color: colors.text }]} numberOfLines={1}>
                  {selectedSource?.name || 'Select Source'}
                </Text>
                <ChevronDown size={16} color={colors.textSecondary} />
              </TouchableOpacity>

              {showSourcePicker && (
                <View style={[styles.pickerDropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {sources.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.pickerOption, selectedSourceId === s.id && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}
                      onPress={() => {
                        setSelectedSourceId(s.id);
                        setShowSourcePicker(false);
                      }}
                    >
                      <Text style={[styles.pickerOptionText, { color: colors.text }]}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>Rate per Unit (₹)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={rate}
                onChangeText={setRate}
                placeholder="e.g. 45"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>Effective From</Text>
              <TouchableOpacity
                style={[styles.picker, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.pickerText, { color: colors.text }]}>
                  {new Date(effectiveFrom + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
                <ChevronDown size={16} color={colors.textSecondary} />
              </TouchableOpacity>

              <CustomDatePicker
                visible={showDatePicker}
                selectedDate={effectiveFrom}
                onSelect={(date) => {
                  setEffectiveFrom(date);
                  setShowDatePicker(false);
                }}
                onClose={() => setShowDatePicker(false)}
                colors={colors}
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: selectedSourceId && rate ? '#0EA5E9' : colors.border }]}
                disabled={!selectedSourceId || !rate || isSubmitting}
                onPress={handleSave}
              >
                {isSubmitting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={[styles.submitBtnText, { color: '#fff' }]}>Add Tariff</Text>
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
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickerText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  pickerDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  pickerOption: {
    padding: 12,
    paddingHorizontal: 16,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '600',
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
