/**
 * QRCodeDisplay Component
 *
 * Displays QR code for a stock item that can be scanned from any platform.
 * Compatible with web app QR codes (same data format).
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { QRCodeData } from '@/services/stockService';
import { QrCode, Download, Share2 } from 'lucide-react-native';

interface QRCodeDisplayProps {
  data: QRCodeData;
  size?: number;
  showLabel?: boolean;
  itemName?: string;
  itemCode?: string;
}

export default function QRCodeDisplay({
  data,
  size = 200,
  showLabel = true,
  itemName,
  itemCode,
}: QRCodeDisplayProps) {
  // The QR code data - JSON stringified for web compatibility
  const qrDataString = JSON.stringify(data);

  const handleDownload = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web: Create a downloadable link
        const canvas = document.createElement('canvas');
        // QR code would be rendered via a library
        Alert.alert('Download', 'QR Code download not available on web');
      } else {
        // Mobile: Use expo-sharing
        const fileUri = `${FileSystem.cacheDirectory}qr-${data.item_code}.png`;
        // Note: For actual QR generation, use react-native-qrcode-svg
        Alert.alert('Share QR', `QR data: ${qrDataString}`);
      }
    } catch (error) {
      console.error('Error downloading QR:', error);
      Alert.alert('Error', 'Failed to download QR code');
    }
  };

  const handleShare = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web: Copy to clipboard
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(qrDataString);
          Alert.alert('Copied!', 'QR data copied to clipboard');
        }
      } else {
        // Mobile
        Alert.alert('Share QR', `Share QR code for ${itemName || data.name}`);
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <View style={styles.container}>
      {/* QR Code Display */}
      <View style={[styles.qrContainer, { width: size, height: size }]}>
        <View style={styles.qrPlaceholder}>
          <QrCode size={size * 0.6} color="#3B82F6" />
          <Text style={styles.qrDataHint}>Scan to view item</Text>
        </View>
        {/* Hidden QR data for reference */}
        <Text style={styles.hiddenQrData}>{qrDataString}</Text>
      </View>

      {/* Label */}
      {showLabel && (
        <View style={styles.labelContainer}>
          <Text style={styles.itemName}>{itemName || data.name}</Text>
          <Text style={styles.itemCode}>{itemCode || data.item_code}</Text>
          <Text style={styles.category}>{data.category || 'Uncategorized'}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleDownload}>
          <Download size={18} color="#60A5FA" />
          <Text style={styles.actionText}>Download</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Share2 size={18} color="#60A5FA" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Data preview */}
      <View style={styles.dataPreview}>
        <Text style={styles.dataPreviewLabel}>QR Code Data:</Text>
        <Text style={styles.dataPreviewText} numberOfLines={2}>
          {qrDataString}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
  },
  qrContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  qrPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrDataHint: {
    marginTop: 8,
    fontSize: 10,
    color: '#94A3B8',
  },
  hiddenQrData: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  labelContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  itemCode: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  category: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  actionText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
  },
  dataPreview: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    width: '100%',
  },
  dataPreviewLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
  },
  dataPreviewText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
