// @ts-nocheck
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, ActivityIndicator, RefreshControl, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/lib/serverApi';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  ArrowUpCircle, Plus, ChevronRight, X, ArrowUp, Clock, Users,
  Save, Trash2, ChevronLeft, Shield, Zap, Timer, User,
} from 'lucide-react-native';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import {
  fetchEscalationHierarchies, createEscalationHierarchy,
  updateEscalationHierarchy, deleteEscalationHierarchy,
  EscalationHierarchy, EscalationLevel,
} from '@/services/escalationService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserOption { id: string; full_name: string; email: string; role?: string }

// ─── Utility ───────────────────────────────────────────────────────────────────

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Role Options ─────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { label: 'Staff', value: 'staff' },
  { label: 'Manager', value: 'property_manager' },
  { label: 'Admin', value: 'property_admin' },
  { label: 'Org Admin', value: 'org_admin' },
  { label: 'Super Admin', value: 'master_admin' },
  { label: 'Vendor', value: 'vendor' },
];

const TIME_OPTIONS = [15, 30, 60, 120, 240, 480];

// ─── Level Row ─────────────────────────────────────────────────────────────────

function LevelRow({
  level, users, onUpdate, onRemove, isOnly,
}: {
  level: { employee_id: string; escalation_time_minutes: number };
  users: UserOption[];
  onUpdate: (updates: Partial<typeof level>) => void;
  onRemove: () => void;
  isOnly: boolean;
}) {
  const selectedUser = users.find((u) => u.id === level.employee_id);

  return (
    <View style={styles.levelRow}>
      <View style={styles.levelLeft}>
        <View style={styles.levelNum}>
          <Text style={styles.levelNumText}>{'L'}</Text>
        </View>
        <View style={styles.levelContent}>
          <TouchableOpacity style={styles.userPicker} onPress={() => {}}>
            <User size={14} color="#708F96" />
            <Text style={styles.userPickerText}>
              {selectedUser?.full_name || 'Select employee...'}
            </Text>
            <ChevronRight size={14} color="#708F96" />
          </TouchableOpacity>
          <View style={styles.timeRow}>
            <Clock size={12} color="#708F96" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 6 }}>
              {TIME_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeChip, level.escalation_time_minutes === t && styles.timeChipActive]}
                  onPress={() => onUpdate({ escalation_time_minutes: t })}
                >
                  <Text style={[styles.timeChipText, level.escalation_time_minutes === t && styles.timeChipTextActive]}>
                    {formatResponseTime(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
      {!isOnly && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
          <X size={16} color="#EF4444" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EscalationScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { membership } = useAuth();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedHierarchy, setSelectedHierarchy] = useState<EscalationHierarchy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLevels, setFormLevels] = useState<{ employee_id: string; escalation_time_minutes: number }[]>([
    { employee_id: '', escalation_time_minutes: 30 },
  ]);

  const isAdmin = useMemo(() => {
    if (!membership || !propertyId) return false;
    const prop = membership.properties.find((p: any) => p.id === propertyId);
    return prop ? ['property_admin', 'org_admin', 'org_super_admin', 'master_admin'].includes(prop.role?.toLowerCase()) : false;
  }, [membership, propertyId]);

  const fetchAll = useCallback(async () => {
    if (!propertyId) return { hierarchies: [] as EscalationHierarchy[], users: [] as UserOption[] };
    const [hRes, mRes] = await Promise.all([
      fetchEscalationHierarchies(propertyId, membership?.org_id ?? undefined),
      serverApi.query<any[]>({
        table: 'property_memberships',
        action: 'select',
        select: 'users:user_id(id, full_name, email, role)',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      }),
    ]);
    const hierarchies = (hRes.hierarchies || []) as EscalationHierarchy[];
    const users = ((mRes.data || []) as any[])
      .map((m) => m.users)
      .filter(Boolean) as UserOption[];
    return { hierarchies, users };
  }, [propertyId, membership?.org_id]);

  const { data, isLoading, isFetching, refetch } = useServerQuery(
    queryKeys.property.escalation(propertyId),
    fetchAll,
    { staleTime: 1000 * 60 * 5, refetchOnMount: 'always' },
  );

  const hierarchies = data?.hierarchies ?? [];
  const users = data?.users ?? [];

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: hierarchies.length,
    active: hierarchies.filter((h) => h.is_active !== false).length,
    levels: hierarchies.reduce((sum, h) => sum + (h.levels?.length ?? 0), 0),
  }), [hierarchies]);

  // ── Create ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formName.trim() || !propertyId) { Alert.alert('Error', 'Hierarchy name is required'); return; }
    if (!formLevels.some((l) => l.employee_id)) { Alert.alert('Error', 'Add at least one escalation level'); return; }
    setIsSaving(true);
    try {
      const res = await createEscalationHierarchy({
        propertyId,
        organizationId: membership?.org_id || '',
        name: formName.trim(),
        description: formDescription.trim() || null,
        levels: formLevels.map((l) => ({
          employee_id: l.employee_id || null,
          escalation_time_minutes: l.escalation_time_minutes,
        })),
      });
      if (res.error) throw new Error(res.error);
      setShowCreateModal(false);
      setFormName(''); setFormDescription('');
      setFormLevels([{ employee_id: '', escalation_time_minutes: 30 }]);
      await refetch();
      Alert.alert('✅ Created', 'Escalation hierarchy created');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setIsSaving(false); }
  };

  // ── Update ──────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!selectedHierarchy || !formName.trim()) { Alert.alert('Error', 'Name is required'); return; }
    setIsSaving(true);
    try {
      const res = await updateEscalationHierarchy({
        hierarchyId: selectedHierarchy.id,
        propertyId,
        name: formName.trim(),
        description: formDescription.trim() || null,
        levels: formLevels.map((l) => ({
          employee_id: l.employee_id || null,
          escalation_time_minutes: l.escalation_time_minutes,
        })),
      });
      if (res.error) throw new Error(res.error);
      setShowEditModal(false); setSelectedHierarchy(null);
      setFormName(''); setFormDescription('');
      setFormLevels([{ employee_id: '', escalation_time_minutes: 30 }]);
      await refetch();
      Alert.alert('✅ Updated', 'Escalation hierarchy updated');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setIsSaving(false); }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = (h: EscalationHierarchy) => {
    Alert.alert('Delete', `Delete "${h.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const res = await deleteEscalationHierarchy(h.id, propertyId);
          if (res.error) { Alert.alert('Error', res.error); return; }
          await refetch();
          Alert.alert('✅ Deleted', 'Hierarchy deleted');
        },
      },
    ]);
  };

  const openEdit = (h: EscalationHierarchy) => {
    setSelectedHierarchy(h);
    setFormName(h.name);
    setFormDescription(h.description || '');
    setFormLevels(h.levels?.map((l) => ({
      employee_id: l.employee_id || '',
      escalation_time_minutes: l.escalation_time_minutes,
    })) ?? [{ employee_id: '', escalation_time_minutes: 30 }]);
    setShowEditModal(true);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading && hierarchies.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={isDark ? ['#0f172a', '#1e1b4b'] : ['#eef2f6', '#f8fafc']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={isDark ? ['#0f172a', '#1e1b4b', '#0f172a'] : ['#eef2f6', '#f8fafc', '#ffffff']} style={StyleSheet.absoluteFillObject} />

      {/* Header */}
      <SafeBlurView intensity={80} tint="dark" style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Escalation</Text>
            <Text style={styles.headerSub}>{stats.total} hierarchy, {stats.active} active</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeBlurView>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Total', value: stats.total, icon: Shield, color: '#708F96' },
          { label: 'Active', value: stats.active, icon: Zap, color: '#10B981' },
          { label: 'Levels', value: stats.levels, icon: ArrowUp, color: '#F59E0B' },
        ].map((s) => (
          <View key={s.label} style={[styles.statCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
            <View style={[styles.statIcon, { backgroundColor: s.color + '20' }]}>
              <s.icon size={16} color={s.color} />
            </View>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={hierarchies}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={colors.primary} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ArrowUpCircle size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No Escalation Hierarchies</Text>
            <Text style={styles.emptySub}>Define who gets alerted at each level</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.75} onPress={() => isAdmin && openEdit(item)}>
            <SafeBlurView intensity={40} tint="dark" style={styles.hCard}>
              <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.15)']} style={StyleSheet.absoluteFillObject} />
              <View style={styles.hCardTop}>
                <View style={styles.hCardLeft}>
                  <View style={[styles.hCardIcon, { backgroundColor: item.is_active !== false ? '#10B98120' : '#EF444420' }]}>
                    <ArrowUpCircle size={20} color={item.is_active !== false ? '#10B981' : '#EF4444'} />
                  </View>
                  <View>
                    <Text style={styles.hCardName}>{item.name}</Text>
                    {item.description && <Text style={styles.hCardDesc}>{item.description}</Text>}
                  </View>
                </View>
                {isAdmin && (
                  <TouchableOpacity onPress={() => handleDelete(item)} style={{ padding: 8 }}>
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
              {/* Levels preview */}
              {item.levels && item.levels.length > 0 && (
                <View style={styles.levelsPreview}>
                  {item.levels.slice(0, 4).map((lvl, i) => (
                    <View key={lvl.id || i} style={styles.levelPreview}>
                      <View style={[styles.levelDot, { backgroundColor: ['#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'][i % 4] }]} />
                      <Text style={styles.levelPreviewText}>
                        {lvl.employee?.full_name || 'Unassigned'} · {formatResponseTime(lvl.escalation_time_minutes)}
                      </Text>
                    </View>
                  ))}
                  {item.levels.length > 4 && (
                    <Text style={styles.levelMoreText}>+{item.levels.length - 4} more</Text>
                  )}
                </View>
              )}
            </SafeBlurView>
          </TouchableOpacity>
        )}
      />

      {/* FAB */}
      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => { setFormName(''); setFormDescription(''); setFormLevels([{ employee_id: '', escalation_time_minutes: 30 }]); setShowCreateModal(true); }}>
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalSheet, { backgroundColor: '#1E293B' }]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Escalation Hierarchy</Text>
                <TouchableOpacity onPress={() => setShowCreateModal(false)}><X size={20} color="#94A3B8" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: '70%' }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <Text style={styles.inputLabel}>NAME *</Text>
                <TextInput style={styles.input} placeholder="e.g. Critical Ticket Escalation" placeholderTextColor="#64748B" value={formName} onChangeText={setFormName} />
                <Text style={styles.inputLabel}>DESCRIPTION</Text>
                <TextInput style={[styles.input, { height: 60 }]} placeholder="Optional description" placeholderTextColor="#64748B" value={formDescription} onChangeText={setFormDescription} multiline />
                <Text style={[styles.inputLabel, { marginTop: 12 }]}>LEVELS</Text>
                {formLevels.map((lvl, i) => (
                  <View key={i} style={styles.formLevel}>
                    <View style={styles.formLevelHeader}>
                      <Text style={styles.formLevelNum}>Level {i + 1}</Text>
                      {formLevels.length > 1 && (
                        <TouchableOpacity onPress={() => setFormLevels((p) => p.filter((_, j) => j !== i))}>
                          <X size={16} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.userPickerRow}>
                      <Users size={14} color="#708F96" />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                        {users.map((u) => (
                          <TouchableOpacity key={u.id} style={[styles.userChip, lvl.employee_id === u.id && styles.userChipActive]} onPress={() => setFormLevels((p) => p.map((l, j) => j === i ? { ...l, employee_id: u.id } : l))}>
                            <Text style={[styles.userChipText, lvl.employee_id === u.id && styles.userChipTextActive]}>{u.full_name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={styles.timeRow}>
                      <Clock size={14} color="#708F96" />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 8 }}>
                        {TIME_OPTIONS.map((t) => (
                          <TouchableOpacity key={t} style={[styles.timeChip, lvl.escalation_time_minutes === t && styles.timeChipActive]} onPress={() => setFormLevels((p) => p.map((l, j) => j === i ? { ...l, escalation_time_minutes: t } : l))}>
                            <Text style={[styles.timeChipText, lvl.escalation_time_minutes === t && styles.timeChipTextActive]}>{formatResponseTime(t)}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.addLevelBtn} onPress={() => setFormLevels((p) => [...p, { employee_id: '', escalation_time_minutes: 30 }])}>
                  <Plus size={16} color="#708F96" /><Text style={styles.addLevelText}>Add Level</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { opacity: isSaving ? 0.6 : 1 }]} onPress={handleCreate} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color="#FFF" size="small" /> : <><Save size={18} color="#FFF" /><Text style={styles.submitText}>Create Hierarchy</Text></>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalSheet, { backgroundColor: '#1E293B' }]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Hierarchy</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}><X size={20} color="#94A3B8" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: '70%' }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <Text style={styles.inputLabel}>NAME *</Text>
                <TextInput style={styles.input} placeholder="Hierarchy name" placeholderTextColor="#64748B" value={formName} onChangeText={setFormName} />
                <Text style={styles.inputLabel}>DESCRIPTION</Text>
                <TextInput style={[styles.input, { height: 60 }]} placeholder="Optional" placeholderTextColor="#64748B" value={formDescription} onChangeText={setFormDescription} multiline />
                <Text style={[styles.inputLabel, { marginTop: 12 }]}>LEVELS</Text>
                {formLevels.map((lvl, i) => (
                  <View key={i} style={styles.formLevel}>
                    <View style={styles.formLevelHeader}>
                      <Text style={styles.formLevelNum}>Level {i + 1}</Text>
                      {formLevels.length > 1 && (
                        <TouchableOpacity onPress={() => setFormLevels((p) => p.filter((_, j) => j !== i))}>
                          <X size={16} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.userPickerRow}>
                      <Users size={14} color="#708F96" />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                        {users.map((u) => (
                          <TouchableOpacity key={u.id} style={[styles.userChip, lvl.employee_id === u.id && styles.userChipActive]} onPress={() => setFormLevels((p) => p.map((l, j) => j === i ? { ...l, employee_id: u.id } : l))}>
                            <Text style={[styles.userChipText, lvl.employee_id === u.id && styles.userChipTextActive]}>{u.full_name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={styles.timeRow}>
                      <Clock size={14} color="#708F96" />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 8 }}>
                        {TIME_OPTIONS.map((t) => (
                          <TouchableOpacity key={t} style={[styles.timeChip, lvl.escalation_time_minutes === t && styles.timeChipActive]} onPress={() => setFormLevels((p) => p.map((l, j) => j === i ? { ...l, escalation_time_minutes: t } : l))}>
                            <Text style={[styles.timeChipText, lvl.escalation_time_minutes === t && styles.timeChipTextActive]}>{formatResponseTime(t)}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.addLevelBtn} onPress={() => setFormLevels((p) => [...p, { employee_id: '', escalation_time_minutes: 30 }])}>
                  <Plus size={16} color="#708F96" /><Text style={styles.addLevelText}>Add Level</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { opacity: isSaving ? 0.6 : 1 }]} onPress={handleUpdate} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color="#FFF" size="small" /> : <><Save size={18} color="#FFF" /><Text style={styles.submitText}>Update Hierarchy</Text></>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontFamily: 'Urbanist-Medium' },
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.12)', zIndex: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  headerSub: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  statCard: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  statIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 20, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  statLabel: { fontSize: 11, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 2 },
  listContent: { padding: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins-Bold', color: '#FFFFFF', marginTop: 16 },
  emptySub: { fontSize: 14, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 4 },
  hCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  hCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  hCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  hCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hCardName: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  hCardDesc: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 2 },
  levelsPreview: { paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  levelPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelPreviewText: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  levelMoreText: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#64748B' },
  fab: { position: 'absolute', bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#708F96', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#475569', alignSelf: 'center', marginTop: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { fontSize: 18, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  inputLabel: { fontSize: 12, fontFamily: 'Urbanist-SemiBold', color: '#94A3B8', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 12, color: '#FFFFFF', fontFamily: 'Urbanist-Medium' },
  formLevel: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginBottom: 10 },
  formLevelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  formLevelNum: { fontSize: 14, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  userPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  userChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 6 },
  userChipActive: { backgroundColor: '#708F96' },
  userChipText: { fontSize: 12, fontFamily: 'Urbanist-SemiBold', color: '#94A3B8' },
  userChipTextActive: { color: '#FFFFFF' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 6 },
  timeChipActive: { backgroundColor: '#F59E0B' },
  timeChipText: { fontSize: 12, fontFamily: 'Urbanist-SemiBold', color: '#94A3B8' },
  timeChipTextActive: { color: '#FFFFFF' },
  addLevelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, borderStyle: 'dashed', marginTop: 8 },
  addLevelText: { fontSize: 14, fontFamily: 'Urbanist-SemiBold', color: '#708F96' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#708F96', borderRadius: 12, paddingVertical: 16, marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  // unused
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  levelLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  levelNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  levelNumText: { fontSize: 12, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  levelContent: { flex: 1 },
  userPicker: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  userPickerText: { flex: 1, fontSize: 13, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  removeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center' },
});
