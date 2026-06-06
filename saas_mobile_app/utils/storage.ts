import { StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Attempt to load MMKV, but handle failure gracefully (e.g., in Expo Go)
export let mmkvStorage: any;
export let isMMKVAvailable = false;

try {
  const { MMKV } = require('react-native-mmkv');
  mmkvStorage = new MMKV({ id: 'autopilot-app-cache' });
  isMMKVAvailable = true;
  console.log('[Storage] Successfully initialized MMKV');
} catch (e) {
  console.warn('[Storage] MMKV not available. Falling back to AsyncStorage.');
}

/**
 * High-performance synchronous storage for Zustand using react-native-mmkv.
 * Falls back to AsyncStorage (which is async, but Zustand persist supports async)
 */
export const zustandStorage: StateStorage = {
  setItem: async (name: string, value: string) => {
    if (isMMKVAvailable) {
      mmkvStorage.set(name, value);
    } else {
      await AsyncStorage.setItem(name, value);
    }
  },
  getItem: async (name: string) => {
    if (isMMKVAvailable) {
      const value = mmkvStorage.getString(name);
      return value ?? null;
    } else {
      return await AsyncStorage.getItem(name);
    }
  },
  removeItem: async (name: string) => {
    if (isMMKVAvailable) {
      mmkvStorage.delete(name);
    } else {
      await AsyncStorage.removeItem(name);
    }
  },
};

/**
 * Drop-in replacement for AsyncStorage, powered by MMKV (with AsyncStorage fallback).
 * Provides the same async API, making it easy to migrate existing code while
 * completely bypassing the 6MB SQLite limit in production.
 */
export const mmkvAsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isMMKVAvailable) {
      const value = mmkvStorage.getString(key);
      return value ?? null;
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isMMKVAvailable) {
      mmkvStorage.set(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (isMMKVAvailable) {
      mmkvStorage.delete(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  },
  clear: async (): Promise<void> => {
    if (isMMKVAvailable) {
      mmkvStorage.clearAll();
    } else {
      await AsyncStorage.clear();
    }
  },
  getAllKeys: async (): Promise<readonly string[]> => {
    if (isMMKVAvailable) {
      return mmkvStorage.getAllKeys();
    }
    return AsyncStorage.getAllKeys();
  },
  multiGet: async (keys: readonly string[]): Promise<readonly [string, string | null][]> => {
    if (isMMKVAvailable) {
      return keys.map((key) => [key, mmkvStorage.getString(key) ?? null]);
    }
    return AsyncStorage.multiGet(keys);
  },
  multiSet: async (keyValuePairs: string[][]): Promise<void> => {
    if (isMMKVAvailable) {
      keyValuePairs.forEach(([key, value]) => {
        mmkvStorage.set(key, value);
      });
    } else {
      await AsyncStorage.multiSet(keyValuePairs);
    }
  },
  multiRemove: async (keys: readonly string[]): Promise<void> => {
    if (isMMKVAvailable) {
      keys.forEach((key) => {
        mmkvStorage.delete(key);
      });
    } else {
      await AsyncStorage.multiRemove(keys);
    }
  },
};
