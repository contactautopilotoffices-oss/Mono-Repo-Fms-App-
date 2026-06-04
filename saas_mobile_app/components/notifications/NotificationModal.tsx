import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { apiFetch } from '@/utils/api/mobileApi';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  role?: string;
}

type TabKey = 'notifications' | 'pending';

export default function NotificationModal({ visible, onClose, propertyId, role }: Props) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('notifications');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && user) {
      fetchNotifications();
    }
  }, [visible, user]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{ success: boolean; data: any[] }>('/api/users/notifications');
      if (!response.success || !response.data) {
        setNotifications([]);
      } else {
        setNotifications(response.data);
      }
    } catch (e) {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getIconName = (type?: string) => {
    switch (type) {
      case 'TICKET_CREATED':
      case 'ticket_assigned': return 'time';
      case 'TICKET_ESCALATED':
      case 'sla_warning': return 'timer';
      case 'visitor_arrived': return 'person';
      default: return 'notifications';
    }
  };

  const getIconColor = (type?: string) => {
    switch (type) {
      case 'TICKET_CREATED':
      case 'ticket_assigned': return '#3B82F6';
      case 'TICKET_ESCALATED':
      case 'sla_warning': return '#F59E0B';
      case 'visitor_arrived': return '#10B981';
      default: return '#708F96';
    }
  };

  const formatNotificationTime = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffMs = today.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleNotificationPress = (item: any) => {
    if (item.ticket_id) {
      router.push(`/property/${propertyId}/tickets/${item.ticket_id}`);
      onClose();
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.notificationItem}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${getIconColor(item.type)}20` }]}>
        <Ionicons name={getIconName(item.type)} size={20} color={getIconColor(item.type)} />
      </View>
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <Text style={styles.notificationTitle} numberOfLines={1}>{item.title}</Text>
          {!item.is_read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.notificationBody} numberOfLines={2}>{item.body || item.message}</Text>
        <Text style={styles.notificationTime}>{formatNotificationTime(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        <BlurView intensity={Platform.OS === 'ios' ? 20 : 15} tint="dark" style={styles.blurView}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 10 }]}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Notifications</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <ActivityIndicator size="large" color="#708F96" style={styles.loader} />
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="notifications-outline" size={48} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyText}>No notifications yet</Text>
                  </View>
                }
              />
            )}
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  blurView: { flex: 1 },
  modalContent: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  closeButton: { padding: 8 },
  loader: { flex: 1, justifyContent: 'center' },
  listContent: { paddingBottom: 100 },
  notificationItem: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, marginBottom: 10 },
  iconContainer: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notificationContent: { flex: 1 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  notificationTitle: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6', marginLeft: 8 },
  notificationBody: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 18, marginBottom: 6 },
  notificationTime: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { fontSize: 16, color: 'rgba(255,255,255,0.3)', marginTop: 12 },
});
