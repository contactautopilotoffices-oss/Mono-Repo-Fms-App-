// @ts-nocheck
'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import { useGlobalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { procurementService, MaterialRequest, ProcurementActivityLog } from '@/services/procurementService';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { LinearGradient } from 'expo-linear-gradient';

type Tab = 'overview' | 'requests' | 'history';

export default function ProcurementDashboard() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { membership } = useAuth();

  const isProcurementRole = useMemo(() => {
    const prop = membership?.properties?.find(p => p.id === propertyId);
    return prop?.role === 'procurement' || membership?.org_role === 'procurement';
  }, [membership, propertyId]);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [logs, setLogs] = useState<ProcurementActivityLog[]>([]);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reqData, logData] = await Promise.all([
        procurementService.fetchRequests(propertyId as string),
        procurementService.fetchLogs(propertyId as string),
      ]);
      setRequests(reqData);
      setLogs(logData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (propertyId && propertyId !== 'undefined') {
      fetchData();
    }
  }, [propertyId]);

  const stats = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter(r => r.status === 'pending_quotation' || r.status === 'pending').length,
      ordered: requests.filter(r => r.status === 'ordered').length,
      delivered: requests.filter(r => r.status === 'delivered').length,
    };
  }, [requests]);

  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const cardBg = isDark ? 'rgba(30,41,59,0.5)' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0A0D14' : '#F8FAFC' }]}>
      <View style={[styles.header, { borderBottomColor: borderColor, backgroundColor: isDark ? '#0A0D14' : '#FFF' }]}>
        <Text style={[styles.title, { color: textColor }]}>Procurement</Text>
        <TouchableOpacity onPress={fetchData}>
          <Ionicons name="refresh" size={20} color={subtextColor} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {(['overview', 'requests', 'history'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && styles.activeTab,
              { borderBottomColor: activeTab === tab ? '#7CB9A8' : 'transparent' }
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === tab ? '#7CB9A8' : subtextColor }
            ]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7CB9A8" />
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {activeTab === 'overview' && (
            <View style={styles.grid}>
              <SafeBlurView intensity={isDark ? 30 : 60} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor }]}>
                <View style={styles.cardIconBg}><Ionicons name="document-text" size={20} color="#7CB9A8" /></View>
                <Text style={[styles.cardValue, { color: textColor }]}>{stats.total}</Text>
                <Text style={[styles.cardLabel, { color: subtextColor }]}>TOTAL REQUESTS</Text>
              </SafeBlurView>
              <SafeBlurView intensity={isDark ? 30 : 60} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor }]}>
                <View style={styles.cardIconBg}><Ionicons name="time" size={20} color="#F59E0B" /></View>
                <Text style={[styles.cardValue, { color: textColor }]}>{stats.pending}</Text>
                <Text style={[styles.cardLabel, { color: subtextColor }]}>PENDING</Text>
              </SafeBlurView>
              <SafeBlurView intensity={isDark ? 30 : 60} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor }]}>
                <View style={styles.cardIconBg}><Ionicons name="cube" size={20} color="#3B82F6" /></View>
                <Text style={[styles.cardValue, { color: textColor }]}>{stats.ordered}</Text>
                <Text style={[styles.cardLabel, { color: subtextColor }]}>ORDERED</Text>
              </SafeBlurView>
              <SafeBlurView intensity={isDark ? 30 : 60} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor }]}>
                <View style={styles.cardIconBg}><Ionicons name="checkmark-circle" size={20} color="#10B981" /></View>
                <Text style={[styles.cardValue, { color: textColor }]}>{stats.delivered}</Text>
                <Text style={[styles.cardLabel, { color: subtextColor }]}>DELIVERED</Text>
              </SafeBlurView>
            </View>
          )}

          {activeTab === 'requests' && (
            <View>
              {requests.map(req => {
                const isExpanded = expandedRequestId === req.id;
                return (
                  <TouchableOpacity
                    key={req.id}
                    activeOpacity={0.8}
                    onPress={() => setExpandedRequestId(isExpanded ? null : req.id)}
                  >
                    <SafeBlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={[styles.requestCard, { borderColor }]}>
                      <View style={styles.reqHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.ticketNo, { color: textColor }]}>{req.ticket?.ticket_number || 'REQ'}</Text>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={subtextColor} style={{ marginLeft: 6 }} />
                        </View>
                        <View style={[styles.badge, { backgroundColor: req.status === 'delivered' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }]}>
                          <Text style={[styles.badgeText, { color: req.status === 'delivered' ? '#10B981' : '#F59E0B' }]}>{req.status.toUpperCase()}</Text>
                        </View>
                      </View>
                      <View style={styles.reqBody}>
                        <Text style={[styles.reqAssignee, { color: subtextColor }]}>{req.assignee?.full_name || 'Unassigned'}</Text>
                        <Text style={[styles.reqDate, { color: subtextColor }]}>{new Date(req.created_at).toLocaleDateString()}</Text>
                      </View>
                      
                      {isExpanded && (
                        <View style={styles.expandedContent}>
                          <View style={styles.divider} />

                          <View style={styles.detailSection}>
                            <Text style={[styles.detailTitle, { color: textColor }]}>Request Details</Text>
                            <Text style={[styles.detailText, { color: subtextColor }]}>
                              <Text style={{ fontWeight: 'bold' }}>Property: </Text>{req.property?.name || 'Unknown'}{'\n'}
                              <Text style={{ fontWeight: 'bold' }}>Requested By: </Text>{req.requester?.full_name || 'Unknown'}{'\n'}
                              <Text style={{ fontWeight: 'bold' }}>Ticket Desc: </Text>{req.ticket?.description || 'No description provided'}
                            </Text>
                          </View>

                          {req.items && req.items.length > 0 && (
                            <View style={styles.detailSection}>
                              <Text style={[styles.detailTitle, { color: textColor }]}>Items Requested:</Text>
                              {req.items.map((item, idx) => (
                                <View key={idx} style={styles.itemRow}>
                                  <Text style={[styles.itemName, { color: subtextColor }]}>• {item.name || 'Item'}</Text>
                                  <Text style={[styles.itemQty, { color: textColor }]}>{item.quantity} {item.unit || 'pcs'}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                          {(req.total_estimated_cost || req.total_amount) ? (
                            <View style={styles.detailSection}>
                              <Text style={[styles.detailTitle, { color: textColor }]}>Cost / Amount:</Text>
                              <Text style={[styles.detailText, { color: '#10B981', fontWeight: 'bold' }]}>
                                ₹{(req.total_amount || req.total_estimated_cost || 0).toLocaleString('en-IN')}
                              </Text>
                            </View>
                          ) : null}
                          {req.notes && (
                            <View style={styles.detailSection}>
                              <Text style={[styles.detailTitle, { color: textColor }]}>Notes:</Text>
                              <Text style={[styles.detailText, { color: subtextColor }]}>{req.notes}</Text>
                            </View>
                          )}
                          <View style={styles.actionButtons}>
                            <TouchableOpacity 
                              style={[styles.actionBtnPrimary, { backgroundColor: isDark ? '#475569' : '#E2E8F0', marginRight: 8 }]} 
                              onPress={() => router.push(`/property/${req.property?.id || propertyId}/tickets/${req.ticket_id}`)}
                            >
                              <Text style={[styles.actionBtnText, { color: textColor }]}>View Ticket</Text>
                            </TouchableOpacity>
                            {isProcurementRole && (
                              <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => {}}>
                                <Text style={styles.actionBtnText}>Update Status</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      )}
                    </SafeBlurView>
                  </TouchableOpacity>
                );
              })}
              {requests.length === 0 && <Text style={{ color: subtextColor, textAlign: 'center', marginTop: 20 }}>No active orders.</Text>}
            </View>
          )}

          {activeTab === 'history' && (
            <View>
              {logs.map(log => (
                <View key={log.id} style={styles.logRow}>
                  <Ionicons name="ellipse" size={8} color="#7CB9A8" style={{ marginTop: 6, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logAction, { color: textColor }]}>{log.action.replace(/_/g, ' ')}</Text>
                    <Text style={[styles.logMeta, { color: subtextColor }]}>{log.user?.full_name || 'System'} • {new Date(log.created_at).toLocaleString()}</Text>
                  </View>
                </View>
              ))}
              {logs.length === 0 && <Text style={{ color: subtextColor, textAlign: 'center', marginTop: 20 }}>No history.</Text>}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: '800' },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tab: {
    paddingVertical: 12,
    marginRight: 24,
    borderBottomWidth: 2,
  },
  activeTab: {
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  contentContainer: { padding: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between'
  },
  card: {
    width: '48%',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 12,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  requestCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  reqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketNo: { fontSize: 14, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  reqBody: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  reqAssignee: { fontSize: 13 },
  reqDate: { fontSize: 13 },
  expandedContent: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(150,150,150,0.2)',
    marginBottom: 12,
  },
  detailSection: {
    marginBottom: 10,
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  itemName: { fontSize: 13 },
  itemQty: { fontSize: 13, fontWeight: '600' },
  detailText: { fontSize: 14 },
  actionButtons: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  actionBtnPrimary: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  logAction: { fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  logMeta: { fontSize: 11, marginTop: 4 },
});
