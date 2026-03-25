import { haversineKilometers } from './responderOptimizer'

export const HISTORY_DAYS = 7

export function statusConfig(status) {
  switch (status) {
    case 'alert':
      return {
        label: 'Alert',
        badgeClass: 'border-danger/20 bg-danger/10 text-danger',
        cardClass: 'border-danger/40 bg-danger/5 shadow-[0_0_0_1px_rgba(220,38,38,0.08)] animate-pulse',
      }
    case 'online':
      return {
        label: 'Online',
        badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        cardClass: 'border-emerald-100',
      }
    case 'inactive':
      return {
        label: 'Inactive',
        badgeClass: 'border-slate-200 bg-slate-100 text-slate-600',
        cardClass: 'border-slate-200',
      }
    default:
      return {
        label: 'Offline',
        badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
        cardClass: 'border-amber-100',
      }
  }
}

export function formatBattery(level) {
  if (level === null || level === undefined) {
    return 'Unavailable'
  }

  return `${Number(level).toFixed(0)}%`
}

export function buildPossibleMatches(devices, activeIncidents) {
  const matches = {}

  devices.forEach((device) => {
    if (!device.open_alert_incident) {
      matches[device.id] = null
      return
    }

    const nearest = activeIncidents
      .filter((incident) => incident.id !== device.open_alert_incident.id)
      .map((incident) => ({
        ...incident,
        distanceMeters: haversineKilometers(
          Number(device.latitude),
          Number(device.longitude),
          Number(incident.latitude),
          Number(incident.longitude),
        ) * 1000,
      }))
      .filter((incident) => incident.distanceMeters <= 200)
      .sort((left, right) => left.distanceMeters - right.distanceMeters)[0] ?? null

    matches[device.id] = nearest
  })

  return matches
}

export function buildHistorySeries(selectedDevice, historyWindowDays = HISTORY_DAYS) {
  const today = new Date()
  const rows = Array.from({ length: historyWindowDays }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (historyWindowDays - index - 1))
    const key = date.toISOString().slice(0, 10)

    return {
      date: key,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      alerts: 0,
    }
  })

  if (!selectedDevice?.alert_events?.length) {
    return rows
  }

  const counts = selectedDevice.alert_events.reduce((accumulator, incident) => {
    const key = String(incident.created_at ?? '').slice(0, 10)
    accumulator[key] = (accumulator[key] ?? 0) + 1
    return accumulator
  }, {})

  return rows.map((row) => ({
    ...row,
    alerts: counts[row.date] ?? 0,
  }))
}
