import { api } from './api'

export const RESPONDER_ACTIONS = [
  { value: 'accepted_request', label: 'Accepted request', incidentStatus: 'under_assessment' },
  { value: 'on_the_way', label: 'On the way', incidentStatus: 'responding' },
  { value: 'arrived', label: 'Arrived', incidentStatus: null },
  { value: 'resolved', label: 'Resolved', incidentStatus: 'resolved' },
  { value: 'cancelled', label: 'Cancelled', incidentStatus: null },
]

export function responderActionLabel(value) {
  return RESPONDER_ACTIONS.find((action) => action.value === value)?.label ?? 'Awaiting update'
}

export function normalizeResponderLocation(row) {
  if (!row) {
    return null
  }

  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracy: row.accuracy === null || row.accuracy === undefined ? null : Number(row.accuracy),
    heading: row.heading === null || row.heading === undefined ? null : Number(row.heading),
  }
}

export function mergeLocationRows(rows, nextRow) {
  const normalized = normalizeResponderLocation(nextRow)

  if (!normalized?.responder_id) {
    return rows
  }

  const found = rows.some((row) => row.responder_id === normalized.responder_id)

  if (!found) {
    return [normalized, ...rows]
  }

  return rows.map((row) => (row.responder_id === normalized.responder_id ? { ...row, ...normalized } : row))
}

const HEALTH_EVENT_MESSAGES = {
  gps_degraded: (payload) => `GPS accuracy degraded to ${payload?.accuracy ? `${Math.round(payload.accuracy)} m` : 'unknown'}`,
  gps_timeout: () => 'GPS fix timed out or watchPosition errored',
  offline_transition: () => 'Device went offline while on active incident',
  online_recovery: () => 'Device connectivity recovered',
  battery_critical: (payload) => `Battery critical at ${payload?.battery_level ? `${Math.round(payload.battery_level * 100)}%` : 'unknown'}`,
  sync_failed: () => 'Offline sync attempt failed and is queued for retry',
  location_stale: () => 'No location update received for over 5 minutes',
  heading_jump: (payload) => `Heading jumped ${payload?.delta ? `${Math.round(payload.delta)}°` : 'sharply'} between consecutive points`,
  accuracy_dropped: (payload) => `Accuracy worsened by ${payload?.percent ? `${Math.round(payload.percent)}%` : 'a large margin'}`,
}

export function healthEventMessage(eventType, payload) {
  const formatter = HEALTH_EVENT_MESSAGES[eventType]
  return formatter ? formatter(payload) : 'Health event occurred'
}

export function postHealthLog(eventType, severity, payload = {}, incidentId = null) {
  const body = {
    event_type: eventType,
    severity,
    payload,
    recorded_at: new Date().toISOString(),
  }
  if (incidentId) {
    body.incident_id = incidentId
  }

  api.post('/api/v1/staff/tracking/health-log', body).catch(() => {
    // Silently fail; health logging is non-critical telemetry
  })
}

let routePointThrottleTimer = null
let routePointPending = null

export function scheduleRoutePoint(latitude, longitude, accuracy, heading, actionStatus, incidentId) {
  routePointPending = { latitude, longitude, accuracy, heading, action_status: actionStatus, incident_id: incidentId }
}

export function startRoutePointThrottle(intervalMs = 12000) {
  if (routePointThrottleTimer) {
    return
  }

  routePointThrottleTimer = setInterval(() => {
    if (!routePointPending) {
      return
    }

    const body = { ...routePointPending }
    routePointPending = null

    api.post('/api/v1/staff/tracking/route-point', body).catch(() => {
      // Silently fail; route logging is best-effort
    })
  }, intervalMs)
}

export function stopRoutePointThrottle() {
  if (routePointThrottleTimer) {
    clearInterval(routePointThrottleTimer)
    routePointThrottleTimer = null
  }
  routePointPending = null
}
