import L from 'leaflet'
import { Loader2, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { responderActionLabel } from '../../lib/responderTracking'

const DEFAULT_CENTER = [7.9062, 125.0936]
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors'

function LoadingState({ label = 'Loading map...' }) {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center bg-slate-50/90 text-sm text-slate-500 backdrop-blur-[1px]">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-danger" />
      {label}
    </div>
  )
}

function EmptyMapState({ message }) {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center bg-slate-50 px-4 text-center text-sm text-slate-500">
      <div>
        <MapPin className="mx-auto h-6 w-6 text-slate-400" />
        <p className="mt-2">{message}</p>
      </div>
    </div>
  )
}

function toPosition(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}

function normalizeLocation(location) {
  const position = toPosition(location?.latitude, location?.longitude)

  return position ? { ...location, latitude: position[0], longitude: position[1], position } : null
}

function formatRecordedAt(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toLocaleString()
}

function responderIcon(actionStatus) {
  const color =
    {
      accepted_request: '#2563EB',
      on_the_way: '#0BA5EC',
      arrived: '#059669',
      resolved: '#64748B',
      cancelled: '#94A3B8',
    }[actionStatus] ?? '#2563EB'
  const pulse = ['accepted_request', 'on_the_way', 'arrived'].includes(actionStatus) ? 'pin-pulse' : ''

  return L.divIcon({
    className: 'admin-pin-wrap',
    html: `<span class="admin-pin responder-map-pin ${pulse}" style="--pin-color:${color};">R</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

const incidentIcon = L.divIcon({
  className: 'admin-pin-wrap',
  html: '<span class="admin-pin responder-map-pin responder-map-pin--incident pin-pulse" style="--pin-color:#D7263D;">!</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
})

function RecenterMap({ center, zoom }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, zoom, { animate: true })
  }, [center, map, zoom])

  return null
}

function ResponderMap({ locations = [], incident = null, routePoints = [], height = 420 }) {
  const [tilesLoading, setTilesLoading] = useState(true)
  const [tileError, setTileError] = useState('')
  const validLocations = useMemo(
    () => locations.map(normalizeLocation).filter(Boolean),
    [locations],
  )
  const incidentPosition = useMemo(
    () => toPosition(incident?.latitude, incident?.longitude),
    [incident?.latitude, incident?.longitude],
  )
  const center = validLocations[0]?.position ?? incidentPosition ?? DEFAULT_CENTER
  const zoom = validLocations.length || incidentPosition ? 14 : 13

  const routePositions = useMemo(() => {
    return routePoints
      .map((p) => toPosition(p.latitude, p.longitude))
      .filter(Boolean)
  }, [routePoints])

  const routePolylineOptions = useMemo(() => {
    if (routePositions.length < 2) {
      return null
    }
    return { color: '#1e3a8a', weight: 4, opacity: 0.7, dashArray: '6 8' }
  }, [routePositions.length])

  return (
    <div className="relative h-full overflow-hidden bg-slate-100" style={{ height, minHeight: 260 }}>
      <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <RecenterMap center={center} zoom={zoom} />
        <TileLayer
          attribution={OSM_ATTRIBUTION}
          eventHandlers={{
            loading: () => {
              setTileError('')
              setTilesLoading(true)
            },
            load: () => {
              setTilesLoading(false)
            },
            tileerror: () => {
              setTilesLoading(false)
              setTileError('Map tiles could not load. Check your network connection.')
            },
          }}
          url={OSM_TILE_URL}
        />

        {routePolylineOptions && (
          <Polyline positions={routePositions} pathOptions={routePolylineOptions} />
        )}

        {routePositions.length > 0 && (
          <Marker position={routePositions[0]} icon={L.divIcon({
            className: 'admin-pin-wrap',
            html: '<span class="admin-pin responder-map-pin" style="--pin-color:#1e3a8a;">S</span>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })} title="Route start" />
        )}

        {incidentPosition ? (
          <Marker position={incidentPosition} icon={incidentIcon} title="Incident location">
            <Popup>
              <div className="w-56 space-y-1 text-sm">
                <p className="font-semibold text-navy">Incident location</p>
                {incident?.reference_code ? (
                  <p className="text-xs text-slate-500">Incident {incident.reference_code}</p>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ) : null}

        {validLocations.map((location) => {
          const incidentCode = location.incident?.reference_code ?? incident?.reference_code
          const recordedAt = formatRecordedAt(location.recorded_at)

          return (
            <Marker
              key={location.id ?? location.responder_id}
              position={location.position}
              icon={responderIcon(location.action_status)}
              title={location.responder?.full_name ?? 'Responder'}
            >
              <Popup>
                <div className="max-w-[220px] space-y-1 text-sm">
                  <p className="font-semibold text-slate-900">{location.responder?.full_name ?? 'Responder'}</p>
                  <p className="text-xs font-semibold text-slate-600">{responderActionLabel(location.action_status)}</p>
                  {incidentCode ? (
                    <p className="text-xs text-slate-500">Incident {incidentCode}</p>
                  ) : null}
                  {recordedAt ? (
                    <p className="text-xs text-slate-500">{recordedAt}</p>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {tilesLoading && !tileError ? (
        <div className="pointer-events-none absolute inset-0 z-[500]">
          <LoadingState />
        </div>
      ) : null}

      {tileError ? (
        <div className="absolute inset-0 z-[500]">
          <EmptyMapState message={tileError} />
        </div>
      ) : null}
    </div>
  )
}

export default ResponderMap
