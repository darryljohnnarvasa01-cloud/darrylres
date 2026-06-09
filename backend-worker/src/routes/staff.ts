import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../services/auth'
import type { AppEnv } from '../types'
import { errorResponse, successResponse } from '../utils/apiResponse'

const staffRoutes = new Hono<AppEnv>()

staffRoutes.use('*', requireAuth)
staffRoutes.use('*', async (c, next) => {
  const role = c.get('auth').user.role
  if (role !== 'staff' && role !== 'admin') {
    return errorResponse(c, 'You are not allowed to access staff resources.', {}, 403)
  }
  await next()
})

const incidentStatusUpdateSchema = z.object({
  status: z.enum(['under_assessment', 'responding', 'resolved']),
  notes: z.string().trim().min(10).max(2000),
  units_coordinated: z.array(z.string().trim().min(1).max(120)).max(10).optional().default([]),
})

const trackingSchema = z.object({
  incident_id: z.string().uuid().nullable().optional(),
  action_status: z.enum(['accepted_request', 'on_the_way', 'arrived', 'resolved', 'cancelled']).default('accepted_request'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy: z.union([z.coerce.number(), z.null()]).optional(),
  heading: z.union([z.coerce.number(), z.null()]).optional(),
})

const healthLogSchema = z.object({
  incident_id: z.string().uuid().nullable().optional(),
  event_type: z.string().trim().min(1).max(80),
  severity: z.enum(['info', 'warning', 'critical']),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  recorded_at: z.string().datetime({ offset: true }).optional(),
})

function getPagination(c: Context<AppEnv>) {
  const page = Math.max(1, Number(c.req.query('page') || 1) || 1)
  const perPage = Math.min(100, Math.max(1, Number(c.req.query('per_page') || 12) || 12))
  const offset = (page - 1) * perPage

  return { page, perPage, offset }
}

function serializeIncident(
  incident: Record<string, any>,
  media: Record<string, any>[] = [],
  logs: Record<string, any>[] = [],
) {
  return {
    id: incident.id,
    reference_code: incident.reference_code,
    type: incident.type,
    status: incident.status,
    description: incident.description,
    address_label: incident.address_label,
    latitude: Number(incident.latitude),
    longitude: Number(incident.longitude),
    incident_datetime: incident.incident_datetime,
    created_at: incident.created_at,
    updated_at: incident.updated_at ?? null,
    resolved_at: incident.resolved_at ?? null,
    is_guest: Boolean(incident.is_guest),
    is_iot_generated: Boolean(incident.is_iot_generated),
    device_id: incident.device_id ?? null,
    ai_risk_score: Number(incident.ai_risk_score ?? 0),
    reporter: incident.reporter
      ? {
          id: incident.reporter.id ?? incident.reporter_id ?? null,
          full_name: incident.reporter.full_name ?? null,
          email: incident.reporter.email ?? null,
          phone: incident.reporter.phone ?? null,
          barangay: incident.reporter.barangay ?? null,
          emergency_profile: null,
        }
      : null,
    media: media.map((item) => ({
      id: item.id,
      file_type: item.file_type,
      file_path: item.file_path,
      file_url: item.file_path,
      created_at: item.created_at ?? null,
    })),
    logs: logs.map((log) => ({
      id: log.id,
      changed_by: log.changed_by ?? null,
      changed_by_user: log.changed_by_user
        ? {
            full_name: log.changed_by_user.full_name ?? null,
          }
        : null,
      new_status: log.new_status,
      notes: log.notes ?? null,
      units_coordinated: Array.isArray(log.units_coordinated) ? log.units_coordinated : [],
      created_at: log.created_at ?? null,
    })),
  }
}

async function canAccessIncident(auth: AppEnv['Variables']['auth'], incidentId: string) {
  if (auth.user.role === 'admin') {
    return true
  }

  const { data, error } = await auth.supabase
    .from('incident_assignments')
    .select('incident_id')
    .eq('staff_id', auth.user.id)
    .eq('incident_id', incidentId)
    .maybeSingle()

  if (error) {
    console.warn('Incident assignment lookup failed.', error.message)
    return false
  }

  return Boolean(data)
}

async function loadIncidentDetail(auth: AppEnv['Variables']['auth'], incidentId: string) {
  const { data: incident, error: incidentError } = await auth.supabase
    .from('incidents')
    .select(`
      *,
      reporter:users!reporter_id(id,full_name,email,phone,barangay)
    `)
    .eq('id', incidentId)
    .maybeSingle()

  if (incidentError) {
    throw incidentError
  }

  if (!incident) {
    return null
  }

  const [{ data: media, error: mediaError }, { data: logs, error: logsError }] = await Promise.all([
    auth.supabase
      .from('incident_media')
      .select('id,file_path,file_type,created_at')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false }),
    auth.supabase
      .from('incident_logs')
      .select(`
        id,
        changed_by,
        new_status,
        notes,
        units_coordinated,
        created_at,
        changed_by_user:users!changed_by(full_name)
      `)
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false }),
  ])

  if (mediaError) {
    console.warn('Incident media lookup failed.', mediaError.message)
  }

  if (logsError) {
    console.warn('Incident logs lookup failed.', logsError.message)
  }

  return serializeIncident(incident, media ?? [], logs ?? [])
}

staffRoutes.get('/incidents', async (c) => {
  try {
    const auth = c.get('auth')
    const status = c.req.query('status')?.trim() || ''
    const { page, perPage, offset } = getPagination(c)

    if (auth.user.role === 'admin') {
      let countQuery = auth.supabase
        .from('incidents')
        .select('id', { count: 'exact', head: true })

      let rowsQuery = auth.supabase
        .from('incidents')
        .select(`
          *,
          reporter:users!reporter_id(id,full_name,email,phone,barangay)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + perPage - 1)

      if (status) {
        countQuery = countQuery.eq('status', status)
        rowsQuery = rowsQuery.eq('status', status)
      }

      const [{ count, error: countError }, { data, error }] = await Promise.all([countQuery, rowsQuery])

      if (countError) {
        throw countError
      }

      if (error) {
        throw error
      }

      return successResponse(c, {
        incidents: {
          data: (data ?? []).map((incident: any) => serializeIncident(incident)),
          current_page: page,
          per_page: perPage,
          total: count ?? 0,
          last_page: Math.max(1, Math.ceil((count ?? 0) / perPage)),
        },
      }, 'Staff incidents retrieved successfully.')
    }

    const { data: assignments, error: assignmentsError } = await auth.supabase
      .from('incident_assignments')
      .select('incident_id,assigned_at,created_at')
      .eq('staff_id', auth.user.id)
      .order('assigned_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (assignmentsError) {
      throw assignmentsError
    }

    const assignedIds = [...new Set((assignments ?? []).map((row: any) => row.incident_id).filter(Boolean))]

    if (assignedIds.length === 0) {
      return successResponse(c, {
        incidents: {
          data: [],
          current_page: 1,
          per_page: perPage,
          total: 0,
          last_page: 1,
        },
      }, 'Staff incidents retrieved successfully.')
    }

    let incidentsQuery = auth.supabase
      .from('incidents')
      .select(`
        *,
        reporter:users!reporter_id(id,full_name,email,phone,barangay)
      `)
      .in('id', assignedIds)

    if (status) {
      incidentsQuery = incidentsQuery.eq('status', status)
    }

    const { data: incidents, error } = await incidentsQuery

    if (error) {
      throw error
    }

    const orderMap = new Map(assignedIds.map((id, index) => [id, index]))
    const sorted = (incidents ?? []).sort(
      (left: any, right: any) => (orderMap.get(left.id) ?? 9999) - (orderMap.get(right.id) ?? 9999),
    )

    const total = sorted.length
    const paged = sorted.slice(offset, offset + perPage)

    return successResponse(c, {
      incidents: {
        data: paged.map((incident: any) => serializeIncident(incident)),
        current_page: page,
        per_page: perPage,
        total,
        last_page: Math.max(1, Math.ceil(total / perPage)),
      },
    }, 'Staff incidents retrieved successfully.')
  } catch (error) {
    console.error('Staff incidents query failed.', error)
    return errorResponse(c, 'Failed to fetch staff incidents.', {}, 500)
  }
})

staffRoutes.get('/incidents/:id', async (c) => {
  try {
    const auth = c.get('auth')
    const incidentId = c.req.param('id')

    if (!await canAccessIncident(auth, incidentId)) {
      return errorResponse(c, 'Incident not found.', {}, 404)
    }

    const incident = await loadIncidentDetail(auth, incidentId)

    if (!incident) {
      return errorResponse(c, 'Incident not found.', {}, 404)
    }

    return successResponse(c, {
      incident,
    }, 'Staff incident retrieved successfully.')
  } catch (error) {
    console.error('Staff incident detail failed.', error)
    return errorResponse(c, 'Failed to fetch incident.', {}, 500)
  }
})

staffRoutes.patch('/incidents/:id/status', async (c) => {
  try {
    const auth = c.get('auth')
    const incidentId = c.req.param('id')

    if (!await canAccessIncident(auth, incidentId)) {
      return errorResponse(c, 'Incident not found.', {}, 404)
    }

    const parsed = incidentStatusUpdateSchema.safeParse(await c.req.json().catch(() => ({})))

    if (!parsed.success) {
      return errorResponse(c, 'Validation failed.', parsed.error.flatten().fieldErrors, 422)
    }

    const { data: currentIncident, error: currentIncidentError } = await auth.supabase
      .from('incidents')
      .select('id,status,resolved_at')
      .eq('id', incidentId)
      .maybeSingle()

    if (currentIncidentError) {
      throw currentIncidentError
    }

    if (!currentIncident) {
      return errorResponse(c, 'Incident not found.', {}, 404)
    }

    const nextAllowed: Record<string, string> = {
      verified: 'under_assessment',
      under_assessment: 'responding',
      responding: 'resolved',
    }

    if (nextAllowed[currentIncident.status] !== parsed.data.status) {
      return errorResponse(c, 'Invalid incident status transition.', {
        status: ['The selected status is not allowed from the current incident state.'],
      }, 422)
    }

    const now = new Date().toISOString()

    const { error: updateError } = await auth.supabase
      .from('incidents')
      .update({
        status: parsed.data.status,
        resolved_at: parsed.data.status === 'resolved' ? now : null,
        updated_at: now,
      })
      .eq('id', incidentId)

    if (updateError) {
      throw updateError
    }

    const { error: logError } = await auth.supabase
      .from('incident_logs')
      .insert({
        id: crypto.randomUUID(),
        incident_id: incidentId,
        changed_by: auth.user.id,
        old_status: currentIncident.status,
        new_status: parsed.data.status,
        notes: parsed.data.notes,
        units_coordinated: parsed.data.units_coordinated,
        created_at: now,
        updated_at: now,
      })

    if (logError) {
      console.warn('Incident status log insert failed.', logError.message)
    }

    const incident = await loadIncidentDetail(auth, incidentId)

    return successResponse(c, {
      incident,
    }, 'Incident status updated successfully.')
  } catch (error) {
    console.error('Staff incident status update failed.', error)
    return errorResponse(c, 'Failed to update incident status.', {}, 500)
  }
})

staffRoutes.post('/tracking', async (c) => {
  try {
    const auth = c.get('auth')
    const parsed = trackingSchema.safeParse(await c.req.json().catch(() => ({})))

    if (!parsed.success) {
      return errorResponse(c, 'Validation failed.', parsed.error.flatten().fieldErrors, 422)
    }

    if (parsed.data.incident_id && !await canAccessIncident(auth, parsed.data.incident_id)) {
      return errorResponse(c, 'Incident not found.', {}, 404)
    }

    const now = new Date().toISOString()

    const { data: location, error } = await auth.supabase
      .from('responder_locations')
      .upsert({
        user_id: auth.user.id,
        incident_id: parsed.data.incident_id ?? null,
        action_status: parsed.data.action_status,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        accuracy: parsed.data.accuracy ?? null,
        heading: parsed.data.heading ?? null,
        recorded_at: now,
        updated_at: now,
      }, {
        onConflict: 'user_id',
      })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return successResponse(c, {
      location,
    }, 'Responder location updated successfully.')
  } catch (error) {
    console.error('Responder location update failed.', error)
    const message = error instanceof Error ? error.message : String(error ?? '')
    if (/does not exist|schema cache/i.test(message)) {
      return errorResponse(c, 'Responder tracking is temporarily unavailable due to a database configuration issue.', {}, 503)
    }
    return errorResponse(c, 'Failed to update responder location.', {}, 500)
  }
})

staffRoutes.post('/tracking/route-point', async (c) => {
  try {
    const auth = c.get('auth')
    const parsed = trackingSchema.safeParse(await c.req.json().catch(() => ({})))

    if (!parsed.success) {
      return errorResponse(c, 'Validation failed.', parsed.error.flatten().fieldErrors, 422)
    }

    if (parsed.data.incident_id && !await canAccessIncident(auth, parsed.data.incident_id)) {
      return errorResponse(c, 'Incident not found.', {}, 404)
    }

    const now = new Date().toISOString()

    const { error } = await auth.supabase
      .from('responder_status_logs')
      .insert({
        id: crypto.randomUUID(),
        user_id: auth.user.id,
        incident_id: parsed.data.incident_id ?? null,
        action_status: parsed.data.action_status,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        metadata: {
          kind: 'route_point',
          accuracy: parsed.data.accuracy ?? null,
          heading: parsed.data.heading ?? null,
        },
        created_at: now,
        updated_at: now,
      })

    if (error) {
      throw error
    }

    return successResponse(c, {
      logged: true,
    }, 'Responder route point logged successfully.')
  } catch (error) {
    console.error('Responder route point failed.', error)
    const message = error instanceof Error ? error.message : String(error ?? '')
    if (/does not exist|schema cache/i.test(message)) {
      return errorResponse(c, 'Responder tracking is temporarily unavailable due to a database configuration issue.', {}, 503)
    }
    return errorResponse(c, 'Failed to log responder route point.', {}, 500)
  }
})

staffRoutes.post('/tracking/health-log', async (c) => {
  try {
    const auth = c.get('auth')
    const parsed = healthLogSchema.safeParse(await c.req.json().catch(() => ({})))

    if (!parsed.success) {
      return errorResponse(c, 'Validation failed.', parsed.error.flatten().fieldErrors, 422)
    }

    if (parsed.data.incident_id && !await canAccessIncident(auth, parsed.data.incident_id)) {
      return errorResponse(c, 'Incident not found.', {}, 404)
    }

    const now = parsed.data.recorded_at || new Date().toISOString()

    const { error } = await auth.supabase
      .from('responder_status_logs')
      .insert({
        id: crypto.randomUUID(),
        user_id: auth.user.id,
        incident_id: parsed.data.incident_id ?? null,
        action_status: 'accepted_request',
        notes: `[${parsed.data.severity}] ${parsed.data.event_type}`,
        metadata: {
          kind: 'health_log',
          severity: parsed.data.severity,
          event_type: parsed.data.event_type,
          payload: parsed.data.payload,
        },
        created_at: now,
        updated_at: now,
      })

    if (error) {
      throw error
    }

    return successResponse(c, {
      logged: true,
    }, 'Responder health log recorded successfully.')
  } catch (error) {
    console.error('Responder health log failed.', error)
    const message = error instanceof Error ? error.message : String(error ?? '')
    if (/does not exist|schema cache/i.test(message)) {
      return errorResponse(c, 'Responder tracking is temporarily unavailable due to a database configuration issue.', {}, 503)
    }
    return errorResponse(c, 'Failed to record responder health log.', {}, 500)
  }
})

export default staffRoutes
