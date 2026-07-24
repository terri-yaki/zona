import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

import { authStorage } from './auth-storage';
import { env } from './env';

// URL polyfill is applied in index.js before expo-router loads.

export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
