// @ts-nocheck
/**
 * Notification Test Panel
 *
 * Debug component to test push notification registration and sending.
 * Add this to any screen to test notifications.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/lib/serverApi';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface NotificationTestPanelProps {
  visible?: boolean;
  onClose?: () => void;
}

export default function NotificationTestPanel({ visible = true, onClose }: NotificationTestPanelProps) {
  const { user, membership } = useAuth();
  const { register, lastTappedNotification } = usePushNotifications();
  const [loading, setLoading] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setDebugLogs(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev.slice(0, 9)]);
  };

  const testTokenRegistration = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not logged in');
      return;
    }

    setLoading(true);
    addLog('Starting token registration...');

    try {
      await register();
      addLog('Token registration complete');
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user?.id, register]);

  const testSendNotification = useCallback(async () => {
    if (!user?.id || !membership?.org_id) {
      Alert.alert('Error', 'User not logged in or no organization');
      return;
    }

    setLoading(true);
    addLog('Sending test notification...');

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_MOBILE_SERVER_URL || 'http://localhost:3001'}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          type: 'test',
          title: 'Test Notification',
          message: 'This is a test push notification from Autopilot!',
          deepLink: '/dashboard',
          priority: 'HIGH',
        }),
      });

      const result = await response.json();
      if (response.ok) {
        addLog(`✅ Notification sent! Created: ${result.notificationsCreated}, Sent: ${result.pushNotificationsSent}`);
        Alert.alert('Success', `Notification sent!\nCreated: ${result.notificationsCreated}\nPush Sent: ${result.pushNotificationsSent}`);
      } else {
        addLog(`❌ Error: ${result.error}`);
        Alert.alert('Error', result.error);
      }
    } catch (err: any) {
      addLog(`❌ Network Error: ${err.message}`);
      Alert.alert('Network Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id, membership?.org_id]);

  const checkPushToken = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    addLog('Checking push tokens...');

    try {
      const { data, error } = await serverApi.query<{ token: string; device_info: string; is_active: boolean }[]>({
        table: 'push_tokens',
        action: 'select',
        select: 'token, device_info, is_active',
        filters: [{ column: 'user_id', op: 'eq', value: user.id }],
      });

      if (error) {
        addLog(`❌ Query Error: ${error.message}`);
      } else if (!data?.length) {
        addLog('❌ No push tokens found for this user');
      } else {
        addLog(`✅ Found ${data.length} push token(s)`);
        data.forEach((t, i) => {
          addLog(`  Token ${i + 1}: ${t.is_active ? '✅' : '❌'} ${t.device_info || 'unknown device'}`);
        });
      }
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔔 Notification Test Panel</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.info}>
          <Text style={styles.infoText}>User ID: {user?.id?.substring(0, 8)}...</Text>
          <Text style={styles.infoText}>Org ID: {membership?.org_id?.substring(0, 8)}...</Text>
          {lastTappedNotification && (
            <Text style={styles.infoText}>Last Tapped: {lastTappedNotification.title}</Text>
          )}
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={testTokenRegistration}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>1️⃣ Register FCM Token</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={checkPushToken}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>2️⃣ Check Stored Tokens</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.successButton]}
            onPress={testSendNotification}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>3️⃣ Send Test Notification</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.logsContainer}>
          <Text style={styles.logsTitle}>📋 Debug Logs</Text>
          {debugLogs.length === 0 ? (
            <Text style={styles.logsEmpty}>No logs yet. Tap a button above to start.</Text>
          ) : (
            debugLogs.map((log, i) => (
              <Text key={i} style={styles.logText}>{log}</Text>
            ))
          )}
        </View>

        <View style={styles.tips}>
          <Text style={styles.tipsTitle}>💡 Tips:</Text>
          <Text style={styles.tipText}>• Make sure you're using a physical device (not simulator)</Text>
          <Text style={styles.tipText}>• Use a development build, not Expo Go</Text>
          <Text style={styles.tipText}>• Check the console for [Push] logs</Text>
          <Text style={styles.tipText}>• FCM requires Google Play Services</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    margin: 16,
    overflow: 'hidden',
    maxHeight: 500,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#16213e',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  content: {
    padding: 16,
  },
  info: {
    backgroundColor: '#0f3460',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    color: '#e94560',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  buttonGroup: {
    gap: 8,
  },
  button: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  secondaryButton: {
    backgroundColor: '#8b5cf6',
  },
  successButton: {
    backgroundColor: '#10b981',
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  logsContainer: {
    marginTop: 16,
    backgroundColor: '#0f3460',
    padding: 12,
    borderRadius: 8,
  },
  logsTitle: {
    color: '#FFF',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  logsEmpty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  logText: {
    color: '#4ade80',
    fontSize: 11,
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  tips: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  tipsTitle: {
    color: '#fbbf24',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginVertical: 2,
  },
});