'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/utils/supabase/client';
import { GlassTile } from './DashboardComponents';
import WeatherBackground from './WeatherBackground';
import GlobalNavigationDrawer from '@/components/shared/GlobalNavigationDrawer';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

interface VendorProfile {
  id: string;
  shop_name: string;
  owner_name: string | null;
  commission_rate: number;
  property_id: string;
}

interface CommissionCycle {
  id: string;
  cycle_number: number;
  cycle_start: string;
  cycle_end: string;
  total_revenue: number;
  commission_due: number;
  status: string;
}

export default function FoodVendorDashboard({ propertyId }: { propertyId?: string }) {
  const { user } = useAuth();
  const supabase = createClient();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  
  const [revenue, setRevenue] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [currentCycle, setCurrentCycle] = useState<CommissionCycle | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  
  const [showDrawer, setShowDrawer] = useState(false);

  useEffect(() => {
    if (user) {
      fetchVendors();
    }
  }, [user]);

  useEffect(() => {
    if (activeShopId && vendor) {
      fetchShopData(vendor);
    }
  }, [activeShopId, vendor]);

  const fetchVendors = async () => {
    try {
      const { data: vendorsData, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user?.id)
        .order('shop_name', { ascending: true });

      if (error) throw error;

      if (vendorsData && vendorsData.length > 0) {
        setVendors(vendorsData);
        if (!activeShopId || !vendorsData.find(v => v.id === activeShopId)) {
          setActiveShopId(vendorsData[0].id);
          setVendor(vendorsData[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching vendors:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchShopData = async (activeVendor: VendorProfile) => {
    try {
      // Fetch cycle
      const { data: cycleData } = await supabase
        .from('commission_cycles')
        .select('*')
        .eq('vendor_id', activeVendor.id)
        .eq('status', 'in_progress')
        .maybeSingle();

      setCurrentCycle(cycleData);

      // Fetch history
      const { data: historyData } = await supabase
        .from('vendor_daily_revenue')
        .select('*')
        .eq('vendor_id', activeVendor.id)
        .order('entry_date', { ascending: false })
        .limit(30);

      setHistory(historyData || []);
    } catch (err) {
      console.error('Error fetching shop data:', err);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchVendors();
  }, []);

  const handleSubmitRevenue = async () => {
    if (!revenue || isNaN(Number(revenue)) || Number(revenue) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid revenue amount.');
      return;
    }
    
    if (!vendor) return;

    setSubmitting(true);
    try {
      // Direct supabase insert for mobile (could use serverApi as well)
      // We will check if it already exists
      const { data: existing } = await supabase
        .from('vendor_daily_revenue')
        .select('id')
        .eq('vendor_id', vendor.id)
        .eq('entry_date', entryDate)
        .maybeSingle();
        
      if (existing) {
        Alert.alert('Already Submitted', `Revenue for ${new Date(entryDate).toLocaleDateString()} has already been recorded.`);
        setSubmitting(false);
        return;
      }

      const { error } = await supabase
        .from('vendor_daily_revenue')
        .insert({
          vendor_id: vendor.id,
          revenue_amount: Number(revenue),
          revenue_date: entryDate,
          entry_date: entryDate,
          status: 'recorded'
        });

      if (error) throw error;
      
      Alert.alert('Success', 'Revenue recorded successfully!');
      setRevenue('');
      fetchShopData(vendor);
      
    } catch (err) {
      console.error('Submit error:', err);
      Alert.alert('Error', 'Failed to record revenue.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WeatherBackground condition="clear" />
      
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => setShowDrawer(true)} style={styles.menuBtn}>
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.greeting}>Food Vendor</Text>
            <Text style={styles.shopName}>{vendor?.shop_name || 'No Shop Found'}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >
        <Animated.View entering={FadeInUp.delay(100).springify()}>
          <GlassTile style={styles.entryCard}>
            <Text style={styles.cardTitle}>Record Today's Revenue</Text>
            <Text style={styles.cardSubtitle}>
              {new Date(entryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.revenueInput}
                value={revenue}
                onChangeText={setRevenue}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#ffffff50"
              />
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]} 
              onPress={handleSubmitRevenue}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Revenue</Text>
              )}
            </TouchableOpacity>
          </GlassTile>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).springify()}>
          <GlassTile style={styles.cycleCard}>
            <View style={styles.cycleHeader}>
              <Ionicons name="calendar-outline" size={20} color="#60A5FA" />
              <Text style={styles.cycleTitle}>Current Commission Cycle</Text>
            </View>
            
            {currentCycle ? (
              <View style={styles.cycleStats}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Total Revenue</Text>
                  <Text style={styles.statValue}>₹{currentCycle.total_revenue.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Commission ({vendor?.commission_rate}%)</Text>
                  <Text style={[styles.statValue, { color: '#F87171' }]}>
                    ₹{currentCycle.commission_due.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noCycleText}>No active cycle</Text>
            )}
          </GlassTile>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).springify()}>
          <Text style={styles.historySectionTitle}>Recent Entries</Text>
          {history.length > 0 ? (
            history.map((entry, idx) => (
              <GlassTile key={entry.id || idx} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <View style={styles.historyIcon}>
                    <Ionicons name="receipt-outline" size={20} color="#fff" />
                  </View>
                  <View>
                    <Text style={styles.historyDate}>
                      {new Date(entry.entry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                    <Text style={styles.historyStatus}>{entry.status || 'recorded'}</Text>
                  </View>
                </View>
                <Text style={styles.historyAmount}>
                  ₹{entry.revenue_amount.toLocaleString('en-IN')}
                </Text>
              </GlassTile>
            ))
          ) : (
            <Text style={styles.noHistoryText}>No recent revenue entries.</Text>
          )}
        </Animated.View>
        
        <View style={{ height: 100 }} />
      </ScrollView>

      <GlobalNavigationDrawer 
        visible={showDrawer} 
        onClose={() => setShowDrawer(false)} 
        propertyId={propertyId} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#07090e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  shopName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  entryCard: {
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  currencySymbol: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
    marginRight: 10,
  },
  revenueInput: {
    flex: 1,
    color: '#fff',
    fontSize: 40,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  cycleCard: {
    padding: 20,
    marginBottom: 24,
  },
  cycleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cycleTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cycleStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
  },
  noCycleText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontStyle: 'italic',
  },
  historySectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    marginLeft: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyDate: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyStatus: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  historyAmount: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  noHistoryText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  }
});
