/**
 * Debug Notification Test Screen
 *
 * Add this to your app/_layout or access via a hidden route for testing.
 * Route: /debug/notifications
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { sendPushNotification, NOTIFICATION_TYPES } from '@/services/notificationService';

export default function NotificationTestScreen() {
  const insets = useSafeAreaInsets();
  const { user, membership } = useAuth();
  const { register, lastTappedNotification } = usePushNotifications();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  const clearLogs = () => setLogs([]);

  // Test 1: Register FCM Token
  const testTokenRegistration = async () => {
    if (!user?.id) {
      addLog('❌ User not logged in');
      return;
    }

    setLoading(true);
    addLog('🔄 Starting FCM token registration...');

    try {
      await register();
      addLog('✅ Token registration complete - check console for details');
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Test 2: Send Ticket Notification
  const testTicketNotification = async () => {
    if (!user?.id || !membership?.properties?.[0]?.id) {
      addLog('❌ User or property not available');
      return;
    }

    setLoading(true);
    addLog('🔄 Sending ticket notification...');

    try {
      const result = await sendPushNotification({
        userId: user.id,
        propertyId: membership.properties[0].id,
        type: NOTIFICATION_TYPES.TICKET_CREATED,
        title: '🔔 Test Ticket',
        message: 'This is a test notification from the mobile app!',
        deepLink: '/dashboard',
        priority: 'HIGH',
      });

      if (result.success) {
        addLog(`✅ Notification sent! Created: ${result.notificationsCreated}, Pushed: ${result.pushNotificationsSent}`);
      } else {
        addLog(`❌ Error: ${result.error}`);
      }
    } catch (err: any) {
      addLog(`❌ Network Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Test 3: Send Visitor Notification
  const testVisitorNotification = async () => {
    if (!user?.id || !membership?.properties?.[0]?.id) {
      addLog('❌ User or property not available');
      return;
    }

    setLoading(true);
    addLog('🔄 Sending visitor notification...');

    try {
      const result = await sendPushNotification({
        userId: user.id,
        propertyId: membership.properties[0].id,
        type: NOTIFICATION_TYPES.VISITOR_CHECKIN,
        title: '👤 Visitor Arrived',
        message: 'John Doe has checked in at the reception',
        deepLink: '/visitors',
        priority: 'NORMAL',
      });

      if (result.success) {
        addLog(`✅ Visitor notification sent!`);
      } else {
        addLog(`❌ Error: ${result.error}`);
      }
    } catch (err: any) {
      addLog(`❌ Network Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Test 4: Send PPM Notification
  const testPPMNotification = async () => {
    if (!user?.id || !membership?.properties?.[0]?.id) {
      addLog('❌ User or property not available');
      return;
    }

    setLoading(true);
    addLog('🔄 Sending PPM notification...');

    try {
      const result = await sendPushNotification({
        userId: user.id,
        propertyId: membership.properties[0].id,
        type: NOTIFICATION_TYPES.PPM_DUE,
        title: '🔧 PPM Due Today',
        message: 'AC Maintenance scheduled for today at 2 PM',
        deepLink: '/ppm',
        priority: 'NORMAL',
      });

      if (result.success) {
        addLog(`✅ PPM notification sent!`);
      } else {
        addLog(`❌ Error: ${result.error}`);
      }
    } catch (err: any) {
      addLog(`❌ Network Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Show last tapped notification
  useEffect(() => {
    if (lastTappedNotification) {
      addLog(`👆 Last tapped: ${lastTappedNotification.title}`);
    }
  }, [lastTappedNotification]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔔 Notification Test</Text>
        <TouchableOpacity onPress={clearLogs}>
          <Ionicons name="trash-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* User Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Current User</Text>
          <Text style={styles.infoText}>User ID: {user?.id || 'Not logged in'}</Text>
          <Text style={styles.infoText}>Property: {membership?.properties?.[0]?.id || 'No property'}</Text>
          <Text style={styles.infoText}>Role: {membership?.properties?.[0]?.role || 'Unknown'}</Text>
        </View>

        {/* Test Buttons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test Actions</Text>

          <TouchableOpacity
            style={[styles.button, styles.primaryBtn]}
            onPress={testTokenRegistration}
            disabled={loading}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="#FFF" />
            <Text style={styles.buttonText}>Register FCM Token</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.ticketBtn]}
            onPress={testTicketNotification}
            disabled={loading}
          >
            <Ionicons name="ticket-outline" size={20} color="#FFF" />
            <Text style={styles.buttonText}>Send Ticket Notification</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.visitorBtn]}
            onPress={testVisitorNotification}
            disabled={loading}
          >
            <Ionicons name="person-outline" size={20} color="#FFF" />
            <Text style={styles.buttonText}>Send Visitor Notification</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.ppmBtn]}
            onPress={testPPMNotification}
            disabled={loading}
          >
            <Ionicons name="construct-outline" size={20} color="#FFF" />
            <Text style={styles.buttonText}>Send PPM Notification</Text>
          </TouchableOpacity>
        </View>

        {/* Logs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Debug Logs</Text>
          <View style={styles.logsBox}>
            {logs.length === 0 ? (
              <Text style={styles.emptyLogs}>Tap a button above to test notifications</Text>
            ) : (
              logs.map((log, i) => (
                <Text key={i} style={[styles.logText, log.includes('❌') && styles.errorLog]}>
                  {log}
                </Text>
              ))
            )}
          </View>
        </View>

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>⚠️ Important Notes</Text>
          <Text style={styles.tipText}>• FCM requires a physical Android device</Text>
          <Text style={styles.tipText}>• Expo Go does NOT support native FCM</Text>
          <Text style={styles.tipText}>• Use a development build (expo run:android)</Text>
          <Text style={styles.tipText}>• Check device logs for detailed FCM output</Text>
          <Text style={styles.tipText}>• Make sure Google Play Services is installed</Text>
        </View>
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a2e',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6366f1',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#6366f1',
  },
  ticketBtn: {
    backgroundColor: '#f59e0b',
  },
  visitorBtn: {
    backgroundColor: '#10b981',
  },
  ppmBtn: {
    backgroundColor: '#8b5cf6',
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  logsBox: {
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderRadius: 10,
    minHeight: 150,
    maxHeight: 250,
  },
  emptyLogs: {
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 50,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#4ade80',
    marginVertical: 2,
  },
  errorLog: {
    color: '#f87171',
  },
  tipsCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fbbf24',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginVertical: 3,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});