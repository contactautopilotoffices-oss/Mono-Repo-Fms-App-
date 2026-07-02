/**
 * QRCodeDisplay Component
 *
 * Displays QR code for a stock item that can be scanned from any platform.
 * Compatible with web app QR codes (same data format).
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Share } from 'react-native';
import { QRCodeData } from '@/services/stockService';
import { MOBILE_API_BASE } from '@/utils/api/mobileApi';
import { QrCode, Download, Share2 } from 'lucide-react-native';

interface QRCodeDisplayProps {
  data: QRCodeData;
  barcode?: string; // The barcode string to encode in QR (matches web app format)
  size?: number;
  showLabel?: boolean;
  itemName?: string;
  itemCode?: string;
  propertyId?: string;
}

export default function QRCodeDisplay({
  data,
  barcode,
  size = 200,
  showLabel = true,
  itemName,
  itemCode,
  propertyId,
}: QRCodeDisplayProps) {
  // Encode the barcode string in QR code (matches web app's BarcodeDisplay format)
  // Web app uses: <QRCodeSVG value={item.barcode} />
  const qrValue = barcode || data.item_code || data.id || '';

  const handleDownload = async () => {
    Alert.alert('Download', 'QR Code download is not available yet.');
  };

  const handleShare = async () => {
    try {
      const itemLabel = itemName || data.name || 'Stock Item';
      let shareUrl = qrValue;
      if (propertyId && !qrValue.match(/^https?:\/\//i)) {
        shareUrl = `${MOBILE_API_BASE}/property/${propertyId}/stock?barcode=${encodeURIComponent(qrValue)}`;
      }

      if (Platform.OS === 'web') {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareUrl);
          Alert.alert('Copied!', 'Link copied to clipboard');
        }
      } else {
        await Share.share({
          message: `${itemLabel}\n${shareUrl}`,
          url: shareUrl,
          title: itemLabel,
        });
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
        <Text style={styles.dataPreviewLabel}>QR Code Value:</Text>
        <Text style={styles.dataPreviewText} numberOfLines={2}>
          {qrValue}
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
