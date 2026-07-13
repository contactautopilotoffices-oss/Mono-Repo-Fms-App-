// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { getProcurementUsers, createTicketMaterialRequest } from '@/utils/api/mobileApi';
import { compressImage } from '@/utils/mediaUtils';
import { serverApi } from '@/lib/serverApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;
  propertyId: string;
  organizationId?: string;
  allowCustomItems?: boolean;
  onSuccess?: () => void;
}

interface MaterialItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  description: string;
  links: string;
  photo: string | null;
}

export default function ProcurementCatalogModal({
  isOpen,
  onClose,
  ticketId,
  propertyId,
  organizationId,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();

  const [procurementUsers, setProcurementUsers] = useState<any[]>([]);
  const [selectedProcurementId, setSelectedProcurementId] = useState<string | null>(null);
  const [showProcurementDropdown, setShowProcurementDropdown] = useState(false);
  const [budgetType, setBudgetType] = useState<'rnm' | 'general'>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Multiple items state
  const [items, setItems] = useState<MaterialItem[]>([
    { id: '1', name: '', unit: 'pcs', quantity: '1', description: '', links: '', photo: null }
  ]);
  const [compressingItemId, setCompressingItemId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    try {
      const users = await getProcurementUsers({ propertyId, organizationId });
      setProcurementUsers(users);
    } catch (err) {
      console.error('[CatalogModal] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, propertyId, organizationId]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setSelectedProcurementId(null);
      setBudgetType('general');
      setItems([{ id: '1', name: '', unit: 'pcs', quantity: '1', description: '', links: '', photo: null }]);
    }
  }, [isOpen]);

  const addNewItem = () => {
    const newId = Date.now().toString();
    setItems(prev => [...prev, { id: newId, name: '', unit: 'pcs', quantity: '1', description: '', links: '', photo: null }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof MaterialItem, value: string | null) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const pickItemPhoto = async (itemId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setCompressingItemId(itemId);
      try {
        const compressedUri = await compressImage(result.assets[0].uri);
        updateItem(itemId, 'photo', compressedUri);
      } catch (err) {
        console.error('Compression error:', err);
        updateItem(itemId, 'photo', result.assets[0].uri);
      } finally {
        setCompressingItemId(null);
      }
    }
  };

  const uploadPhoto = async (photoUri: string): Promise<string | null> => {
    try {
      const fileRes = await fetch(photoUri);
      const blob = await fileRes.blob();
      const filename = `custom-${Date.now()}.jpg`;
      const path = `procurement-items/${filename}`;
      const { error: uploadError } = await serverApi.upload('procurement-items', path, blob, 'image/jpeg');
      if (uploadError) throw new Error(uploadError.message);
      const { data: urlData } = await serverApi.getPublicUrl('procurement-items', path);
      return urlData?.publicUrl ?? null;
    } catch (err) {
      console.error('[uploadPhoto] Failed:', err);
      return null;
    }
  };

  const handleSubmit = async () => {
    const validItems = items.filter(item => item.name.trim());
    if (validItems.length === 0) {
      Alert.alert('Missing Field', 'Please enter at least one item name.');
      return;
    }
    if (!selectedProcurementId) {
      Alert.alert('Selection Required', 'Please select a staff member to assign this request to.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload photos and prepare items
      const preparedItems = await Promise.all(validItems.map(async (item) => {
        let photoUrl = '';
        if (item.photo) {
          photoUrl = await uploadPhoto(item.photo) || '';
        }
        const links = item.links.split(',').map(l => l.trim()).filter(Boolean);
        return {
          catalog_item_id: null,
          name: item.name.trim(),
          quantity: parseInt(item.quantity, 10) || 1,
          unit_price: 0,
          photo_url: photoUrl,
          description: item.description.trim(),
          links,
          attachments: [],
        };
      }));

      const res = await createTicketMaterialRequest(ticketId, {
        assignee_uid: selectedProcurementId,
        property_id: propertyId,
        organization_id: organizationId || '',
        budget_type: budgetType,
        has_custom_items: true,
        items: preparedItems,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to create material request');
      }

      Alert.alert('Success', 'Material request submitted successfully.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Submit error:', err);
      Alert.alert('Error', err.message || 'Failed to submit material request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasValidItems = items.some(item => item.name.trim());

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#0F1521' }}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-down" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Material Request</Text>
            <Text style={styles.headerSubtitle}>Add items for procurement</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#7CB9A8" />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Account Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Select Account</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.budgetCard, budgetType === 'rnm' && styles.budgetCardActive]}
                  onPress={() => setBudgetType('rnm')}
                >
                  <Ionicons name="pricetag-outline" size={20} color={budgetType === 'rnm' ? '#7CB9A8' : '#64748B'} />
                  <Text style={[styles.budgetCardText, budgetType === 'rnm' && styles.budgetCardTextActive]}>
                    Repair &{'\n'}Maintenance
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.budgetCard, budgetType === 'general' && styles.budgetCardActive]}
                  onPress={() => setBudgetType('general')}
                >
                  <Ionicons name="cube-outline" size={20} color={budgetType === 'general' ? '#7CB9A8' : '#64748B'} />
                  <Text style={[styles.budgetCardText, budgetType === 'general' && styles.budgetCardTextActive]}>
                    General{'\n'}Account
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Staff Selector */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Choose Staff for Order</Text>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => setShowProcurementDropdown(!showProcurementDropdown)}
              >
                {selectedProcurementId ? (
                  <Text style={styles.dropdownText}>
                    {procurementUsers.find(u => u.id === selectedProcurementId)?.full_name}
                  </Text>
                ) : (
                  <Text style={styles.dropdownPlaceholder}>Pick Staff Member</Text>
                )}
                <Ionicons name={showProcurementDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
              </TouchableOpacity>
              {showProcurementDropdown && (
                <View style={styles.dropdownMenu}>
                  {procurementUsers.map((u, i) => (
                    <TouchableOpacity
                      key={u.id}
                      style={[
                        styles.dropdownItem,
                        i === procurementUsers.length - 1 && { borderBottomWidth: 0 },
                        selectedProcurementId === u.id && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setSelectedProcurementId(u.id);
                        setShowProcurementDropdown(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, selectedProcurementId === u.id && { color: '#10B981', fontWeight: '700' }]}>
                        {u.full_name}
                      </Text>
                      {selectedProcurementId === u.id && <Ionicons name="checkmark" size={16} color="#10B981" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Items List */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Items</Text>
                <TouchableOpacity style={styles.addItemBtn} onPress={addNewItem}>
                  <Ionicons name="add" size={18} color="#10B981" />
                  <Text style={styles.addItemBtnText}>Add Item</Text>
                </TouchableOpacity>
              </View>

              {items.map((item, index) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemNumber}>Item {index + 1}</Text>
                    {items.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeItemBtn}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput
                    style={[styles.customInput, { marginBottom: 10 }]}
                    placeholder="Item Name (e.g. 50W LED Bulb)"
                    placeholderTextColor="#64748B"
                    value={item.name}
                    onChangeText={(v) => updateItem(item.id, 'name', v)}
                  />

                  <View style={styles.row}>
                    <TextInput
                      style={[styles.customInput, { flex: 1 }]}
                      placeholder="Unit (pcs, kg, etc.)"
                      placeholderTextColor="#64748B"
                      value={item.unit}
                      onChangeText={(v) => updateItem(item.id, 'unit', v)}
                    />
                    <TextInput
                      style={[styles.customInput, { width: 80 }]}
                      placeholder="Qty"
                      placeholderTextColor="#64748B"
                      keyboardType="number-pad"
                      value={item.quantity}
                      onChangeText={(v) => updateItem(item.id, 'quantity', v)}
                    />
                  </View>

                  <TextInput
                    style={[styles.customInput, { marginTop: 10, height: 60, textAlignVertical: 'top' }]}
                    placeholder="Details, Specs, or Comments"
                    placeholderTextColor="#64748B"
                    multiline
                    value={item.description}
                    onChangeText={(v) => updateItem(item.id, 'description', v)}
                  />

                  <TextInput
                    style={[styles.customInput, { marginTop: 10 }]}
                    placeholder="Purchase Links (comma separated)"
                    placeholderTextColor="#64748B"
                    value={item.links}
                    onChangeText={(v) => updateItem(item.id, 'links', v)}
                  />

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.photoBtn, item.photo && styles.photoBtnActive]}
                      onPress={() => pickItemPhoto(item.id)}
                      disabled={compressingItemId === item.id}
                    >
                      {compressingItemId === item.id ? (
                        <ActivityIndicator size="small" color="#10B981" />
                      ) : (
                        <Ionicons name="camera-outline" size={20} color={item.photo ? '#10B981' : '#64748B'} />
                      )}
                      <Text style={[styles.photoBtnText, item.photo && { color: '#10B981' }]}>
                        {item.photo ? 'Photo Selected' : 'Add Photo'}
                      </Text>
                    </TouchableOpacity>
                    {item.photo && (
                      <TouchableOpacity
                        style={styles.removePhotoBtn}
                        onPress={() => updateItem(item.id, 'photo', null)}
                      >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {item.photo && (
                    <Image source={{ uri: item.photo }} style={styles.previewImage} />
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Footer */}
        {!isLoading && (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={[styles.submitBtn, (!hasValidItems || !selectedProcurementId || isSubmitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!hasValidItems || !selectedProcurementId || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Submit Request ({items.filter(i => i.name.trim()).length})</Text>
                  <Ionicons name="paper-plane-outline" size={18} color="#FFF" />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#0F1521',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8,
  },
  addItemBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  budgetCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  budgetCardActive: {
    backgroundColor: 'rgba(124,185,168,0.1)',
    borderColor: 'rgba(124,185,168,0.3)',
  },
  budgetCardText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  budgetCardTextActive: {
    color: '#7CB9A8',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dropdownText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  dropdownPlaceholder: {
    fontSize: 15,
    color: '#64748B',
  },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(16,185,129,0.05)',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#FFF',
  },
  itemCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  removeItemBtn: {
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  customInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFF',
    fontSize: 15,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  removePhotoBtn: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  previewImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  footer: {
    paddingTop: 16,
    paddingHorizontal: 20,
    backgroundColor: '#0F1521',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7CB9A8',
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
});
