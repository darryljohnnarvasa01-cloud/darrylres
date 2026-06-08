import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Bindings } from '../types'

export function getSupabase(env: Bindings): SupabaseClient | null {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_KEY

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'rescuelink-worker-api',
      },
    },
  })
}

export function publicSupabaseAnonKey(env: Bindings) {
  return env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || ''
}
