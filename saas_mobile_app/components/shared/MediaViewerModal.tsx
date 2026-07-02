import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

interface MediaViewerModalProps {
  visible: boolean;
  uri: string | null;
  type: 'photo' | 'video';
  onClose: () => void;
}

export default function MediaViewerModal({
  visible,
  uri,
  type,
  onClose,
}: MediaViewerModalProps) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!uri || downloading) return;
    setDownloading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Media library permission is needed to save files.');
        return;
      }

      const ext = type === 'video' ? 'mp4' : 'jpg';
      const mimeType = type === 'video' ? 'video/mp4' : 'image/jpeg';
      const fileName = `autopilot_${type}_${Date.now()}.${ext}`;
      const destFile = Paths.cache.createFile(fileName, mimeType);
      await File.downloadFileAsync(uri, destFile, { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(destFile.uri);
      Alert.alert('Saved', `${type === 'video' ? 'Video' : 'Photo'} saved to gallery.`);
    } catch (err: any) {
      console.error('[MediaViewerModal] download error:', err);
      Alert.alert('Download Failed', err.message || 'Could not save the file.');
    } finally {
      setDownloading(false);
    }
  };

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" translucent />
      <View style={styles.container}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableOpacity>

        <View style={styles.content}>
          {type === 'photo' ? (
            <Image source={{ uri }} style={styles.media} resizeMode="contain" />
          ) : (
            <Video
              source={{ uri }}
              style={styles.media}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping
            />
          )}
        </View>

        {/* Top controls */}
        <View style={[styles.controls, { top: Math.max(insets.top, 16) }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleDownload}
            disabled={downloading}
            activeOpacity={0.7}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="download-outline" size={24} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
