import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'expo-router';
import { queryClient } from '@/utils/queryClient';

export default function MobilePropertySelector({ currentPropertyId }: { currentPropertyId: string }) {
  const { membership } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Use membership properties, filtering out any missing names
  const properties = membership?.properties || [];
  
  if (properties.length <= 1) {
    const currentProp = properties.find((p: any) => p.id === currentPropertyId);
    return (
      <View style={styles.container}>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {currentProp?.name || 'Property'}
        </Text>
      </View>
    );
  }

  const currentProp = properties.find((p: any) => p.id === currentPropertyId);

  const handleSelect = (propId: string) => {
    setIsOpen(false);
    if (propId === currentPropertyId) return;

    // Invalidate ALL queries for the OLD property to prevent data contamination
    queryClient.invalidateQueries({ queryKey: ['property', currentPropertyId] });

    // Replace the current propertyId in the pathname
    // Pathname looks like /property/123/something
    const segments = pathname.split('/');
    const propIndex = segments.indexOf('property');
    if (propIndex !== -1 && segments.length > propIndex + 1) {
        segments[propIndex + 1] = propId;
        const newPath = segments.join('/');
        router.replace(newPath as any);
    } else {
        router.replace(`/property/${propId}` as any);
    }
  };

  return (
    <>
      <TouchableOpacity 
        style={[styles.container, styles.activeContainer]} 
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {currentProp?.name || 'Select Property'}
        </Text>
        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.60)" style={{ marginLeft: 4, marginTop: 1 }} />
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsOpen(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Property</Text>
              <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={properties}
              keyExtractor={(p) => p.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollArea}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item: prop }) => (
                <TouchableOpacity
                  style={[
                    styles.propertyRow,
                    prop.id === currentPropertyId && styles.propertyRowActive,
                  ]}
                  onPress={() => handleSelect(prop.id)}
                >
                  <View style={styles.iconContainer}>
                    <Ionicons 
                      name="business-outline" 
                      size={20} 
                      color={prop.id === currentPropertyId ? '#8B5CF6' : '#94A3B8'} 
                    />
                  </View>
                  <View style={styles.propertyInfo}>
                    <Text 
                      style={[
                        styles.propertyName,
                        prop.id === currentPropertyId && styles.propertyNameActive
                      ]}
                    >
                      {prop.name}
                    </Text>
                    <Text style={styles.propertyRole}>{prop.role}</Text>
                  </View>
                  {prop.id === currentPropertyId && (
                    <Ionicons name="checkmark-circle" size={22} color="#8B5CF6" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeContainer: {
    paddingVertical: 2,
    paddingRight: 6,
    borderRadius: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 1,
    flexShrink: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 17, 25, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  scrollArea: {
    padding: 16,
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  propertyRowActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  propertyInfo: {
    flex: 1,
  },
  propertyName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 2,
  },
  propertyNameActive: {
    color: '#8B5CF6',
  },
  propertyRole: {
    fontSize: 12,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 'bold',
  },
});
