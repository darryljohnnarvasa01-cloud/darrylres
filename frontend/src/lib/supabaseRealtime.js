import { createClient } from '@supabase/supabase-js'
import { getPublicConfig } from './publicConfig'

let clientPromise = null

export async function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = getPublicConfig().then((config) => {
      const url = config?.supabase?.url
      const anonKey = config?.supabase?.anon_key

      if (!url || !anonKey) {
        throw new Error('Supabase realtime is not configured.')
      }

      return createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      })
    })
  }

  return clientPromise
}

export async function subscribeToResponderLocations({ filter, onChange, onError }) {
  try {
    const supabase = await getSupabaseClient()
    const channelName = `responder-locations:${filter || 'all'}:${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'responder_locations',
          ...(filter ? { filter } : {}),
        },
        (payload) => onChange?.(payload),
      )
      .subscribe((status, error) => {
        if (error) {
          onError?.(error)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  } catch (error) {
    onError?.(error)
    return () => {}
  }
}

export async function subscribeToResponderStatusLogs({ filter, onChange, onError }) {
  try {
    const supabase = await getSupabaseClient()
    const channelName = `responder-status-logs:${filter || 'all'}:${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'responder_status_logs',
          ...(filter ? { filter } : {}),
        },
        (payload) => onChange?.(payload),
      )
      .subscribe((status, error) => {
        if (error) {
          onError?.(error)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  } catch (error) {
    onError?.(error)
    return () => {}
  }
}

export async function subscribeToResponderHealthLogs({ filter, onChange, onError }) {
  try {
    const supabase = await getSupabaseClient()
    const channelName = `responder-health-logs:${filter || 'all'}:${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'responder_health_logs',
          ...(filter ? { filter } : {}),
        },
        (payload) => onChange?.(payload),
      )
      .subscribe((status, error) => {
        if (error) {
          onError?.(error)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  } catch (error) {
    onError?.(error)
    return () => {}
  }
}

export async function subscribeToResponderRoutePoints({ filter, onChange, onError }) {
  try {
    const supabase = await getSupabaseClient()
    const channelName = `responder-route-points:${filter || 'all'}:${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'responder_route_points',
          ...(filter ? { filter } : {}),
        },
        (payload) => onChange?.(payload),
      )
      .subscribe((status, error) => {
        if (error) {
          onError?.(error)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  } catch (error) {
    onError?.(error)
    return () => {}
  }
}
