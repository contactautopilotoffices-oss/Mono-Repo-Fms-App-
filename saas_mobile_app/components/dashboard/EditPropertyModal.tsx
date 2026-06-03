import React, { useState } from 'react';
import { serverApi } from '@/lib/serverApi';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker'; // Optional if you have it, else we use buttons

interface Props {
  property: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditPropertyModal({ property, isOpen, onClose, onSuccess }: Props) {
  const [name, setName] = useState(property?.name || '');
  const [status, setStatus] = useState(property?.status || 'active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Refresh if property changes
  React.useEffect(() => {
    if (isOpen && property) {
      setName(property.name || '');
      setStatus(property.status || 'active');
      setError('');
    }
  }, [isOpen, property]);

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Property name is required.'); return; }
    setIsSubmitting(true);

    try {
      const { error: updateError } = await serverApi.query({
        table: 'properties',
        action: 'update',
        values: {
          name: name.trim(),
          status: status,
        },
        filters: [{ op: 'eq', column: 'id', value: property.id }],
        single: true,
      });

      if (updateError) throw updateError;
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update property.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!property) return null;

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Ionicons name="create-outline" size={24} color="#6366F1" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Edit Property</Text>
                  <Text style={styles.headerSub}>Update property details</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Property Name *</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g., SS Plaza Tower A" placeholderTextColor="#94A3B8" />
            </View>

            {/* Status picker */}
            <View style={styles.field}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.chipRow}>
                {['active', 'inactive', 'maintenance'].map(s => (
                  <TouchableOpacity key={s} style={[styles.chip, status === s && styles.chipActive]} onPress={() => setStatus(s)}>
                    <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Error */}
            {error !== '' && (
              <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
            )}

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, isSubmitting && { opacity: 0.5 }]} onPress={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="save-outline" size={18} color="#FFF" />
                    <Text style={styles.submitText}>Save Changes</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(99,102,241,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#1A2332' },
  headerSub: { fontSize: 13, color: '#94A3B8' },
  closeBtn: { padding: 8, borderRadius: 8 },
  field: { marginBottom: 16 },
  label: { fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16, fontSize: 14, fontWeight: '500', color: '#1A2332' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B', textTransform: 'capitalize' },
  chipTextActive: { color: '#FFF' },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  submitBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: '#708F96', justifyContent: 'center', alignItems: 'center' },
  submitText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
