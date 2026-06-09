import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Bindings } from '../types'

const SUPABASE_TIMEOUT_MS = 10_000
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function workerFetch(input: RequestInfo | URL, init?: RequestInit, attempt = 0): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS)

  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    if (attempt === 0 && (method === 'GET' || method === 'HEAD') && RETRYABLE_STATUS.has(response.status)) {
      await response.body?.cancel().catch(() => undefined)
      await sleep(250)
      return workerFetch(input, init, 1)
    }
    return response
  } catch (error) {
    if (attempt === 0 && (method === 'GET' || method === 'HEAD')) {
      await sleep(250)
      return workerFetch(input, init, 1)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function getSupabase(env: Bindings): SupabaseClient | null {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_KEY
  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { 'X-Client-Info': 'rescuelink-worker-api' },
      fetch: workerFetch,
    },
  })
}

export function publicSupabaseAnonKey(env: Bindings) {
  return env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || ''
}
