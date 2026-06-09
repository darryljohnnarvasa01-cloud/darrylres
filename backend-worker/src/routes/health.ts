import { Hono } from 'hono'
import { emailDeliveryStatus } from '../services/emailDelivery'
import { getSupabase } from '../services/supabase'
import type { AppEnv } from '../types'
import { successResponse } from '../utils/apiResponse'

const healthRoutes = new Hono<AppEnv>()

healthRoutes.get('/', async (c) => {
  const supabase = getSupabase(c.env)
  let database: {
    ok: boolean
    driver: string
    error: string | null
  } = {
    ok: false,
    driver: 'supabase-postgrest',
    error: 'Supabase credentials are not configured.',
  }

  if (supabase) {
    const { error } = await supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })

    database = {
      ok: !error,
      driver: 'supabase-postgrest',
      error: error?.message ?? null,
    }
  }

  return successResponse(c, {
    app_name: c.env.APP_NAME || 'RescueLink',
    environment: c.env.APP_ENV || 'production',
    timestamp: new Date().toISOString(),
    status: database.ok ? 'healthy' : 'degraded',
    services: {
      database,
      queue: {
        ok: true,
        connection: 'cloudflare-queue:not-configured',
        pending_jobs: null,
        failed_jobs: null,
        error: null,
      },
      cache: {
        ok: true,
        store: 'cloudflare-edge',
        error: null,
      },
      broadcast: {
        ok: true,
        connection: 'not-migrated',
        error: null,
      },
      storage: {
        ok: true,
        disk: 'r2:not-configured',
        path: null,
        error: null,
      },
      email: emailDeliveryStatus(c.env),
    },
  }, 'System health retrieved successfully.')
})

export default healthRoutes
