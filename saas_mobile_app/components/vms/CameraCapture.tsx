/**
 * CameraCapture — Reusable camera component for visitor photo capture.
 * Uses expo-image-picker. Returns the local URI of the captured photo.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X, RotateCcw, Check } from 'lucide-react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';

interface CameraCaptureProps {
  value?: string | null;
  onCapture: (uri: string) => void;
  onClear?: () => void;
  label?: string;
  size?: number;
}

export default function CameraCapture({
  value,
  onCapture,
  onClear,
  label = 'Take Photo',
  size = 120,
}: CameraCaptureProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const [loading, setLoading] = useState(false);

  const handleCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take visitor photos.');
      return;
    }

    setLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        onCapture(result.assets[0].uri);
      }
    } catch (err) {
      console.error('[CameraCapture] error:', err);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery access is needed to select photos.');
      return;
    }

    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        onCapture(result.assets[0].uri);
      }
    } catch (err) {
      console.error('[CameraCapture] gallery error:', err);
      Alert.alert('Error', 'Failed to select photo. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (value) {
    return (
      <View style={styles.previewContainer}>
        <View style={[styles.preview, { width: size, height: size, borderRadius: size / 2 }]}>
          <Image source={{ uri: value }} style={styles.previewImg} />
        </View>
        <View style={styles.previewActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}
            onPress={handleCapture}
            disabled={loading}
          >
            <RotateCcw size={16} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Retake</Text>
          </TouchableOpacity>
          {onClear && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]}
              onPress={onClear}
            >
              <X size={16} color="#EF4444" />
              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.captureBtn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: 'rgba(255,255,255,0.15)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          },
        ]}
        onPress={handleCapture}
        disabled={loading}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <Camera size={28} color={colors.primary} />
            <Text style={[styles.captureLabel, { color: colors.textSecondary }]}>{label}</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.galleryBtn, { borderColor: 'rgba(255,255,255,0.1)' }]}
        onPress={handlePickFromGallery}
        disabled={loading}
      >
        <Text style={[styles.galleryBtnText, { color: colors.textSecondary }]}>
          Choose from Gallery
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  captureBtn: {
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  captureLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  galleryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderRadius: 20 },
  galleryBtnText: { fontSize: 12, fontWeight: '600' },
  previewContainer: { alignItems: 'center', gap: 12 },
  preview: { overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  previewImg: { width: '100%', height: '100%' },
  previewActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
});
