/**
 * Stock Movement Modal
 * Modal for recording stock movements (add/remove)
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
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  X,
  ArrowUpCircle,
  ArrowDownCircle,
  Package,
} from 'lucide-react-native';

interface StockItem {
  id: string;
  name: string;
  item_code: string;
  category: string | null;
  quantity: number;
  min_threshold: number;
  unit: string | null;
}

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: StockItem | null;
  onSubmit: (params: {
    itemId: string;
    action: 'add' | 'remove';
    quantity: number;
    notes: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

// ─── Design Tokens ──────────────────────────────────────────────────────────────

const TOKENS = {
  bg: { gradient: ['#0B1B2A', '#0F2D3D', '#113B4D'] as const },
  glass: {
    border: 'rgba(255,255,255,0.18)',
    bg: 'rgba(255,255,255,0.06)',
  },
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.60)',
    tertiary: 'rgba(255,255,255,0.38)',
  },
  radius: { card: 20, btn: 14, sheet: 24 },
};

export default function StockMovementModal({
  isOpen,
  onClose,
  item,
  onSubmit,
  isLoading = false,
}: StockMovementModalProps) {
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');

  // Reset state when item changes
  React.useEffect(() => {
    if (item) {
      setAction('add');
      setQuantity('1');
      setNotes('');
    }
  }, [item]);

  const handleSubmit = async () => {
    if (!item) return;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;
    if (action === 'remove' && qty > item.quantity) return;

    await onSubmit({
      itemId: item.id,
      action,
      quantity: qty,
      notes,
    });
  };

  if (!isOpen || !item) return null;

  const qty = parseInt(quantity) || 0;
  const newQty = action === 'add'
    ? item.quantity + qty
    : Math.max(0, item.quantity - qty);
  const isLowStock = item.quantity <= (item.min_threshold || 0);
  const canSubmit = qty > 0 && (action === 'add' || qty <= item.quantity);

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <LinearGradient
              colors={['#1a2e3b', '#0f1f2a']}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {action === 'add' ? 'Add' : 'Remove'} Stock
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="rgba(255,255,255,0.50)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Item Banner */}
              <View style={styles.itemBanner}>
                <View style={styles.itemIcon}>
                  <Package size={18} color="#708F96" />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemCode}>{item.item_code || 'No SKU'}</Text>
                </View>
                <View style={styles.currentStock}>
                  <Text style={styles.currentStockLabel}>Current</Text>
                  <Text style={[styles.currentStockValue, isLowStock && { color: '#FF3B30' }]}>
                    {item.quantity}
                  </Text>
                  <Text style={styles.currentStockUnit}>{item.unit || 'units'}</Text>
                </View>
              </View>

              {/* Action Toggle */}
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    action === 'add' && styles.toggleBtnAddActive,
                  ]}
                  onPress={() => setAction('add')}
                >
                  <ArrowUpCircle
                    size={16}
                    color={action === 'add' ? '#FFFFFF' : TOKENS.text.tertiary}
                  />
                  <Text style={[styles.toggleBtnText, action === 'add' && { color: '#FFFFFF' }]}>
                    Stock In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    action === 'remove' && styles.toggleBtnRemoveActive,
                  ]}
                  onPress={() => setAction('remove')}
                >
                  <ArrowDownCircle
                    size={16}
                    color={action === 'remove' ? '#FFFFFF' : TOKENS.text.tertiary}
                  />
                  <Text style={[styles.toggleBtnText, action === 'remove' && { color: '#FFFFFF' }]}>
                    Stock Out
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quantity Input */}
              <View style={styles.qtySection}>
                <Text style={styles.label}>Quantity ({item.unit || 'units'})</Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => {
                      const n = parseInt(q) || 1;
                      return String(Math.max(1, n - 1));
                    })}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.qtyInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="number-pad"
                    placeholder="1"
                    placeholderTextColor={TOKENS.text.tertiary}
                  />
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => {
                      const n = parseInt(q) || 0;
                      return String(n + 1);
                    })}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Result Preview */}
              <View style={styles.resultPreview}>
                <Text style={styles.resultLabel}>Result:</Text>
                <Text style={styles.resultValue}>
                  {item.quantity} {action === 'add' ? '+' : '−'} {qty} = {newQty} {item.unit || 'units'}
                </Text>
              </View>

              {/* Notes */}
              <View style={styles.notesSection}>
                <Text style={styles.label}>Notes (optional)</Text>
                <TextInput
                  style={styles.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Reason for movement..."
                  placeholderTextColor={TOKENS.text.tertiary}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                action === 'add' ? styles.submitBtnAdd : styles.submitBtnRemove,
                (!canSubmit || isLoading) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {action === 'add' ? 'Add' : 'Remove'} {qty || 0} {item.unit || 'units'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.60)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 34,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { maxHeight: 400 },
  itemBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  itemCode: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  currentStock: { alignItems: 'flex-end' },
  currentStockLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
  },
  currentStockValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  currentStockUnit: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
  },
  toggleRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toggleBtnAddActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  toggleBtnRemoveActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.50)',
  },
  qtySection: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.60)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  qtyBtnText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  qtyInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  resultPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  resultLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
  },
  resultValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  notesSection: { marginBottom: 16 },
  notesInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    color: '#FFFFFF',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  submitBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnAdd: { backgroundColor: '#10B981' },
  submitBtnRemove: { backgroundColor: '#EF4444' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
