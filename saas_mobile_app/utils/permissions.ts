import { Alert, Linking } from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

/**
 * Helper to show an alert asking the user to open settings.
 */
function showSettingsAlert(title: string, message: string) {
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() }
    ]
  );
}

/**
 * Request Audio / Microphone Permission
 * If previously denied permanently, prompts the user to open System Settings.
 */
export async function requestAudioPermissionWithSettings(): Promise<boolean> {
  const { status, canAskAgain } = await Audio.requestPermissionsAsync();
  if (status === 'granted') return true;

  if (!canAskAgain) {
    showSettingsAlert(
      'Microphone Permission Required',
      'Microphone access is needed for voice features. Please enable it in your system settings.'
    );
  }
  return false;
}

/**
 * Request Camera Permission
 * If previously denied permanently, prompts the user to open System Settings.
 */
export async function requestCameraPermissionWithSettings(): Promise<boolean> {
  const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
  if (status === 'granted') return true;

  if (!canAskAgain) {
    showSettingsAlert(
      'Camera Permission Required',
      'Camera access is needed to capture photos and videos. Please enable it in your system settings.'
    );
  }
  return false;
}

/**
 * Request Photo Library / Media Library Permission
 * If previously denied permanently, prompts the user to open System Settings.
 */
export async function requestMediaLibraryPermissionWithSettings(): Promise<boolean> {
  // Android 13+ (API 33+) uses the System Photo Picker which requires zero permissions
  if (Platform.OS === 'android') {
    return true;
  }
  // On iOS, request Photo Library permission
  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;

  if (!canAskAgain) {
    showSettingsAlert(
      'Photo Library Permission Required',
      'Photo library access is needed to select photos. Please enable it in your system settings.'
    );
  }
  return false;
}

/**
 * Request Notifications Permission
 * If previously denied permanently, prompts the user to open System Settings.
 */
export async function requestNotificationsPermissionWithSettings(): Promise<boolean> {
  const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
  if (status === 'granted') return true;

  if (!canAskAgain) {
    showSettingsAlert(
      'Notifications Permission Required',
      'Push notifications are needed to receive important updates. Please enable them in your system settings.'
    );
  }
  return false;
}
