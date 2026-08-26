import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface VideoPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  videoUrl: string | null;
  timestamp?: string | null;
  title?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VideoPreviewModal({ visible, onClose, videoUrl, timestamp, title }: VideoPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const videoRef = React.useRef<Video>(null);

  React.useEffect(() => {
    if (visible) {
      // Configure audio to play even in silent mode
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        interruptionModeIOS: 1, // interruptionModeIOS.DoNotMix
        interruptionModeAndroid: 1, // interruptionModeAndroid.DoNotMix
        shouldDuckAndroid: true,
      });
    }
  }, [visible]);

  if (!videoUrl) return null;

  const formattedTimestamp = timestamp
    ? new Date(timestamp).toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent />
        
        {/* Backdrop / Background */}
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
          disabled={false}
        >
          <View style={StyleSheet.absoluteFill} />
        </TouchableOpacity>

        {/* Video Player */}
        <View style={styles.videoWrapper}>
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping
            shouldPlay={visible}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded && status.didJustFinish) {
                // Handle loop or finish if needed
              }
            }}
          />
        </View>

        {/* Header Overlay (Title & Timestamp) */}
        {(title || formattedTimestamp) && (
          <View style={[styles.headerOverlay, { top: Math.max(insets.top, 20) }]}>
            {title && <Text style={styles.videoTitle}>{title}</Text>}
            {formattedTimestamp && (
              <View style={styles.timestampBadge}>
                <Ionicons name="time-outline" size={13} color="#FFF" />
                <Text style={styles.timestampText}>{formattedTimestamp}</Text>
              </View>
            )}
          </View>
        )}

        {/* Close Button */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: Math.max(insets.top, 20) }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <View style={styles.closeBtnCircle}>
            <Ionicons name="close" size={24} color="#FFF" />
          </View>
        </TouchableOpacity>
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
  videoWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    position: 'absolute',
    left: 20,
    right: 70,
    zIndex: 10,
    gap: 4,
  },
  videoTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  timestampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  timestampText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  closeBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
