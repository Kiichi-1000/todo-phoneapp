import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log('=== Supabase Configuration ===');
console.log('URL:', supabaseUrl);
console.log('Has Key:', !!supabaseAnonKey);
console.log('Key Length:', supabaseAnonKey?.length);
console.log('Full URL:', supabaseUrl);
console.log('============================');

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = 'Missing Supabase environment variables';
  console.error('ERROR:', errorMsg);
  console.error('Available env:', {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    constantsUrl: Constants.expoConfig?.extra?.supabaseUrl,
    constantsKey: Constants.expoConfig?.extra?.supabaseAnonKey,
  });
  throw new Error(errorMsg);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
  },
});

console.log('Supabase client created successfully');
