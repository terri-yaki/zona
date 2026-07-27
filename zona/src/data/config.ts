import { supabase } from '@/lib/supabase';
import {
  resolveUniversalConfig,
  type UniversalConfig,
  type UniversalConfigRow,
} from '@/lib/universal-config';

export type { UniversalConfig };

export async function getUniversalConfig(isPremium: boolean): Promise<UniversalConfig> {
  try {
    const { data, error } = await supabase
      .from('universal_app_options')
      .select('user_guide_url, retention_days_standard, retention_days_premium')
      .eq('id', true)
      .maybeSingle();
    if (error) return resolveUniversalConfig(null, isPremium);
    return resolveUniversalConfig(data as UniversalConfigRow | null, isPremium);
  } catch {
    return resolveUniversalConfig(null, isPremium);
  }
}
