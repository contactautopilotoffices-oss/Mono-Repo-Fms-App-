import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { ElectricityMeter } from '@/services/electricityService';

interface MeterEditModalProps {
  visible: boolean;
  onClose: () => void;
  meter: ElectricityMeter | null;
  onSave: (meterId: string, updates: Partial<ElectricityMeter>) => Promise<void>;
  colors: typeof Colors.light;
}

export function MeterEditModal({ visible, onClose, meter, onSave, colors }: MeterEditModalProps) {
  const [name, setName] = useState('');
  const [meterType, setMeterType] = useState('main');
  const [meterNumber, setMeterNumber] = useState('');
  const [maxLoadKw, setMaxLoadKw] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && meter) {
      setName(meter.name || '');
      setMeterType(meter.meter_type || 'main');
      setMeterNumber(meter.meter_number || '');
      setMaxLoadKw(meter.max_load_kw ? meter.max_load_kw.toString() : '');
    }
  }, [visible, meter]);

  if (!visible || !meter) return null;

  const handleSave = async () => {
    if (!name) return;
    setIsSubmitting(true);
    try {
      await onSave(meter.id, {
        name,
        meter_type: meterType as any,
        meter_number: meterNumber || null,
        max_load_kw: maxLoadKw ? parseFloat(maxLoadKw) : null,
      });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[styles.sheetContent, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit Meter</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Meter Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="e.g. Main Grid Meter"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Meter Number (Optional)</Text>
              <TextInput
                value={meterNumber}
                onChangeText={setMeterNumber}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="e.g. MTR-001"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Meter Type</Text>
              <View style={styles.typeContainer}>
                {['main', 'generator', 'solar', 'sub'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      meterType === type && { backgroundColor: colors.primaryLight, borderColor: colors.primary }
                    ]}
                    onPress={() => setMeterType(type)}
                  >
                    <Text style={[styles.typeText, { color: meterType === type ? colors.primary : colors.text }]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Max Load (kW) (Optional)</Text>
              <TextInput
                value={maxLoadKw}
                onChangeText={setMaxLoadKw}
                keyboardType="decimal-pad"
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="e.g. 500"
                placeholderTextColor={colors.textTertiary}
              />

              <TouchableOpacity
                onPress={handleSave}
                disabled={!name || isSubmitting}
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: !name || isSubmitting ? 0.7 : 1 }]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    maxHeight: '90%',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Urbanist-Bold',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Urbanist-SemiBold',
    marginBottom: 20,
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 14,
    fontFamily: 'Urbanist-SemiBold',
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
  },
});
