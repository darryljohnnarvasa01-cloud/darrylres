import { Hono } from 'hono'
import type { Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { guestIdentity, publicGuestQuota } from '../services/guestIdentity'
import { storeIncidentMedia, validateMediaFiles } from '../services/mediaStorage'
import { getSupabase, publicSupabaseAnonKey } from '../services/supabase'
import { getEmergencyHotline } from '../services/systemSettings'
import type { AppEnv } from '../types'
import { successResponse } from '../utils/apiResponse'
import { manilaDayBounds } from '../utils/time'

const activeStatuses = [
  'sms_draft',
  'pending_verification',
  'verified',
  'under_assessment',
  'responding',
  'on_scene',
  'handoff',
]

const publicIncidentColumns = [
  'id',
  'type',
  'address_label',
  'status',
  'incident_datetime',
  'created_at',
  'latitude',
  'longitude',
].join(',')

const publicRoutes = new Hono<AppEnv>()

type AppContext = Context<AppEnv>

const incidentFormSchema = z.object({
  type: z.enum(['fire', 'medical', 'crime', 'flood', 'accident', 'other']),
  description: z.string().trim().min(20).max(1000),
  incident_datetime: z.coerce.date().max(new Date()),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address_label: z.string().trim().min(1).max(255),
  force_submit: z
    .union([z.literal('1'), z.literal('true'), z.literal('on'), z.literal('yes')])
    .optional(),
})

function boundedLimit(value: string | null, fallback = 10) {
  const parsed = z.coerce.number().int().min(1).max(50).safeParse(value ?? fallback)

  return parsed.success ? parsed.data : fallback
}

async function countIncidents(
  supabase: SupabaseClient,
  applyFilters?: (query: any) => any,
) {
  let query = supabase.from('incidents').select('id', {
    count: 'exact',
    head: true,
  })

  if (applyFilters) {
    query = applyFilters(query) as typeof query
  }

  const { count, error } = await query

  if (error) {
    throw error
  }

  return count ?? 0
}

async function publicStats(c: AppContext) {
  const supabase = getSupabase(c.env)
  const hotline = await getEmergencyHotline(supabase, c.env)

  if (!supabase) {
    return {
      total_reported: 0,
      total_resolved: 0,
      active_today: 0,
      avg_response_hours: 0,
      hotline,
    }
  }

  try {
    const { start, end } = manilaDayBounds()
    const [totalReported, totalResolved, activeToday] = await Promise.all([
      countIncidents(supabase),
      countIncidents(supabase, (query) => query.eq('status', 'resolved')),
      countIncidents(supabase, (query) => query
        .gte('created_at', start)
        .lt('created_at', end)
        .in('status', activeStatuses)),
    ])

    return {
      total_reported: totalReported,
      total_resolved: totalResolved,
      active_today: activeToday,
      avg_response_hours: 0,
      hotline,
    }
  } catch (error) {
    console.warn('Unable to load public stats from Supabase.', error)

    return {
      total_reported: 0,
      total_resolved: 0,
      active_today: 0,
      avg_response_hours: 0,
      hotline,
    }
  }
}

async function publicMapIncidents(c: AppContext) {
  const supabase = getSupabase(c.env)

  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('incidents')
    .select(publicIncidentColumns)
    .eq('status', 'verified')
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('Unable to load public map incidents from Supabase.', error.message)
    return []
  }

  return data ?? []
}

async function publicRecentIncidents(
  c: AppContext,
  limit: number,
) {
  const supabase = getSupabase(c.env)

  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('incidents')
    .select(publicIncidentColumns)
    .neq('status', 'rejected')
    .neq('status', 'sms_draft')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('Unable to load public recent incidents from Supabase.', error.message)
    return []
  }

  return data ?? []
}

function validationErrorResponse(c: AppContext, errors: Record<string, string[]>) {
  return c.json({
    success: false,
    errors,
    message: 'Validation failed.',
  }, 422)
}

function duplicateResponse(c: AppContext, existingIncidentId: string, minutesAgo: number, guestQuota?: unknown) {
  return c.json({
    success: false,
    duplicate: true,
    message: `A similar report was already submitted nearby (${minutesAgo} mins ago).`,
    data: {
      existing_incident_id: existingIncidentId,
      minutes_ago: minutesAgo,
      guest_quota: guestQuota ?? null,
    },
    errors: {},
  }, 409)
}

function calculateDistanceInMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadius = 6371000
  const toRadians = (degrees: number) => degrees * (Math.PI / 180)
  const latDelta = toRadians(latitudeB - latitudeA)
  const lngDelta = toRadians(longitudeB - longitudeA)
  const a =
    Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(latitudeA))
      * Math.cos(toRadians(latitudeB))
      * Math.sin(lngDelta / 2) ** 2
  const distance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadius * distance
}

async function findDuplicateIncident(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  type: string,
  latitude: number,
  longitude: number,
) {
  const windowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('incidents')
    .select('id,latitude,longitude,incident_datetime')
    .eq('type', type)
    .gte('incident_datetime', windowStart)
    .lte('incident_datetime', now)
    .order('incident_datetime', { ascending: false })

  if (error) {
    console.warn('Duplicate incident lookup failed.', error.message)
    return null
  }

  for (const candidate of data ?? []) {
    const distance = calculateDistanceInMeters(
      latitude,
      longitude,
      Number(candidate.latitude),
      Number(candidate.longitude),
    )

    if (distance <= 250) {
      return candidate
    }
  }

  return null
}

async function reserveGuestQuota(c: AppContext, supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const identity = await guestIdentity(c)
  const limit = Math.max(1, Number(c.env.GUEST_REPORT_LIMIT || 10) || 10)
  const now = new Date().toISOString()
  const { data: existing, error: existingError } = await supabase
    .from('guest_report_usages')
    .select('reports_count')
    .eq('guest_identifier', identity.guest_identifier)
    .maybeSingle()

  if (existingError) {
    console.warn('Guest quota lookup failed.', existingError.message)
  }

  const used = Number(existing?.reports_count ?? 0)

  if (used >= limit) {
    return {
      allowed: false,
      identity,
      quota: {
        limit,
        used: Math.min(used, limit),
        remaining: 0,
        limit_reached: true,
      },
    }
  }

  const nextUsed = used + 1
  const { error } = await supabase
    .from('guest_report_usages')
    .upsert({
      guest_identifier: identity.guest_identifier,
      ip_hash: identity.ip_hash,
      user_agent_hash: identity.user_agent_hash,
      reports_count: nextUsed,
      first_reported_at: existing ? undefined : now,
      last_reported_at: now,
      updated_at: now,
    }, {
      onConflict: 'guest_identifier',
    })

  if (error) {
    console.warn('Guest quota update failed.', error.message)
  }

  return {
    allowed: true,
    identity,
    quota: {
      limit,
      used: Math.min(nextUsed, limit),
      remaining: Math.max(0, limit - nextUsed),
      limit_reached: nextUsed >= limit,
    },
  }
}

function verificationUrl(c: AppContext, referenceCode: string) {
  const frontendUrl = (c.env.FRONTEND_URL || '').replace(/\/+$/, '')

  return frontendUrl ? `${frontendUrl}/verify/${referenceCode}` : `/verify/${referenceCode}`
}

export async function storeGuestIncident(c: AppContext) {
  const supabase = getSupabase(c.env)

  if (!supabase) {
    return c.json({
      success: false,
      errors: {},
      message: 'Supabase credentials are not configured.',
    }, 503)
  }

  const formData = await c.req.formData()
  const rawPayload = {
    type: formData.get('type'),
    description: formData.get('description'),
    incident_datetime: formData.get('incident_datetime'),
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    address_label: formData.get('address_label'),
    force_submit: formData.get('force_submit') ?? undefined,
  }
  const mediaFiles = formData
    .getAll('media[]')
    .filter((item): item is File => item instanceof File)
  const parsed = incidentFormSchema.safeParse(rawPayload)
  const mediaErrors = validateMediaFiles(mediaFiles)

  if (!parsed.success || Object.keys(mediaErrors).length > 0) {
    const fieldErrors: Record<string, string[]> = {}

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.') || 'form'
        fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message]
      }
    }

    return validationErrorResponse(c, {
      ...fieldErrors,
      ...mediaErrors,
    })
  }

  const payload = parsed.data
  const quota = await reserveGuestQuota(c, supabase)
  const guestQuota = publicGuestQuota(quota.quota)

  if (!quota.allowed) {
    return c.json({
      success: false,
      code: 'guest_report_limit_reached',
      message: "You've reached the maximum number of reports. Create an account to continue reporting and track your incidents.",
      data: {
        guest_quota: guestQuota,
      },
      errors: {
        guest: ['Guest reporting limit reached.'],
      },
    }, 429)
  }

  if (!payload.force_submit) {
    const duplicate = await findDuplicateIncident(
      supabase,
      payload.type,
      payload.latitude,
      payload.longitude,
    )

    if (duplicate) {
      const minutesAgo = Math.max(
        1,
        Math.round((Date.now() - new Date(duplicate.incident_datetime).getTime()) / 60000),
      )

      return duplicateResponse(c, duplicate.id, minutesAgo, guestQuota)
    }
  }

  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      is_guest: true,
      guest_identifier: quota.identity.guest_identifier,
      type: payload.type,
      description: payload.description,
      incident_datetime: payload.incident_datetime.toISOString(),
      latitude: payload.latitude,
      longitude: payload.longitude,
      address_label: payload.address_label,
      status: 'pending_verification',
      is_iot_generated: false,
    })
    .select('id,reference_code,status,type,address_label,created_at')
    .single()

  if (error) {
    console.error('Guest incident insert failed.', error.message)

    return c.json({
      success: false,
      errors: {},
      message: 'Unable to submit incident report right now.',
    }, 500)
  }

  await supabase.from('incident_logs').insert({
    incident_id: incident.id,
    changed_by: null,
    old_status: null,
    new_status: 'pending_verification',
    notes: 'Incident submitted by guest reporter.',
  })

  const media = await storeIncidentMedia({
    env: c.env,
    supabase,
    incidentId: incident.id,
    files: mediaFiles,
  })

  return successResponse(c, {
    id: incident.id,
    reference_code: incident.reference_code,
    status: incident.status,
    verification_url: verificationUrl(c, incident.reference_code),
    guest_quota: guestQuota,
    media_stored: media.stored,
    media_count: media.count,
  }, `Report submitted! Reference: ${incident.reference_code}`, 201)
}

publicRoutes.get('/config', (c) => successResponse(c, {
  supabase: {
    url: c.env.SUPABASE_URL || '',
    anon_key: publicSupabaseAnonKey(c.env),
  },
  google_maps: {
    api_key: c.env.GOOGLE_MAPS_API_KEY || '',
  },
}, 'Public frontend configuration retrieved successfully.'))

publicRoutes.get('/stats', async (c) => {
  return successResponse(c, await publicStats(c), 'Public stats retrieved successfully.')
})

publicRoutes.get('/home', async (c) => {
  const recentLimit = boundedLimit(c.req.query('recent_limit') ?? null, 10)
  const [mapIncidents, recentIncidents, stats] = await Promise.all([
    publicMapIncidents(c),
    publicRecentIncidents(c, recentLimit),
    publicStats(c),
  ])

  return successResponse(c, {
    map_incidents: mapIncidents,
    recent_incidents: recentIncidents,
    stats,
  }, 'Public home data retrieved successfully.')
})

publicRoutes.get('/incidents/map', async (c) => {
  return successResponse(c, {
    incidents: await publicMapIncidents(c),
  }, 'Public incident map data retrieved successfully.')
})

publicRoutes.get('/incidents/recent', async (c) => {
  const limit = boundedLimit(c.req.query('limit') ?? null, 10)

  return successResponse(c, {
    incidents: await publicRecentIncidents(c, limit),
  }, 'Public recent incidents retrieved successfully.')
})

publicRoutes.get('/hazard-zones', async (c) => {
  const supabase = getSupabase(c.env)

  if (!supabase) {
    return successResponse(c, {
      hazard_zones: [],
    }, 'Public hazard zones retrieved successfully.')
  }

  const { data, error } = await supabase
    .from('hazard_zones')
    .select('id,name,type,polygon,description,capacity,current_occupancy,facilities,is_active,created_at')
    .eq('is_active', true)
    .order('type', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.warn('Unable to load public hazard zones from Supabase.', error.message)
  }

  return successResponse(c, {
    hazard_zones: data ?? [],
  }, 'Public hazard zones retrieved successfully.')
})

publicRoutes.post('/incidents', storeGuestIncident)

export default publicRoutes
