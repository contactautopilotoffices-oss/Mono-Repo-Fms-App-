/**
 * AddItemModal Component
 *
 * Complete form for adding stock items with all fields:
 * - name (required)
 * - category (dropdown)
 * - unit (dropdown)
 * - quantity (number)
 * - min_threshold (number)
 * - per_unit_cost (number)
 * - location (text)
 * - description (text)
 * - Generates barcode automatically
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { stockService, CATEGORY_OPTIONS, UNIT_OPTIONS } from '@/services/stockService';
import { X, ChevronDown, Check, Package } from 'lucide-react-native';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  propertyId: string;
}

export default function AddItemModal({ visible, onClose, onSuccess, propertyId }: AddItemModalProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'units',
    quantity: '0',
    min_threshold: '10',
    per_unit_cost: '0',
    location: '',
    description: '',
  });

  const resetForm = () => {
    setForm({
      name: '',
      category: '',
      unit: 'units',
      quantity: '0',
      min_threshold: '10',
      per_unit_cost: '0',
      location: '',
      description: '',
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      Alert.alert('Required', 'Please enter item name');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await stockService.createItem({
        property_id: propertyId,
        name: form.name.trim(),
        category: form.category || undefined,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        min_threshold: parseFloat(form.min_threshold) || 10,
        per_unit_cost: parseFloat(form.per_unit_cost) || 0,
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
      });

      if (result.success) {
        resetForm();
        onSuccess();
        onClose();
      } else {
        Alert.alert('Error', result.error || 'Failed to create item');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.headerIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Package size={20} color={colors.primary} />
                </View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Add Stock Item</Text>
              </View>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              {/* Name - Required */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>
                  Item Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={form.name}
                  onChangeText={(t) => setForm(f => ({ ...f, name: t }))}
                  placeholder="e.g., Hand Sanitizer, Tissue Paper"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Category */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Category</Text>
                <TouchableOpacity
                  style={[styles.select, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setShowCategoryPicker(true)}
                >
                  <Text style={{ color: form.category ? colors.text : colors.textSecondary }}>
                    {form.category || 'Select category'}
                  </Text>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Unit */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Unit</Text>
                <TouchableOpacity
                  style={[styles.select, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setShowUnitPicker(true)}
                >
                  <Text style={{ color: colors.text }}>{form.unit}</Text>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Quantity + Min Threshold Row */}
              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>Initial Quantity</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={form.quantity}
                    onChangeText={(t) => setForm(f => ({ ...f, quantity: t }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>Low Stock Alert</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    value={form.min_threshold}
                    onChangeText={(t) => setForm(f => ({ ...f, min_threshold: t }))}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>

              {/* Per Unit Cost */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Cost per Unit (₹)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={form.per_unit_cost}
                  onChangeText={(t) => setForm(f => ({ ...f, per_unit_cost: t }))}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Location */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Storage Location</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={form.location}
                  onChangeText={(t) => setForm(f => ({ ...f, location: t }))}
                  placeholder="e.g., Store Room A, Basement"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Description</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={form.description}
                  onChangeText={(t) => setForm(f => ({ ...f, description: t }))}
                  placeholder="Optional description or notes"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            {/* Submit Button */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={handleClose}
              >
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Text style={styles.submitText}>Adding...</Text>
                ) : (
                  <Text style={styles.submitText}>Add Item</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pickerItem, form.category === cat && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => {
                    setForm(f => ({ ...f, category: cat }));
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>{cat}</Text>
                  {form.category === cat && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit Picker Modal */}
      <Modal visible={showUnitPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowUnitPicker(false)}>
          <View style={[styles.pickerContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Select Unit</Text>
              <TouchableOpacity onPress={() => setShowUnitPicker(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {UNIT_OPTIONS.map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[styles.pickerItem, form.unit === unit && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => {
                    setForm(f => ({ ...f, unit }));
                    setShowUnitPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>{unit}</Text>
                  {form.unit === unit && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  form: {
    padding: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  pickerItemText: {
    fontSize: 15,
  },
});
