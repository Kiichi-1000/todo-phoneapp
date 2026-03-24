import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  Constants.expoConfig?.extra?.supabaseUrl ||
  '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  '';

const memoryStorage: Record<string, string> = {};

function getStorage() {
  if (Platform.OS === 'web') {
    return {
      getItem: async (key: string) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {}
      },
      removeItem: async (key: string) => {
        try {
          window.localStorage.removeItem(key);
        } catch {}
      },
    };
  }

  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage')?.default;
    if (AsyncStorage) {
      return {
        getItem: async (key: string) => {
          try {
            return await AsyncStorage.getItem(key);
          } catch {
            return memoryStorage[key] ?? null;
          }
        },
        setItem: async (key: string, value: string) => {
          try {
            await AsyncStorage.setItem(key, value);
          } catch {
            memoryStorage[key] = value;
          }
        },
        removeItem: async (key: string) => {
          try {
            await AsyncStorage.removeItem(key);
          } catch {
            delete memoryStorage[key];
          }
        },
      };
    }
  } catch {}

  return {
    getItem: async (key: string) => memoryStorage[key] ?? null,
    setItem: async (key: string, value: string) => {
      memoryStorage[key] = value;
    },
    removeItem: async (key: string) => {
      delete memoryStorage[key];
    },
  };
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage() as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
