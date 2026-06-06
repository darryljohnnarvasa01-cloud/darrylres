import L from 'leaflet'
import {
  ArrowUp,
  Bed,
  Car,
  Droplets,
  Loader2,
  MapPin,
  Navigation,
  Stethoscope,
  Utensils,
  Users,
  Wifi,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { api } from '../../lib/api'
import { distanceMeters } from '../../lib/hazardGeometry'
import { t } from '../../lib/i18n'

const DEFAULT_CENTER = [7.9062, 125.0936]
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors'
const WALKING_SPEED_MPS = (5 * 1000) / 3600
const DRIVING_SPEED_MPS = (30 * 1000) / 3600

function toPosition(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)

  return Number.isFinite(la) && Number.isFinite(ln) ? [la, ln] : null
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLng)

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function formatDistance(meters) {
  if (meters === null || !Number.isFinite(meters)) {
    return ''
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  return `${(meters / 1000).toFixed(1)} km`
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return ''
  }

  const mins = Math.ceil(seconds / 60)

  if (mins < 60) {
    return `${mins} min`
  }

  const hrs = Math.floor(mins / 60)
  const rem = mins % 60

  return `${hrs}h ${rem}m`
}

function userIcon() {
  return L.divIcon({
    className: 'admin-pin-wrap',
    html: '<span class="admin-pin responder-map-pin" style="--pin-color:#2563EB;">U</span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

function evacuationIcon() {
  return L.divIcon({
    className: 'admin-pin-wrap',
    html: '<span class="admin-pin responder-map-pin" style="--pin-color:#059669;">E</span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

function selectedEvacuationIcon() {
  return L.divIcon({
    className: 'admin-pin-wrap',
    html: '<span class="admin-pin responder-map-pin pin-pulse" style="--pin-color:#059669;">E</span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

const FACILITY_ICONS = {
  water: Droplets,
  food: Utensils,
  beds: Bed,
  medical: Stethoscope,
  wifi: Wifi,
  parking: Car,
}

function facilityIcon(name) {
  const key = name?.toLowerCase()

  return FACILITY_ICONS[key] ?? null
}

function RecenterMap({ center }) {
  const map = useMap()

  useEffect(() => {
    if (center) {
      map.setView(center, 14, { animate: true })
    }
  }, [center, map])

  return null
}

function EvacuationNavigator() {
  const [userLocation, setUserLocation] = useState(null)
  const [locationError, setLocationError] = useState('')
  const [centers, setCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      (err) => {
        setLocationError(err.message || 'Unable to retrieve your location.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [])

  const fetchCenters = useCallback(async () => {
    setLoading(true)

    try {
      const params = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : {}
      const response = await api.get('/api/v1/public/evacuation-centers', { params })

      setCenters(response.data?.data?.evacuation_centers ?? [])
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }, [userLocation])

  useEffect(() => {
    fetchCenters()
  }, [fetchCenters])

  const selectedCenter = useMemo(
    () => centers.find((c) => c.id === selectedId) ?? null,
    [centers, selectedId],
  )

  const selectedPosition = useMemo(() => {
    if (!selectedCenter) {
      return null
    }

    const polygon = selectedCenter.polygon

    if (polygon?.circle?.lat != null && polygon?.circle?.lng != null) {
      return [polygon.circle.lat, polygon.circle.lng]
    }

    if (Array.isArray(polygon) && polygon.length > 0) {
      const first = polygon[0]

      if (Array.isArray(first)) {
        return [first[0], first[1]]
      }

      if (first?.lat != null && first?.lng != null) {
        return [first.lat, first.lng]
      }
    }

    return null
  }, [selectedCenter])

  const routeDistance = useMemo(() => {
    if (!userLocation || !selectedPosition) {
      return null
    }

    return distanceMeters(
      { latitude: userLocation.lat, longitude: userLocation.lng },
      { latitude: selectedPosition[0], longitude: selectedPosition[1] },
    )
  }, [userLocation, selectedPosition])

  const routeBearing = useMemo(() => {
    if (!userLocation || !selectedPosition) {
      return 0
    }

    return bearing(userLocation.lat, userLocation.lng, selectedPosition[0], selectedPosition[1])
  }, [userLocation, selectedPosition])

  const walkEta = useMemo(() => {
    if (!routeDistance) {
      return null
    }

    return formatEta(routeDistance / WALKING_SPEED_MPS)
  }, [routeDistance])

  const driveEta = useMemo(() => {
    if (!routeDistance) {
      return null
    }

    return formatEta(routeDistance / DRIVING_SPEED_MPS)
  }, [routeDistance])

  const mapCenter = useMemo(() => {
    if (selectedPosition) {
      return selectedPosition
    }

    if (userLocation) {
      return [userLocation.lat, userLocation.lng]
    }

    return DEFAULT_CENTER
  }, [selectedPosition, userLocation])

  const openExternalNavigation = useCallback(() => {
    if (!selectedPosition) {
      return
    }

    const [lat, lng] = selectedPosition
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

    window.open(url, '_blank', 'noopener,noreferrer')
  }, [selectedPosition])

  return (
    <div className="flex flex-col lg:h-[calc(100vh-64px)] lg:flex-row">
      <div className="relative h-[360px] lg:h-auto lg:flex-1">
        <MapContainer center={mapCenter} zoom={14} className="h-full w-full" scrollWheelZoom>
          <RecenterMap center={mapCenter} />
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />

          {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon()}>
              <Popup>
                <div className="text-sm font-semibold text-navy">{t('You are here')}</div>
              </Popup>
            </Marker>
          )}

          {centers.map((center) => {
            const pos = toPosition(
              center.polygon?.circle?.lat ??
                center.polygon?.[0]?.[0] ??
                center.polygon?.[0]?.lat,
              center.polygon?.circle?.lng ??
                center.polygon?.[0]?.[1] ??
                center.polygon?.[0]?.lng,
            )

            if (!pos) {
              return null
            }

            const isSelected = center.id === selectedId

            return (
              <Marker
                key={center.id}
                position={pos}
                icon={isSelected ? selectedEvacuationIcon() : evacuationIcon()}
                eventHandlers={{
                  click: () => setSelectedId(center.id),
                }}
              >
                <Popup>
                  <div className="w-48 space-y-1">
                    <p className="text-sm font-semibold text-navy">{center.name}</p>
                    <p className="text-xs text-slate-500">
                      {center.distance_meters != null ? formatDistance(center.distance_meters) : ''}
                    </p>
                    {center.capacity != null && (
                      <p className="text-xs text-slate-500">
                        Capacity: {center.current_occupancy ?? 0} / {center.capacity}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {userLocation && selectedPosition && (
            <Polyline
              positions={[
                [userLocation.lat, userLocation.lng],
                selectedPosition,
              ]}
              pathOptions={{ color: '#059669', weight: 3, dashArray: '8, 8', opacity: 0.8 }}
            />
          )}
        </MapContainer>
      </div>

      <div className="border-t border-slate-200 bg-white lg:w-[400px] lg:border-t-0 lg:border-l">
        <div className="p-4">
          <h2 className="font-heading text-xl italic text-navy">
            {t('Evacuation Center')}s
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {locationError
              ? locationError
              : userLocation
                ? 'Nearest centers sorted by distance.'
                : 'Enable location to sort by distance.'}
          </p>
        </div>

        <div className="max-h-[400px] overflow-y-auto px-4 pb-4 lg:max-h-[calc(100%-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-danger" />
              <p className="ml-2 text-sm text-slate-500">Loading centers...</p>
            </div>
          ) : centers.length === 0 ? (
            <div className="py-10 text-center">
              <MapPin className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-navy">No evacuation centers found</p>
              <p className="mt-1 text-xs text-slate-500">Check back later for updates.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {centers.map((center) => {
                const isSelected = center.id === selectedId
                const capacityPct =
                  center.capacity > 0
                    ? Math.round(((center.current_occupancy ?? 0) / center.capacity) * 100)
                    : null

                return (
                  <button
                    key={center.id}
                    type="button"
                    onClick={() => setSelectedId(center.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-emerald-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-navy">{center.name}</p>
                        {center.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                            {center.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {center.distance_meters != null && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              <Navigation className="h-3 w-3" />
                              {formatDistance(center.distance_meters)}
                            </span>
                          )}
                          {center.capacity != null && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                capacityPct >= 90
                                  ? 'bg-red-100 text-red-700'
                                  : capacityPct >= 70
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              <Users className="h-3 w-3" />
                              {center.current_occupancy ?? 0}/{center.capacity}
                            </span>
                          )}
                        </div>
                        {center.facilities && center.facilities.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {center.facilities.map((f) => {
                              const Icon = facilityIcon(f)

                              return (
                                <span
                                  key={f}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                                >
                                  {Icon && <Icon className="h-3 w-3" />}
                                  {f}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selectedCenter && userLocation && (
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                style={{ transform: `rotate(${routeBearing}deg)` }}
              >
                <ArrowUp className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{selectedCenter.name}</p>
                <p className="text-xs text-slate-500">
                  {formatDistance(routeDistance)} · Walk {walkEta} · Drive {driveEta}
                </p>
              </div>
              <button
                type="button"
                onClick={openExternalNavigation}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Navigation className="h-3.5 w-3.5" />
                Navigate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EvacuationNavigator
