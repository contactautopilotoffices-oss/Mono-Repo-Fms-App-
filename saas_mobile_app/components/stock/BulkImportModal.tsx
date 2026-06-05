/**
 * BulkImportModal - CSV and manual bulk import for stock items
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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { stockService } from '@/services/stockService';
import { X, Upload, Plus, Trash2, Check } from 'lucide-react-native';

interface BulkImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  propertyId: string;
}

interface ImportRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: string;
  min_threshold: string;
  per_unit_cost: string;
  location: string;
  error?: string;
}

const CSV_TEMPLATE = `name,category,unit,quantity,min_threshold,per_unit_cost,location
Hand Sanitizer,HK Chemical,litre,50,10,250,Store Room A
Tissue Paper,Tissue Paper Expenses,pieces,100,20,50,Reception`;

const CATEGORY_OPTIONS = [
  'HK Material Equipment', 'HK Chemical', 'Mineral Water Expenses Sources',
  'Tea and Coffee Expenses', 'Tissue Paper Expenses', 'Supplies', 'Safety', 'Other',
];

const UNIT_OPTIONS = ['units', 'kg', 'g', 'litre', 'ml', 'pieces', 'boxes', 'rolls', 'packs', 'bottles', 'sheets'];

export default function BulkImportModal({ visible, onClose, onSuccess, propertyId }: BulkImportModalProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<'csv' | 'manual'>('csv');
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  const resetForm = () => {
    setCsvText('');
    setRows([]);
    setMode('csv');
    setShowTemplate(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: ImportRow = {
        id: `row-${i}`,
        name: '',
        category: '',
        unit: 'units',
        quantity: '0',
        min_threshold: '10',
        per_unit_cost: '0',
        location: '',
      };

      header.forEach((col, idx) => {
        const val = values[idx] || '';
        switch (col) {
          case 'name': row.name = val; break;
          case 'category': row.category = val; break;
          case 'unit': row.unit = val || 'units'; break;
          case 'quantity': row.quantity = val; break;
          case 'min_threshold': row.min_threshold = val; break;
          case 'per_unit_cost': row.per_unit_cost = val; break;
          case 'location': row.location = val; break;
        }
      });

      if (!row.name) {
        row.error = 'Name required';
      } else {
        rows.push(row);
      }
    }
    return rows;
  };

  const handleCSVPreview = () => {
    const parsed = parseCSV(csvText);
    if (parsed.length === 0) {
      Alert.alert('Invalid CSV', 'Please enter valid CSV data with at least one item');
      return;
    }
    setRows(parsed);
  };

  const addManualRow = () => {
    setRows(prev => [...prev, {
      id: `row-${Date.now()}`,
      name: '',
      category: '',
      unit: 'units',
      quantity: '0',
      min_threshold: '10',
      per_unit_cost: '0',
      location: '',
    }]);
  };

  const updateRow = (id: string, field: keyof ImportRow, value: string) => {
    setRows(prev => prev.map(row =>
      row.id === id
        ? { ...row, [field]: value, error: field === 'name' && !value ? 'Name required' : row.error }
        : row
    ));
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const handleImport = async () => {
    const validRows = rows.filter(r => !r.error && r.name);
    if (validRows.length === 0) {
      Alert.alert('No Items', 'Please add at least one valid item');
      return;
    }

    setIsImporting(true);
    try {
      const items = validRows.map(row => ({
        property_id: propertyId,
        name: row.name,
        category: row.category || undefined,
        unit: row.unit,
        quantity: parseFloat(row.quantity) || 0,
        min_threshold: parseFloat(row.min_threshold) || 10,
        per_unit_cost: parseFloat(row.per_unit_cost) || 0,
        location: row.location || undefined,
      }));

      const result = await stockService.bulkImport(propertyId, items);

      if (result.success && result.data) {
        const { imported, failed } = result.data;
        if (failed > 0) {
          Alert.alert('Partial Import', `Imported ${imported} items. ${failed} items failed.`);
        } else {
          Alert.alert('Success', `Imported ${imported} items successfully!`);
        }
        resetForm();
        onSuccess(imported);
        onClose();
      } else {
        Alert.alert('Error', result.error || 'Import failed');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong');
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = rows.filter(r => !r.error && r.name).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIcon, { backgroundColor: colors.primary + '18' }]}>
                <Upload size={20} color={colors.primary} />
              </View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Bulk Import</Text>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Mode Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'csv' && { backgroundColor: colors.primary + '15' }]}
              onPress={() => setMode('csv')}
            >
              <Text style={[styles.tabText, { color: mode === 'csv' ? colors.primary : colors.textSecondary }]}>
                CSV Import
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'manual' && { backgroundColor: colors.primary + '15' }]}
              onPress={() => setMode('manual')}
            >
              <Text style={[styles.tabText, { color: mode === 'manual' ? colors.primary : colors.textSecondary }]}>
                Manual Entry
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {mode === 'csv' ? (
              <View style={styles.csvSection}>
                <TouchableOpacity onPress={() => setShowTemplate(!showTemplate)}>
                  <Text style={[styles.templateLink, { color: colors.primary }]}>
                    {showTemplate ? 'Hide Template' : 'Show CSV Template'}
                  </Text>
                </TouchableOpacity>

                {showTemplate && (
                  <View style={[styles.templateBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.templateText, { color: colors.textSecondary }]}>{CSV_TEMPLATE}</Text>
                  </View>
                )}

                <TextInput
                  style={[styles.csvInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={csvText}
                  onChangeText={setCsvText}
                  placeholder="Paste your CSV data here..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={6}
                />

                <TouchableOpacity
                  style={[styles.previewBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCSVPreview}
                >
                  <Text style={styles.previewBtnText}>Preview</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.manualSection}>
                <View style={styles.manualHeader}>
                  <Text style={[styles.sectionLabel, { color: colors.text }]}>Add Items</Text>
                  <TouchableOpacity style={[styles.addRowBtn, { borderColor: colors.primary }]} onPress={addManualRow}>
                    <Plus size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Add Row</Text>
                  </TouchableOpacity>
                </View>

                {rows.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No items added yet. Tap "Add Row" to start.
                    </Text>
                  </View>
                ) : (
                  rows.map((row, index) => (
                    <View key={row.id} style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.rowHeader}>
                        <Text style={[styles.rowNumber, { color: colors.textSecondary }]}>#{index + 1}</Text>
                        <TouchableOpacity onPress={() => removeRow(row.id)}>
                          <Trash2 size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={[styles.rowInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={row.name}
                        onChangeText={(v) => updateRow(row.id, 'name', v)}
                        placeholder="Item Name *"
                        placeholderTextColor={colors.textSecondary}
                      />
                      {row.error && <Text style={styles.errorText}>{row.error}</Text>}
                      <View style={styles.rowFields}>
                        <TextInput
                          style={[styles.rowInputSmall, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={row.quantity}
                          onChangeText={(v) => updateRow(row.id, 'quantity', v)}
                          placeholder="Qty"
                          keyboardType="numeric"
                          placeholderTextColor={colors.textSecondary}
                        />
                        <TextInput
                          style={[styles.rowInputSmall, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={row.location}
                          onChangeText={(v) => updateRow(row.id, 'location', v)}
                          placeholder="Location"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {rows.length > 0 && (
              <View style={[styles.previewSummary, { backgroundColor: colors.surface }]}>
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.text }}>Items to import:</Text>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 18 }}>{validCount}</Text>
                </View>
                {rows.length > validCount && (
                  <View style={styles.summaryRow}>
                    <Text style={{ color: '#EF4444' }}>Invalid rows:</Text>
                    <Text style={{ color: '#EF4444' }}>{rows.length - validCount}</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={handleClose}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.importBtn, { backgroundColor: validCount > 0 ? colors.primary : colors.textSecondary }]}
              onPress={handleImport}
              disabled={validCount === 0 || isImporting}
            >
              <Text style={styles.importText}>
                {isImporting ? 'Importing...' : `Import ${validCount} Items`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  headerIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  tabs: { flexDirection: 'row', padding: 16, gap: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  content: { paddingHorizontal: 16, maxHeight: 400 },
  csvSection: { gap: 12 },
  templateLink: { fontSize: 13, marginBottom: 8 },
  templateBox: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  templateText: { fontSize: 11, fontFamily: 'monospace' },
  csvInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 13, minHeight: 120, textAlignVertical: 'top' },
  previewBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  previewBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  manualSection: { gap: 12 },
  manualHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontSize: 14, fontWeight: '600' },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  rowCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowNumber: { fontSize: 12, fontWeight: '600' },
  rowInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 6 },
  rowInputSmall: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13 },
  rowFields: { flexDirection: 'row', gap: 8 },
  errorText: { color: '#EF4444', fontSize: 12, marginBottom: 6 },
  previewSummary: { padding: 16, borderRadius: 12, marginTop: 16, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  footer: { flexDirection: 'row', gap: 12, padding: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  importBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  importText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
