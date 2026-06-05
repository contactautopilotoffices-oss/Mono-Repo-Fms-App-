/**
 * HostAutoComplete - Search users from property_memberships for visitor check-in host selection
 * Uses same schema as web app
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { serverApi } from '@/lib/serverApi';

interface Host {
  user_id: string;
  full_name: string;
  email?: string;
  role: string;
}

interface Props {
  propertyId: string;
  value: string;
  onSelect: (userId: string, fullName: string) => void;
  placeholder?: string;
}

export default function HostAutoComplete({ propertyId, value, onSelect, placeholder = 'Search staff/tenant...' }: Props) {
  const [query, setQuery] = useState(value || '');
  const [allHosts, setAllHosts] = useState<Host[]>([]);
  const [filteredHosts, setFilteredHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => { setQuery(value); }, [value]);

  // Load ALL hosts once per property
  const loadAllHosts = async () => {
    if (loadedRef.current && allHosts.length > 0) return;
    setLoading(true);
    try {
      const res = await serverApi.query<{ user_id: string; role: string; users: any }[]>({
        table: 'property_memberships',
        action: 'select',
        select: 'user_id, role, users(full_name, email)',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'eq', column: 'is_active', value: true },
        ],
      });

      if (res.data) {
        const mapped = res.data
          .map(m => ({
            user_id: m.user_id,
            full_name: m.users?.full_name || 'Unknown',
            email: m.users?.email,
            role: m.role,
          }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
          .slice(0, 50);
        setAllHosts(mapped);
        setFilteredHosts(mapped);
        loadedRef.current = true;
      }
    } catch (e) { console.error('[HostAutoComplete]', e); }
    finally { setLoading(false); }
  };

  const handleFocus = () => {
    setShowDropdown(true);
    loadAllHosts();
  };

  // Filter locally as user types (no debounce needed for client-side filter)
  useEffect(() => {
    if (query.length === 0) {
      setFilteredHosts(allHosts);
    } else {
      const lq = query.toLowerCase();
      setFilteredHosts(
        allHosts.filter(h => h.full_name.toLowerCase().includes(lq))
      );
    }
  }, [query, allHosts]);

  const handleSelect = (h: Host) => {
    setQuery(h.full_name);
    onSelect(h.user_id, h.full_name);
    setShowDropdown(false);
    Keyboard.dismiss();
  };

  const roleColor = (r: string) => {
    if (r.includes('admin')) return '#8B5CF6';
    if (r.includes('tenant')) return '#10B981';
    if (r.includes('manager')) return '#F59E0B';
    if (r.includes('staff')) return '#3B82F6';
    return '#64748B';
  };

  const initials = (n: string) => n.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={s.container}>
      <View style={s.inputRow}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          onFocus={handleFocus}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        />
        {loading && <ActivityIndicator size="small" color="#3B82F6" />}
      </View>

      {showDropdown && filteredHosts.length > 0 && (
        <View style={s.dropdown}>
          <FlatList
            data={filteredHosts}
            keyExtractor={h => h.user_id}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.item} onPress={() => handleSelect(item)}>
                <View style={[s.avatar, { backgroundColor: roleColor(item.role) + '20' }]}>
                  <Text style={[s.avatarTxt, { color: roleColor(item.role) }]}>
                    {initials(item.full_name)}
                  </Text>
                </View>
                <View style={s.info}>
                  <Text style={s.name}>{item.full_name}</Text>
                  <Text style={[s.role, { color: roleColor(item.role) }]}>
                    {item.role.replace(/_/g, ' ')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={s.sep} />}
          />
        </View>
      )}

      {showDropdown && filteredHosts.length === 0 && !loading && (
        <View style={s.dropdown}>
          <Text style={s.noResults}>No hosts found</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { zIndex: 100 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  input: { flex: 1, fontSize: 15, color: '#FFF' },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: 'rgba(30,30,30,0.98)', borderRadius: 12,
    marginTop: 4, maxHeight: 200, zIndex: 1000,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  item: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontWeight: '700', fontSize: 12 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  role: { fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 12 },
  noResults: { padding: 16, textAlign: 'center', color: '#94A3B8' },
});
