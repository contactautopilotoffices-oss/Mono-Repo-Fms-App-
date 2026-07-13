// @ts-nocheck
/**
 * Firebase Configuration
 *
 * Initializes Firebase for the mobile app.
 * Uses @react-native-firebase which requires google-services.json
 */

import { Platform } from 'react-native';

// Firebase config from environment
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBg_kCQu-zs9NNxu-rowj-2j1zGLD9_IVQ',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'web-notification-52467.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'web-notification-52467',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-notification-52467.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '758776193487',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:758776193487:web:37aded7039fffec6a432ba',
};

// Check if running in Expo Go (doesn't support native modules)
export const isExpoGo = Platform.OS === 'android' && !!(Expo?.Constants?.appOwnership === 'expo');

// Export config for use in messaging
export { firebaseConfig };
