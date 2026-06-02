import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Dimensions,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import {
  getProcurementCatalogItems,
  getProcurementUsers,
  createTicketMaterialRequest,
} from '@/utils/api/mobileApi';
import { compressImage } from '@/utils/mediaUtils';
import { serverApi } from '@/lib/serverApi';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_W - 48) / 2;
const PLACEHOLDER_BG = 'https://placehold.co/400x400/f8fafc/cbd5e1?text=No+Photo';

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  photo_url?: string;
  category?: string;
  unit?: string;
  estimated_price?: number;
}

interface CartItem extends Partial<CatalogItem> {
  id: string;
  name: string;
  quantity: number;
  estimated_price: number;
  is_custom?: boolean;
  links?: string[];
  attachments?: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;
  propertyId: string;
  organizationId?: string;
  onSuccess?: () => void;
}

function getItemPhoto(item: CatalogItem): string {
  const url = item.photo_url;
  if (url && !url.includes('loremflickr.com') && !url.includes('unsplash.com')) {
    return url;
  }
  return `https://placehold.co/400x400/f8fafc/cbd5e1?text=${encodeURIComponent(item.name?.split(' ')[0] || 'Item')}`;
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

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [step, setStep] = useState<'browse' | 'finalize'>('browse');
  const [procurementUsers, setProcurementUsers] = useState<any[]>([]);
  const [selectedProcurementId, setSelectedProcurementId] = useState<string | null>(null);
  const [showProcurementDropdown, setShowProcurementDropdown] = useState(false);
  const [budgetType, setBudgetType] = useState<'rnm' | 'general'>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  // Custom item state
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('pcs');
  const [customQty, setCustomQty] = useState('1');
  const [customDesc, setCustomDesc] = useState('');
  const [customLinks, setCustomLinks] = useState('');
  const [customPhoto, setCustomPhoto] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(catalogItems.map(i => i.category).filter((c): c is string => Boolean(c))));
    return ['All', ...cats];
  }, [catalogItems]);

  const fetchData = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    try {
      const [items, users] = await Promise.all([
        getProcurementCatalogItems({ propertyId, organizationId }),
        getProcurementUsers({ propertyId, organizationId }),
      ]);
      setCatalogItems(items.map((i: any) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        photo_url: i.photo_url,
        category: i.category,
        unit: i.unit,
        estimated_price: i.estimated_price,
      })));
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
      setStep('browse');
      setCart([]);
      setSearchQuery('');
      setSelectedCategory('All');
      setSelectedProcurementId(null);
      setBudgetType('general');
      resetCustomItem();
    }
  }, [isOpen]);

  const resetCustomItem = () => {
    setCustomName('');
    setCustomUnit('pcs');
    setCustomQty('1');
    setCustomDesc('');
    setCustomLinks('');
    setCustomPhoto(null);
  };

  const filteredItems = useMemo(() => {
    let result = catalogItems;
    if (selectedCategory !== 'All') {
      result = result.filter(i => i.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        i =>
          i.name?.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [catalogItems, selectedCategory, searchQuery]);

  const addToCart = (item: CatalogItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          quantity: 1,
          estimated_price: item.estimated_price ?? 0,
          unit: item.unit || 'pcs',
          photo_url: item.photo_url,
          category: item.category,
          description: item.description,
        },
      ];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(i => {
        if (i.id === id) {
          const newQty = Math.max(1, i.quantity + delta);
          return { ...i, quantity: newQty };
        }
        return i;
      })
    );
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const pickCustomPhoto = async () => {
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
      setIsCompressing(true);
      try {
        const compressedUri = await compressImage(result.assets[0].uri);
        setCustomPhoto(compressedUri);
      } catch (err) {
        console.error('Compression error:', err);
        setCustomPhoto(result.assets[0].uri);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const uploadCustomPhoto = async (): Promise<string | null> => {
    if (!customPhoto) return null;
    try {
      const fileRes = await fetch(customPhoto);
      const blob = await fileRes.blob();
      const filename = `custom-${Date.now()}.jpg`;
      const path = `procurement-items/${filename}`;
      const { error: uploadError } = await serverApi.upload('procurement-items', path, blob, 'image/jpeg');
      if (uploadError) throw new Error(uploadError.message);
      const { data: urlData } = await serverApi.getPublicUrl('procurement-items', path);
      return urlData?.publicUrl ?? null;
    } catch (err) {
      console.error('[uploadCustomPhoto] Failed:', err);
      return null;
    }
  };

  const addCustomItem = async () => {
    if (!customName.trim()) return;

    let photoUrl: string | null = null;
    if (customPhoto) {
      photoUrl = await uploadCustomPhoto();
    }

    const links = customLinks
      .split(',')
      .map(l => l.trim())
      .filter(Boolean);

    setCart(prev => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: customName.trim(),
        quantity: parseInt(customQty, 10) || 1,
        estimated_price: 0,
        unit: customUnit || 'pcs',
        description: customDesc.trim() || undefined,
        is_custom: true,
        links: links.length > 0 ? links : undefined,
        photo_url: photoUrl || undefined,
        attachments: [],
      },
    ]);
    resetCustomItem();
  };

  const cartTotalItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotalPrice = cart.reduce(
    (sum, i) => sum + (i.estimated_price || 0) * i.quantity,
    0
  );
  const hasCustomItems = cart.some(i => i.is_custom);

  const getCartQtyForItem = (itemId: string) => {
    return cart.find(i => i.id === itemId)?.quantity ?? 0;
  };

  const handleSubmit = async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add at least one item to the cart.');
      return;
    }
    if (!selectedProcurementId) {
      Alert.alert('Selection Required', 'Please select a procurement member to assign this request to.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createTicketMaterialRequest(ticketId, {
        assignee_uid: selectedProcurementId,
        property_id: propertyId,
        organization_id: organizationId || '',
        budget_type: budgetType,
        has_custom_items: hasCustomItems,
        items: cart.map(item => ({
          catalog_item_id: item.is_custom ? null : item.id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.estimated_price || 0,
          photo_url: item.photo_url || '',
          description: item.description || '',
          links: item.links || [],
          attachments: item.attachments || [],
        })),
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

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#0F1521' }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
          <TouchableOpacity
            onPress={() => {
              if (step === 'finalize') {
                setStep('browse');
              } else {
                onClose();
              }
            }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>
              {step === 'browse' ? 'Buy Items' : 'Review Order'}
            </Text>
            {step === 'finalize' && (
              <Text style={styles.headerSubtitle}>Choose account & staff</Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Search Bar */}
        {step === 'browse' && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for items, tools..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Category Chips */}
        {step === 'browse' && categories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Content */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#7CB9A8" />
          </View>
        ) : step === 'browse' ? (
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="cube-outline" size={48} color="#4B5563" />
                  <Text style={styles.emptyText}>No items found</Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {filteredItems.map((item, index) => {
                    const cartQty = getCartQtyForItem(item.id);
                    return (
                      <Animated.View
                        key={item.id}
                        entering={FadeInUp.delay(index * 30).duration(300)}
                        style={styles.itemCard}
                      >
                        {/* Photo */}
                        <View style={styles.itemImageWrap}>
                          <Image
                            source={{ uri: getItemPhoto(item) }}
                            style={styles.itemImage}
                            resizeMode="contain"
                          />
                          {cartQty > 0 && (
                            <View style={styles.cartBadge}>
                              <Text style={styles.cartBadgeText}>{cartQty}</Text>
                            </View>
                          )}
                        </View>

                        {/* Info */}
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName} numberOfLines={2}>
                            {item.name}
                          </Text>
                          <Text style={styles.itemMeta}>
                            {item.unit || 'unit'}
                          </Text>
                          <View style={styles.itemFooter}>
                            {item.estimated_price && item.estimated_price > 0 ? (
                              <Text style={styles.itemPrice}>
                                ₹{item.estimated_price}
                              </Text>
                            ) : (
                              <View />
                            )}
                            <TouchableOpacity
                              style={styles.addBtn}
                              onPress={() => addToCart(item)}
                            >
                              <Ionicons name="add" size={18} color="#FFF" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </Animated.View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* Bottom Cart Bar */}
            {cart.length > 0 && (
              <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
                <View style={styles.bottomBarLeft}>
                  <View style={styles.cartIconWrap}>
                    <Ionicons name="cart-outline" size={20} color="#FFF" />
                    <View style={styles.bottomBadge}>
                      <Text style={styles.bottomBadgeText}>{cartTotalItems}</Text>
                    </View>
                  </View>
                  <View>
                    <Text style={styles.bottomTotal}>
                      ₹{cartTotalPrice.toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.bottomItems}>
                      {cart.length} item{cart.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.reviewBtn}
                  onPress={() => setStep('finalize')}
                >
                  <Text style={styles.reviewBtnText}>Review Order</Text>
                  <Ionicons name="chevron-forward" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          /* Finalize Step */
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.finalizeContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Budget Type Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Select Account</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.budgetCard,
                    budgetType === 'rnm' && styles.budgetCardActive,
                  ]}
                  onPress={() => setBudgetType('rnm')}
                >
                  <Ionicons
                    name="pricetag-outline"
                    size={20}
                    color={budgetType === 'rnm' ? '#7CB9A8' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.budgetCardText,
                      budgetType === 'rnm' && styles.budgetCardTextActive,
                    ]}
                  >
                    Repair &{'\n'}Maintenance
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.budgetCard,
                    budgetType === 'general' && styles.budgetCardActive,
                  ]}
                  onPress={() => setBudgetType('general')}
                >
                  <Ionicons
                    name="cube-outline"
                    size={20}
                    color={budgetType === 'general' ? '#7CB9A8' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.budgetCardText,
                      budgetType === 'general' && styles.budgetCardTextActive,
                    ]}
                  >
                    General{'\n'}Account
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Procurement User Selector */}
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
                <Ionicons
                  name={showProcurementDropdown ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#64748B"
                />
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
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selectedProcurementId === u.id && { color: '#10B981', fontWeight: '700' },
                        ]}
                      >
                        {u.full_name}
                      </Text>
                      {selectedProcurementId === u.id && (
                        <Ionicons name="checkmark" size={16} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Cart Items */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Items Ordered</Text>
              {cart.map(item => (
                <View key={item.id} style={styles.cartItem}>
                  <View style={styles.cartItemLeft}>
                    {item.photo_url ? (
                      <Image
                        source={{ uri: item.photo_url }}
                        style={styles.cartItemThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.cartItemIcon}>
                        <Ionicons name="cube-outline" size={16} color="#3B82F6" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.cartItemName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.is_custom && (
                          <View style={styles.customBadge}>
                            <Text style={styles.customBadgeText}>Custom</Text>
                          </View>
                        )}
                      </View>
                      {item.description ? (
                        <Text style={styles.cartItemDesc} numberOfLines={2}>
                          {item.description}
                        </Text>
                      ) : null}
                      {item.links && item.links.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {item.links.map((link, idx) => (
                            <Text key={idx} style={styles.linkText}>Link {idx + 1}</Text>
                          ))}
                        </View>
                      )}
                      {item.estimated_price && item.estimated_price > 0 ? (
                        <Text style={styles.cartItemPrice}>
                          ₹{item.estimated_price} / {item.unit || 'pcs'}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.cartItemRight}>
                    <View style={styles.qtyControl}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => updateQuantity(item.id, -1)}
                      >
                        <Ionicons name="remove" size={14} color="#64748B" />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => updateQuantity(item.id, 1)}
                      >
                        <Ionicons name="add" size={14} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeFromCart(item.id)}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Add Custom Item */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Item not in list? Add it here</Text>

              <TextInput
                style={[styles.customInput, { marginBottom: 8 }]}
                placeholder="Item Name (e.g. Special Drill Bit)"
                placeholderTextColor="#64748B"
                value={customName}
                onChangeText={setCustomName}
              />

              <View style={styles.customItemRow}>
                <TextInput
                  style={[styles.customInput, { flex: 1 }]}
                  placeholder="Unit (pcs, kg, etc.)"
                  placeholderTextColor="#64748B"
                  value={customUnit}
                  onChangeText={setCustomUnit}
                />
                <TextInput
                  style={[styles.customInput, { width: 70 }]}
                  placeholder="Qty"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  value={customQty}
                  onChangeText={setCustomQty}
                />
              </View>

              <TextInput
                style={[styles.customInput, { marginBottom: 8, height: 60, textAlignVertical: 'top' }]}
                placeholder="Details / Specs (Optional)"
                placeholderTextColor="#64748B"
                multiline
                value={customDesc}
                onChangeText={setCustomDesc}
              />

              <TextInput
                style={[styles.customInput, { marginBottom: 8 }]}
                placeholder="Links (comma separated)"
                placeholderTextColor="#64748B"
                value={customLinks}
                onChangeText={setCustomLinks}
              />

              <View style={styles.customItemRow}>
                <TouchableOpacity
                  style={[styles.photoBtn, customPhoto && styles.photoBtnActive]}
                  onPress={pickCustomPhoto}
                  disabled={isCompressing}
                >
                  {isCompressing ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : customPhoto ? (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                      <Text style={[styles.photoBtnText, { color: '#10B981' }]}>Photo Added</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="camera" size={18} color="#64748B" />
                      <Text style={styles.photoBtnText}>Add Photo</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addCustomBtn, !customName.trim() && { opacity: 0.4 }]}
                  onPress={addCustomItem}
                  disabled={!customName.trim() || isCompressing}
                >
                  <Ionicons name="add" size={18} color="#FFF" />
                  <Text style={styles.addCustomBtnText}>Add Item</Text>
                </TouchableOpacity>
              </View>

              {customPhoto && (
                <Image
                  source={{ uri: customPhoto }}
                  style={{ width: 80, height: 80, borderRadius: 10, marginTop: 8 }}
                  resizeMode="cover"
                />
              )}
            </View>

            {/* Total & Submit */}
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalAmount}>
                  ₹{cartTotalPrice.toLocaleString('en-IN')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="bag-check-outline" size={18} color="#FFF" />
                    <Text style={styles.submitBtnText}>Send Order</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#0F1521',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  categoryChipActive: {
    backgroundColor: 'rgba(124,185,168,0.15)',
    borderColor: 'rgba(124,185,168,0.35)',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  categoryChipTextActive: {
    color: '#7CB9A8',
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemCard: {
    width: CARD_SIZE,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  itemImageWrap: {
    width: CARD_SIZE,
    height: CARD_SIZE * 0.85,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  itemImage: {
    width: CARD_SIZE - 20,
    height: CARD_SIZE * 0.75,
  },
  cartBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
  },
  itemInfo: {
    padding: 10,
    gap: 4,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 16,
  },
  itemMeta: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: '#1E2633',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bottomBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  bottomTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  bottomItems: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1,
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#7CB9A8',
    borderRadius: 14,
  },
  reviewBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  finalizeContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  budgetCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  budgetCardActive: {
    backgroundColor: 'rgba(124,185,168,0.08)',
    borderColor: 'rgba(124,185,168,0.3)',
  },
  budgetCardText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
  budgetCardTextActive: {
    color: '#7CB9A8',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  dropdownPlaceholder: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  dropdownMenu: {
    marginTop: 6,
    backgroundColor: '#1E2633',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFF',
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  cartItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cartItemThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cartItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  customBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  customBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cartItemDesc: {
    fontSize: 11,
    fontWeight: '400',
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  cartItemPrice: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },
  linkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  customItemRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  customInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
  },
  addCustomBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 2,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#7CB9A8',
    borderRadius: 14,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
});
