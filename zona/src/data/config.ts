import { supabase } from '@/lib/supabase';
import {
  resolveUniversalConfig,
  type UniversalAppOptionRow,
  type UniversalConfig,
} from '@/lib/universal-config';

export type { UniversalConfig };

export async function getUniversalConfig(isPremium: boolean): Promise<UniversalConfig> {
  try {
    const { data, error } = await supabase
      .from('universal_app_options')
      .select('option_name, value')
      .in('option_name', ['user_guide_url', 'retention_days_standard', 'retention_days_premium']);
    if (error) return resolveUniversalConfig(null, isPremium);
    return resolveUniversalConfig(data as UniversalAppOptionRow[] | null, isPremium);
  } catch {
    return resolveUniversalConfig(null, isPremium);
  }
}
