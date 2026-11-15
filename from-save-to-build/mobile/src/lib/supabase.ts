import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Only the public URL and anon key ever reach the client. Service-role and AI keys stay server-side.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = Boolean(SUPABASE_URL && anonKey);
/** True when the app is pointed at the local development gateway instead of a Supabase project. */
export const isDevGateway = /localhost|127\.0\.0\.1|10\.0\.2\.2/.test(SUPABASE_URL);

export const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
