import type { SupabaseClient } from '@supabase/supabase-js'
import type { Bindings } from '../types'

const HOTLINE_KEY = 'emergency_hotline'

export function defaultEmergencyHotline(env: Bindings) {
  return env.DEFAULT_EMERGENCY_HOTLINE?.trim() || '0966-123-4567'
}

export async function getEmergencyHotline(
  supabase: SupabaseClient | null,
  env: Bindings,
) {
  if (!supabase) {
    return defaultEmergencyHotline(env)
  }

  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('setting_key', HOTLINE_KEY)
    .maybeSingle()

  if (error) {
    console.warn('Unable to load emergency hotline from Supabase.', error.message)
  }

  return String(data?.value ?? '').trim() || defaultEmergencyHotline(env)
}
