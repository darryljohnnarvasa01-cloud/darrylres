import { Hono } from 'hono'
import { requireAuth } from '../services/auth'
import type { AppEnv } from '../types'
import { errorResponse, successResponse } from '../utils/apiResponse'

const adminRoutes = new Hono<AppEnv>()

const activeStatuses = [
  'pending_verification',
  'verified',
  'under_assessment',
  'responding',
  'on_scene',
  'handoff',
]

const responseStatuses = [
  'under_assessment',
  'responding',
  'on_scene',
  'handoff',
  'resolved',
  'unable_to_locate',
  'false_alarm_confirmed',
]

function isAdmin(user: Record<string, any>) {
  return user.role === 'admin' || user.role === 'staff'
}

adminRoutes.use('*', requireAuth)
adminRoutes.use('*', async (c, next) => {
  if (!isAdmin(c.get('auth').user)) {
    return errorResponse(c, 'You are not allowed to access admin resources.', {}, 403)
  }

  await next()
})

function extractBarangay(addressLabel?: string | null) {
  return String(addressLabel || '').split(',').map((part) => part.trim()).filter(Boolean)[0] || 'Unknown'
}

function severityForIncident(incident: Record<string, any>) {
  const risk = Number(incident.ai_risk_score ?? 0)

  if (risk >= 80 || incident.type === 'fire') {
    return { severity: 'critical', severity_weight: 4, severity_score: Math.max(risk, 80) }
  }

  if (risk >= 60 || ['medical', 'crime'].includes(incident.type)) {
    return { severity: 'high', severity_weight: 3, severity_score: Math.max(risk, 60) }
  }

  if (risk >= 30 || ['flood', 'accident'].includes(incident.type)) {
    return { severity: 'medium', severity_weight: 2, severity_score: Math.max(risk, 30) }
  }

  return { severity: 'low', severity_weight: 1, severity_score: risk }
}

function serializeIncidentSummary(incident: Record<string, any>) {
  return {
    id: incident.id,
    reference_code: incident.reference_code,
    type: incident.type,
    status: incident.status,
    is_guest: Boolean(incident.is_guest),
    source: incident.source,
    contact_phone: incident.contact_phone,
    latitude: Number(incident.latitude),
    longitude: Number(incident.longitude),
    address_label: incident.address_label,
    barangay: extractBarangay(incident.address_label),
    description: incident.description,
    is_iot_generated: Boolean(incident.is_iot_generated),
    device_id: incident.device_id,
    ai_risk_score: Number(incident.ai_risk_score ?? 0),
    incident_datetime: incident.incident_datetime,
    created_at: incident.created_at,
    resolved_at: incident.resolved_at,
    reporter: incident.reporter_id ? {
      id: incident.reporter_id,
      full_name: incident.reporter_name ?? null,
      email: incident.reporter_email ?? null,
      phone: incident.reporter_phone ?? null,
      barangay: incident.reporter_barangay ?? null,
    } : null,
    assigned_responder: incident.assigned_responder ?? null,
    latestAssignment: null,
    assignments: [],
  }
}

async function countRows(
  table: ReturnType<AppEnv['Variables']['auth']['supabase']['from']>,
  applyFilters?: (query: any) => any,
) {
  let query = table.select('id', { count: 'exact', head: true })

  if (applyFilters) {
    query = applyFilters(query)
  }

  const { count, error } = await query

  if (error) {
    console.warn('Count query failed.', error.message)
  }

  return count ?? 0
}

async function incidentRows(auth: AppEnv['Variables']['auth'], {
  statuses = null,
  limit = 50,
}: {
  statuses?: string[] | null
  limit?: number
} = {}) {
  let query = auth.supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (statuses?.length) {
    query = query.in('status', statuses)
  }

  const { data, error } = await query

  if (error) {
    console.warn('Incident query failed.', error.message)
  }

  return data ?? []
}

async function buildKpis(auth: AppEnv['Variables']['auth']) {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const [
    activeIncidents,
    pendingVerification,
    resolvedToday,
    pendingAssignments,
    totalToday,
    resolvedThisMonth,
  ] = await Promise.all([
    countRows(auth.supabase.from('incidents'), (query) => query.in('status', activeStatuses)),
    countRows(auth.supabase.from('incidents'), (query) => query.eq('status', 'pending_verification')),
    countRows(auth.supabase.from('incidents'), (query) => query.eq('status', 'resolved').gte('resolved_at', todayStart.toISOString())),
    countRows(auth.supabase.from('incidents'), (query) => query.in('status', activeStatuses)),
    countRows(auth.supabase.from('incidents'), (query) => query.gte('created_at', todayStart.toISOString())),
    countRows(auth.supabase.from('incidents'), (query) => query.eq('status', 'resolved').gte('resolved_at', monthStart.toISOString())),
  ])

  return {
    active_incidents: activeIncidents,
    avg_response_minutes: 0,
    resolved_today: resolvedToday,
    pending_assignments: pendingAssignments,
    total_today: totalToday,
    pending_verification: pendingVerification,
    active_responding: activeIncidents - pendingVerification,
    resolved_this_month: resolvedThisMonth,
    avg_response_hours: 0,
    refreshed_at: new Date().toISOString(),
  }
}

async function buildNavigationCounts(auth: AppEnv['Variables']['auth']) {
  const [incidents, registrations, notifications] = await Promise.all([
    countRows(auth.supabase.from('incidents'), (query) => query.in('status', activeStatuses)),
    countRows(auth.supabase.from('users'), (query) => query.eq('role', 'citizen').eq('status', 'pending')),
    countRows(auth.supabase.from('notifications'), (query) => query.eq('is_read', false)),
  ])

  return {
    incidents,
    registrations,
    notifications,
  }
}

async function buildResponders(auth: AppEnv['Variables']['auth']) {
  const { data, error } = await auth.supabase
    .from('users')
    .select('id,full_name,barangay,current_latitude,current_longitude,location_updated_at,availability_status,availability_updated_at')
    .eq('role', 'staff')
    .eq('status', 'verified')
    .order('full_name', { ascending: true })
    .limit(50)

  if (error) {
    console.warn('Responder query failed.', error.message)
  }

  return (data ?? []).map((staff) => {
    const lastSeenAt = staff.location_updated_at || staff.availability_updated_at || null
    const online = lastSeenAt
      ? Date.now() - new Date(lastSeenAt).getTime() <= 10 * 60 * 1000
      : false

    return {
      id: staff.id,
      full_name: staff.full_name,
      barangay: staff.barangay,
      current_latitude: staff.current_latitude,
      current_longitude: staff.current_longitude,
      location_updated_at: staff.location_updated_at,
      availability_status: staff.availability_status || 'available',
      current_assignment_count: 0,
      online,
      status: online ? 'online' : 'offline',
      last_seen_at: lastSeenAt,
    }
  })
}

async function buildCommandCenter(auth: AppEnv['Variables']['auth']) {
  const [kpis, rows, responders, navigationCounts, notificationUnreadCount] = await Promise.all([
    buildKpis(auth),
    incidentRows(auth, { statuses: activeStatuses, limit: 50 }),
    buildResponders(auth),
    buildNavigationCounts(auth),
    countRows(auth.supabase.from('notifications'), (query) => query.eq('is_read', false)),
  ])
  const summaries = rows.map(serializeIncidentSummary)
  const liveFeed = rows.slice(0, 10).map((incident) => {
    const severity = severityForIncident(incident)

    return {
      ...serializeIncidentSummary(incident),
      ...severity,
      reporter: {
        full_name: incident.reporter_name ?? null,
      },
    }
  })

  return {
    kpis,
    map_incidents: summaries,
    live_feed: liveFeed,
    responders,
    navigation_counts: navigationCounts,
    notification_unread_count: notificationUnreadCount,
  }
}

adminRoutes.get('/dashboard/command-center', async (c) => {
  return successResponse(c, await buildCommandCenter(c.get('auth')), 'Command center data retrieved successfully.')
})

adminRoutes.get('/ai-risk-board', async (c) => {
  const auth = c.get('auth')
  const page = Math.max(1, Number(c.req.query('page') || 1) || 1)
  const perPage = Math.min(100, Math.max(1, Number(c.req.query('per_page') || 20) || 20))
  const from = (page - 1) * perPage
  const to = from + perPage - 1
  const countQuery = auth.supabase
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .gte('ai_risk_score', 70)
  const rowsQuery = auth.supabase
    .from('incidents')
    .select('*')
    .gte('ai_risk_score', 70)
    .order('ai_risk_score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)
  const [{ count, error: countError }, { data, error: rowsError }] = await Promise.all([
    countQuery,
    rowsQuery,
  ])

  if (countError) {
    console.warn('AI risk count query failed.', countError.message)
  }

  if (rowsError) {
    console.warn('AI risk board query failed.', rowsError.message)
  }

  const total = count ?? 0

  return successResponse(c, {
    incidents: {
      data: (data ?? []).map(serializeIncidentSummary),
      current_page: page,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      per_page: perPage,
      total,
      prev_page_url: page > 1 ? `/api/v1/admin/ai-risk-board?page=${page - 1}&per_page=${perPage}` : null,
      next_page_url: to + 1 < total ? `/api/v1/admin/ai-risk-board?page=${page + 1}&per_page=${perPage}` : null,
    },
  }, 'AI risk board retrieved successfully.')
})

adminRoutes.get('/navigation-counts', async (c) => {
  return successResponse(c, await buildNavigationCounts(c.get('auth')), 'Navigation counts retrieved successfully.')
})

adminRoutes.get('/kpis', async (c) => {
  return successResponse(c, await buildKpis(c.get('auth')), 'KPIs retrieved successfully.')
})

adminRoutes.get('/staff', async (c) => {
  return successResponse(c, {
    staff: await buildResponders(c.get('auth')),
  }, 'Staff retrieved successfully.')
})

adminRoutes.get('/incidents/map', async (c) => {
  const rows = await incidentRows(c.get('auth'), { limit: 100 })

  return successResponse(c, {
    incidents: rows.map(serializeIncidentSummary),
  }, 'Incident map data retrieved successfully.')
})

adminRoutes.get('/incidents', async (c) => {
  const rows = await incidentRows(c.get('auth'), { limit: 25 })

  return successResponse(c, {
    incidents: {
      data: rows.map(serializeIncidentSummary),
      current_page: 1,
      prev_page_url: null,
      next_page_url: null,
    },
  }, 'Incidents retrieved successfully.')
})

adminRoutes.get('/incidents/triage-board', async (c) => {
  try {
    const auth = c.get('auth')
    const supabase = auth.supabase

    const statusLimits: Record<string, number> = {
      pending_verification: 50,
      verified: 50,
      under_assessment: 50,
      responding: 50,
      resolved: 30,
    }

    const { data: incidents, error } = await supabase
      .from('incidents')
      .select(`
        id,
        reference_code,
        reporter_id,
        is_guest,
        type,
        latitude,
        longitude,
        address_label,
        status,
        ai_risk_score,
        created_at,
        reporter:users(id,full_name,barangay),
        latestAssignment:assignments(id,staff_id,staff:users(id,full_name,barangay,role,status))
      `)
      .in('status', Object.keys(statusLimits))
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('Triage board query error:', error)
      return errorResponse(c, 'Failed to fetch triage board data', {}, 500)
    }

    const incidentsByStatus: Record<string, any[]> = {}
    Object.keys(statusLimits).forEach((status) => {
      incidentsByStatus[status] = []
    })

    incidents?.forEach((incident) => {
      const status = incident.status
      if (incidentsByStatus[status] && incidentsByStatus[status].length < statusLimits[status]) {
        incidentsByStatus[status].push(incident)
      }
    })

    const orderedIncidents = [
      ...incidentsByStatus.pending_verification,
      ...incidentsByStatus.verified,
      ...incidentsByStatus.under_assessment,
      ...incidentsByStatus.responding,
      ...incidentsByStatus.resolved,
    ]

    return successResponse(c, {
      incidents: {
        data: orderedIncidents.map((incident) => ({
          id: incident.id,
          reference_code: incident.reference_code,
          type: incident.type,
          status: incident.status,
          is_guest: incident.is_guest,
          latitude: Number(incident.latitude),
          longitude: Number(incident.longitude),
          address_label: incident.address_label,
          barangay: extractBarangay(incident.address_label),
          ai_risk_score: Number(incident.ai_risk_score ?? 0),
          created_at: incident.created_at,
          reporter: incident.reporter ? {
            id: incident.reporter.id,
            full_name: incident.reporter.full_name,
            barangay: incident.reporter.barangay,
          } : null,
          latestAssignment: incident.latestAssignment,
        })),
      },
    }, 'Triage board incidents retrieved successfully.')
  } catch (err) {
    console.error('Triage board error:', err)
    return errorResponse(c, 'Failed to fetch triage board', {}, 500)
  }
})

adminRoutes.get('/hazard-zones', async (c) => {
  try {
    const auth = c.get('auth')
    const supabase = auth.supabase
    const includeInactive = c.req.query('include_inactive') === 'true'

    let query = supabase
      .from('hazard_zones')
      .select('*')
      .order('type')
      .order('name')

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data: zones, error } = await query

    if (error) {
      console.error('Hazard zones query error:', error)
      return errorResponse(c, 'Failed to fetch hazard zones', {}, 500)
    }

    return successResponse(c, {
      hazard_zones: (zones ?? []).map((zone) => ({
        id: zone.id,
        name: zone.name,
        type: zone.type,
        polygon: zone.polygon,
        description: zone.description,
        capacity: zone.capacity,
        current_occupancy: zone.current_occupancy,
        facilities: zone.facilities,
        is_active: zone.is_active,
        created_at: zone.created_at,
      })),
    }, 'Hazard zones retrieved successfully.')
  } catch (err) {
    console.error('Hazard zones error:', err)
    return errorResponse(c, 'Failed to fetch hazard zones', {}, 500)
  }
})

adminRoutes.post('/hazard-zones', async (c) => {
  try {
    const auth = c.get('auth')
    const supabase = auth.supabase
    const body = await c.req.json()

    const { data: zone, error } = await supabase
      .from('hazard_zones')
      .insert({
        name: body.name,
        type: body.type,
        polygon: body.polygon,
        description: body.description,
        capacity: body.capacity,
        current_occupancy: body.current_occupancy ?? 0,
        facilities: body.facilities ?? [],
        is_active: body.is_active !== false,
      })
      .select()
      .single()

    if (error) {
      console.error('Hazard zone creation error:', error)
      return errorResponse(c, 'Failed to create hazard zone', {}, 500)
    }

    return successResponse(c, {
      hazard_zone: {
        id: zone.id,
        name: zone.name,
        type: zone.type,
        polygon: zone.polygon,
        description: zone.description,
        capacity: zone.capacity,
        current_occupancy: zone.current_occupancy,
        facilities: zone.facilities,
        is_active: zone.is_active,
        created_at: zone.created_at,
      },
    }, 'Hazard zone created successfully.', 201)
  } catch (err) {
    console.error('Hazard zone creation error:', err)
    return errorResponse(c, 'Failed to create hazard zone', {}, 500)
  }
})

adminRoutes.patch('/hazard-zones/:id', async (c) => {
  try {
    const auth = c.get('auth')
    const supabase = auth.supabase
    const zoneId = c.req.param('id')
    const body = await c.req.json()

    const updateData: Record<string, any> = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.type !== undefined) updateData.type = body.type
    if (body.polygon !== undefined) updateData.polygon = body.polygon
    if (body.description !== undefined) updateData.description = body.description
    if (body.capacity !== undefined) updateData.capacity = body.capacity
    if (body.current_occupancy !== undefined) updateData.current_occupancy = body.current_occupancy
    if (body.facilities !== undefined) updateData.facilities = body.facilities
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data: zone, error } = await supabase
      .from('hazard_zones')
      .update(updateData)
      .eq('id', zoneId)
      .select()
      .single()

    if (error) {
      console.error('Hazard zone update error:', error)
      return errorResponse(c, 'Failed to update hazard zone', {}, 500)
    }

    return successResponse(c, {
      hazard_zone: {
        id: zone.id,
        name: zone.name,
        type: zone.type,
        polygon: zone.polygon,
        description: zone.description,
        capacity: zone.capacity,
        current_occupancy: zone.current_occupancy,
        facilities: zone.facilities,
        is_active: zone.is_active,
        created_at: zone.created_at,
      },
    }, 'Hazard zone updated successfully.')
  } catch (err) {
    console.error('Hazard zone update error:', err)
    return errorResponse(c, 'Failed to update hazard zone', {}, 500)
  }
})

adminRoutes.delete('/hazard-zones/:id', async (c) => {
  try {
    const auth = c.get('auth')
    const supabase = auth.supabase
    const zoneId = c.req.param('id')

    const { error } = await supabase
      .from('hazard_zones')
      .delete()
      .eq('id', zoneId)

    if (error) {
      console.error('Hazard zone deletion error:', error)
      return errorResponse(c, 'Failed to delete hazard zone', {}, 500)
    }

    return successResponse(c, {
      deleted: true,
    }, 'Hazard zone deleted successfully.')
  } catch (err) {
    console.error('Hazard zone deletion error:', err)
    return errorResponse(c, 'Failed to delete hazard zone', {}, 500)
  }
})

export default adminRoutes
