import { AlertTriangle, Clock3, Loader2, MapPinned, Radio, Route } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import ResponderMap from '../maps/ResponderMap'
import { api } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'
import { mergeLocationRows, responderActionLabel } from '../../lib/responderTracking'
import { subscribeToResponderHealthLogs, subscribeToResponderLocations, subscribeToResponderRoutePoints } from '../../lib/supabaseRealtime'

function toRad(deg) {
  return (deg * Math.PI) / 180
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  const brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

function bearingDiff(a, b) {
  const diff = Math.abs(((a - b + 540) % 360) - 180)
  return diff
}

function formatDistanceKm(km) {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`
  }
  return `${km.toFixed(2)} km`
}

function computeEtaRange(distanceKm, points) {
  if (points.length < 2 || distanceKm <= 0) {
    return null
  }

  const recent = points.slice(-6)
  let totalSpeed = 0
  let count = 0

  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]
    const curr = recent[i]
    const d = haversine(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
    const t = (new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000 / 3600
    if (t > 0) {
      totalSpeed += d / t
      count++
    }
  }

  if (count === 0) {
    return null
  }

  const avgSpeed = totalSpeed / count
  if (avgSpeed <= 0) {
    return null
  }

  const hours = distanceKm / avgSpeed
  const minutes = hours * 60
  return { low: Math.max(1, Math.floor(minutes * 0.8)), high: Math.ceil(minutes * 1.2) }
}

function computeDeviationMinutes(points, incidentLat, incidentLng) {
  if (points.length < 2 || incidentLat == null || incidentLng == null) {
    return 0
  }

  const targetBearing = bearing(
    points[points.length - 1].latitude,
    points[points.length - 1].longitude,
    incidentLat,
    incidentLng,
  )

  let consecutive = 0
  for (let i = Math.max(0, points.length - 12); i < points.length; i++) {
    const pt = points[i]
    if (pt.heading != null && bearingDiff(pt.heading, targetBearing) > 45) {
      consecutive++
    } else {
      consecutive = 0
    }
  }

  const oldest = points[Math.max(0, points.length - 12)]
  const newest = points[points.length - 1]
  const spanMinutes = (new Date(newest.recorded_at).getTime() - new Date(oldest.recorded_at).getTime()) / 1000 / 60

  if (spanMinutes >= 2 && consecutive >= 6) {
    return spanMinutes
  }

  return 0
}

function AdminResponderTrackingMap() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [selectedResponderId, setSelectedResponderId] = useState(null)
  const [routePoints, setRoutePoints] = useState([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [criticalResponders, setCriticalResponders] = useState(new Set())

  useEffect(() => {
    let active = true

    const loadLocations = async () => {
      setLoading(true)
      try {
        const response = await api.get('/api/v1/admin/responders/locations', { cacheTtl: 5000 })
        if (active) {
          setLocations(response.data?.data?.locations ?? [])
          setUpdatedAt(new Date())
        }
      } catch (error) {
        toast.error(parseApiError(error).message, { id: 'responder-locations-error' })
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadLocations()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let cleanup = () => {}
    let active = true

    subscribeToResponderLocations({
      onChange: (payload) => {
        const row = payload.new ?? payload.old
        if (!row || !active) {
          return
        }

        setLocations((current) => mergeLocationRows(current, row))
        setUpdatedAt(new Date())
      },
      onError: (error) => {
        toast.error(error?.message ?? 'Supabase realtime subscription failed.', { id: 'responder-realtime-error' })
      },
    }).then((unsubscribe) => {
      cleanup = unsubscribe
    })

    return () => {
      active = false
      cleanup()
    }
  }, [])

  useEffect(() => {
    let cleanup = () => {}
    let active = true

    subscribeToResponderHealthLogs({
      onChange: (payload) => {
        const row = payload.new
        if (!row || !active) {
          return
        }
        if (row.severity === 'critical') {
          setCriticalResponders((prev) => new Set([...prev, row.responder_id]))
        }
      },
      onError: () => {},
    }).then((unsubscribe) => {
      cleanup = unsubscribe
    })

    return () => {
      active = false
      cleanup()
    }
  }, [])

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.responder_id === selectedResponderId) ?? null,
    [selectedResponderId, locations],
  )

  const loadRoutePoints = useCallback(async (responderId, incidentId) => {
    if (!responderId || !incidentId) {
      setRoutePoints([])
      return
    }
    setRouteLoading(true)
    try {
      const response = await api.get(`/api/v1/admin/responders/${responderId}/routes?incident_id=${incidentId}`)
      setRoutePoints(response.data?.data?.points ?? [])
    } catch (error) {
      toast.error(parseApiError(error).message, { id: 'route-load-error' })
      setRoutePoints([])
    } finally {
      setRouteLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedLocation?.incident?.id) {
      loadRoutePoints(selectedLocation.responder_id, selectedLocation.incident.id)
    } else {
      setRoutePoints([])
    }
  }, [selectedLocation, loadRoutePoints])

  useEffect(() => {
    let cleanup = () => {}
    let active = true

    if (selectedLocation?.responder_id && selectedLocation?.incident?.id) {
      subscribeToResponderRoutePoints({
        filter: `responder_id=eq.${selectedLocation.responder_id}`,
        onChange: (payload) => {
          if (!active) return
          const row = payload.new
          if (row?.incident_id === selectedLocation.incident.id) {
            setRoutePoints((current) => {
              if (current.some((p) => p.id === row.id)) return current
              return [...current, row].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
            })
          }
        },
        onError: () => {},
      }).then((unsubscribe) => {
        cleanup = unsubscribe
      })
    }

    return () => {
      active = false
      cleanup()
    }
  }, [selectedLocation?.responder_id, selectedLocation?.incident?.id])

  const routeMetrics = useMemo(() => {
    if (!selectedLocation || !routePoints.length || selectedLocation.incident == null) {
      return null
    }
    const current = routePoints[routePoints.length - 1]
    const incidentLat = selectedLocation.incident.latitude
    const incidentLng = selectedLocation.incident.longitude
    if (current == null || incidentLat == null || incidentLng == null) {
      return null
    }

    const distanceKm = haversine(current.latitude, current.longitude, incidentLat, incidentLng)
    const eta = computeEtaRange(distanceKm, routePoints)
    const deviationMinutes = computeDeviationMinutes(routePoints, incidentLat, incidentLng)

    return { distanceKm, eta, deviationMinutes }
  }, [selectedLocation, routePoints])

  const activeLocations = useMemo(
    () => locations.filter((location) => location.action_status !== 'cancelled' && location.action_status !== 'resolved'),
    [locations],
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-danger">
              <Radio className="h-4 w-4" />
              Live Responder Tracking
            </p>
            <h2 className="mt-1 text-xl font-semibold text-navy">Responder locations</h2>
            <p className="mt-1 text-sm text-slate-500">Supabase Realtime updates marker positions as responders report movement and action status.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Waiting for data'}
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="h-[520px]">
          <ResponderMap
            locations={locations}
            routePoints={routePoints}
            incident={selectedLocation?.incident ?? null}
            height={520}
          />
        </div>
        <aside className="max-h-[520px] overflow-y-auto border-t border-slate-200 p-4 xl:border-l xl:border-t-0">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-panel px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Tracked</p>
              <p className="text-lg font-semibold text-navy">{locations.length}</p>
            </div>
            <div className="rounded-xl bg-panel px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Active</p>
              <p className="text-lg font-semibold text-navy">{activeLocations.length}</p>
            </div>
          </div>

          {selectedResponderId && routeMetrics && (
            <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-panel p-3">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-info" />
                <p className="text-xs font-semibold text-navy">Route to incident</p>
              </div>
              <p className="text-xs text-slate-600">
                Remaining: <span className="font-semibold">{formatDistanceKm(routeMetrics.distanceKm)}</span>
              </p>
              {routeMetrics.eta && (
                <p className="text-xs text-slate-600">
                  ETA: <span className="font-semibold">{routeMetrics.eta.low}–{routeMetrics.eta.high} min</span>
                </p>
              )}
              {routeMetrics.deviationMinutes > 0 && (
                <p className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  Off route ({Math.round(routeMetrics.deviationMinutes)} min)
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Loading responder locations...
            </div>
          ) : locations.length ? (
            <div className="space-y-2">
              {locations.map((location) => {
                const isSelected = location.responder_id === selectedResponderId
                const isCritical = criticalResponders.has(location.responder_id)

                return (
                  <article
                    key={location.id ?? location.responder_id}
                    onClick={() => setSelectedResponderId(isSelected ? null : location.responder_id)}
                    className={`cursor-pointer rounded-xl border p-3 transition ${isSelected ? 'border-info bg-blue-50/60' : 'border-slate-200 bg-panel hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start gap-2">
                      <MapPinned className={`mt-0.5 h-4 w-4 shrink-0 ${isCritical ? 'text-danger' : 'text-info'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-navy">{location.responder?.full_name ?? 'Responder'}</p>
                          {isCritical && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                              Offline
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-slate-600">{responderActionLabel(location.action_status)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {location.incident?.reference_code ? `Incident ${location.incident.reference_code}` : 'No active incident linked'}
                        </p>
                        {location.recorded_at ? (
                          <p className="mt-1 text-xs text-slate-400">{new Date(location.recorded_at).toLocaleString()}</p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No responders have shared a location yet.
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export default AdminResponderTrackingMap
