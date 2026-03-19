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
      getItem: (key: string) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key: string, value: string) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {}
      },
      removeItem: (key: string) => {
        try {
          window.localStorage.removeItem(key);
        } catch {}
      },
    };
  }

  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage) {
      return AsyncStorage;
    }
  } catch {}

  return {
    getItem: (key: string) => memoryStorage[key] ?? null,
    setItem: (key: string, value: string) => { memoryStorage[key] = value; },
    removeItem: (key: string) => { delete memoryStorage[key]; },
  };
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage() as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
