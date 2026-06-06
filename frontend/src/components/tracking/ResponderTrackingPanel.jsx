import { Crosshair, Loader2, Radio } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ResponderMap from '../maps/ResponderMap'
import { api } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'
import {
  postHealthLog,
  scheduleRoutePoint,
  startRoutePointThrottle,
  stopRoutePointThrottle,
} from '../../lib/responderTracking'
import { subscribeToResponderLocations } from '../../lib/supabaseRealtime'
import { useAuth } from '../../context/AuthContext'

const LIVE_ACTION_STATUS = 'accepted_request'
const LOCATION_SYNC_INTERVAL_MS = 10000
const LOCATION_SYNC_MIN_DISTANCE_METERS = 8

function locationFromPosition(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
    heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
  }
}

function distanceMeters(a, b) {
  if (!a || !b) {
    return Number.POSITIVE_INFINITY
  }

  const metersPerDegreeLat = 111_320
  const metersPerDegreeLng = 111_320 * Math.cos((a.latitude * Math.PI) / 180)
  const dLat = (a.latitude - b.latitude) * metersPerDegreeLat
  const dLng = (a.longitude - b.longitude) * metersPerDegreeLng

  return Math.sqrt((dLat * dLat) + (dLng * dLng))
}

function ResponderTrackingPanel({ incident }) {
  const { user } = useAuth()
  const [deviceLocation, setDeviceLocation] = useState(null)
  const [lastSharedLocation, setLastSharedLocation] = useState(null)
  const [watching, setWatching] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [syncing, setSyncing] = useState(false)

  const prevLocationRef = useRef(null)
  const lastSyncAtRef = useRef(0)
  const lastSyncedLocationRef = useRef(null)
  const syncInFlightRef = useRef(false)
  const wasOfflineRef = useRef(false)
  const batteryCriticalRef = useRef(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.')
      return undefined
    }

    setWatching(true)
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setDeviceLocation(locationFromPosition(position))
        setGeoError('')
      },
      (error) => {
        setGeoError(error.message || 'Unable to read current location.')
        setWatching(false)
        postHealthLog('gps_timeout', 'warning', { code: error.code, message: error.message }, incident?.id)
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      setWatching(false)
    }
  }, [incident?.id])

  useEffect(() => {
    const responderId = user?.id

    if (!responderId) {
      return undefined
    }

    let cleanup = () => {}
    let active = true

    subscribeToResponderLocations({
      filter: `responder_id=eq.${responderId}`,
      onChange: (payload) => {
        if (active && payload.new) {
          setLastSharedLocation(payload.new)
        }
      },
    }).then((unsubscribe) => {
      cleanup = unsubscribe
    })

    return () => {
      active = false
      cleanup()
    }
  }, [user?.id])

  useEffect(() => {
    if (!deviceLocation) {
      return
    }

    const prev = prevLocationRef.current

    if (deviceLocation.accuracy === null || deviceLocation.accuracy > 50) {
      postHealthLog(
        'gps_degraded',
        'warning',
        { accuracy: deviceLocation.accuracy },
        incident?.id,
      )
    }

    if (prev && deviceLocation.heading !== null && prev.heading !== null) {
      const delta = Math.abs(((deviceLocation.heading - prev.heading + 540) % 360) - 180)
      if (delta > 120) {
        postHealthLog('heading_jump', 'warning', { delta, from: prev.heading, to: deviceLocation.heading }, incident?.id)
      }
    }

    if (prev && deviceLocation.accuracy !== null && prev.accuracy !== null && prev.accuracy > 0) {
      const percentChange = ((deviceLocation.accuracy - prev.accuracy) / prev.accuracy) * 100
      if (percentChange > 300) {
        postHealthLog('accuracy_dropped', 'info', { percent: percentChange, from: prev.accuracy, to: deviceLocation.accuracy }, incident?.id)
      }
    }

    prevLocationRef.current = deviceLocation
  }, [deviceLocation, incident?.id])

  useEffect(() => {
    const handleOnline = () => {
      if (wasOfflineRef.current) {
        postHealthLog('online_recovery', 'info', {}, incident?.id)
        wasOfflineRef.current = false
      }
    }
    const handleOffline = () => {
      if (incident?.id) {
        postHealthLog('offline_transition', 'critical', {}, incident.id)
        wasOfflineRef.current = true
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [incident?.id])

  useEffect(() => {
    if (!navigator.getBattery) {
      return undefined
    }

    let batteryRef = null

    const handleBatteryChange = () => {
      if (!batteryRef) {
        return
      }
      const level = batteryRef.level
      const isCritical = level <= 0.15
      if (isCritical && !batteryCriticalRef.current) {
        postHealthLog('battery_critical', 'warning', { battery_level: level }, incident?.id)
        batteryCriticalRef.current = true
      } else if (!isCritical) {
        batteryCriticalRef.current = false
      }
    }

    navigator.getBattery().then((battery) => {
      batteryRef = battery
      battery.addEventListener('levelchange', handleBatteryChange)
      handleBatteryChange()
    })

    return () => {
      if (batteryRef) {
        batteryRef.removeEventListener('levelchange', handleBatteryChange)
      }
    }
  }, [incident?.id])

  useEffect(() => {
    if (incident?.id && deviceLocation) {
      startRoutePointThrottle(12000)
    } else {
      stopRoutePointThrottle()
    }

    return () => {
      stopRoutePointThrottle()
    }
  }, [incident?.id, deviceLocation])

  useEffect(() => {
    if (incident?.id && deviceLocation) {
      scheduleRoutePoint(
        deviceLocation.latitude,
        deviceLocation.longitude,
        deviceLocation.accuracy,
        deviceLocation.heading,
        LIVE_ACTION_STATUS,
        incident.id,
      )
    }
  }, [deviceLocation, incident?.id])

  useEffect(() => {
    if (!deviceLocation || !incident?.id) {
      return
    }

    const now = Date.now()
    const moved = distanceMeters(deviceLocation, lastSyncedLocationRef.current)
    const enoughTimePassed = now - lastSyncAtRef.current >= LOCATION_SYNC_INTERVAL_MS

    if (!enoughTimePassed && moved < LOCATION_SYNC_MIN_DISTANCE_METERS) {
      return
    }

    if (syncInFlightRef.current) {
      return
    }

    syncInFlightRef.current = true
    setSyncing(true)

    api.post('/api/v1/staff/tracking', {
      incident_id: incident.id,
      action_status: LIVE_ACTION_STATUS,
      latitude: deviceLocation.latitude,
      longitude: deviceLocation.longitude,
      accuracy: deviceLocation.accuracy,
      heading: deviceLocation.heading,
    }).then((response) => {
      const nextLocation = response.data?.data?.location
      if (nextLocation) {
        setLastSharedLocation(nextLocation)
      }
      lastSyncAtRef.current = Date.now()
      lastSyncedLocationRef.current = deviceLocation
      setSyncError('')
    }).catch((error) => {
      setSyncError(parseApiError(error).message)
    }).finally(() => {
      syncInFlightRef.current = false
      setSyncing(false)
    })
  }, [deviceLocation, incident?.id])

  const displayLocation = useMemo(() => {
    if (lastSharedLocation) {
      return lastSharedLocation
    }

    return deviceLocation ? {
      id: 'device-location',
      responder_id: user?.id,
      action_status: LIVE_ACTION_STATUS,
      latitude: deviceLocation.latitude,
      longitude: deviceLocation.longitude,
      accuracy: deviceLocation.accuracy,
      responder: user,
      incident,
    } : null
  }, [deviceLocation, incident, lastSharedLocation, user])
  const mapLocations = useMemo(() => (displayLocation ? [displayLocation] : []), [displayLocation])

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-danger">
              <Radio className="h-4 w-4" />
              Live Tracking
            </p>
            <h2 className="mt-1 text-lg font-semibold text-navy">Live responder location</h2>
            <p className="mt-1 text-sm text-slate-500">GPS updates stream automatically to admin and citizen maps.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500">
            {watching ? <Crosshair className="h-4 w-4 text-success" /> : <Loader2 className="h-4 w-4 animate-spin" />}
            {deviceLocation ? 'GPS ready' : 'Waiting for GPS'}
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_340px]">
        <div className="h-80">
          <ResponderMap locations={mapLocations} incident={incident} height={320} />
        </div>

        <aside className="border-t border-slate-200 bg-panel p-4 lg:border-l lg:border-t-0">
          {geoError ? <p className="mt-2 text-xs text-danger">{geoError}</p> : null}
          {syncError ? <p className="mt-2 text-xs text-danger">{syncError}</p> : null}

          <div className="rounded-xl bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tracking status</p>
            <p className="mt-1 text-sm font-semibold text-navy">
              {deviceLocation ? 'Live location sharing is on' : 'Waiting for GPS'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {lastSharedLocation?.recorded_at
                ? `Last sent ${new Date(lastSharedLocation.recorded_at).toLocaleTimeString()}`
                : 'Your location will send automatically when GPS is ready.'}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-panel px-3 py-1 text-xs font-semibold text-slate-600">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-info" /> : <Crosshair className="h-3.5 w-3.5 text-success" />}
              {syncing ? 'Sending update' : 'Auto-sync every few seconds'}
            </div>
          </div>

        </aside>
      </div>
    </section>
  )
}

export default ResponderTrackingPanel
