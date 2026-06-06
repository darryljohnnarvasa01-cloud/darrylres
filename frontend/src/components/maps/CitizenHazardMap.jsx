import { AlertTriangle, Loader2, MapPinned } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import HazardLayer from './HazardLayer'
import { api } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'
import { normalizeHazardCircle, normalizeHazardPositions } from '../../lib/hazardGeometry'

const MAP_CENTER = [7.9062, 125.0936]

function HazardMapViewport({ zones }) {
  const map = useMap()

  useEffect(() => {
    const points = zones.flatMap((zone) => {
      const circle = normalizeHazardCircle(zone.polygon)

      if (circle) {
        return [circle.center]
      }

      return normalizeHazardPositions(zone.polygon)
    })

    if (points.length > 1) {
      map.fitBounds(points, { padding: [32, 32], maxZoom: 16 })
    } else if (points.length === 1) {
      map.setView(points[0], 15)
    } else {
      map.setView(MAP_CENTER, 13)
    }
  }, [map, zones])

  return null
}

function CitizenHazardMap() {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const fetchZones = async () => {
      setLoading(true)

      try {
        const response = await api.get('/api/v1/public/hazard-zones', { cacheTtl: 30000 })
        if (active) {
          setZones(response.data?.data?.hazard_zones ?? [])
        }
      } catch (error) {
        toast.error(parseApiError(error).message, { id: 'citizen-hazard-map-error' })
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchZones()

    return () => {
      active = false
    }
  }, [])

  const activeZones = useMemo(() => zones.filter((zone) => zone.is_active), [zones])

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-danger">
            <MapPinned className="h-4 w-4" />
            Hazard Map
          </p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Active safety zones</h2>
          <p className="mt-1 text-sm text-slate-500">Danger zones, flood-prone areas, and evacuation centers visible to citizens.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs font-semibold text-slate-500">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-danger" />}
          {loading ? 'Loading zones' : `${activeZones.length} active`}
        </span>
      </div>

      <div className="h-80">
        <MapContainer center={MAP_CENTER} zoom={13} className="h-full w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <HazardMapViewport zones={activeZones} />
          <HazardLayer zones={activeZones} translateLabels />
        </MapContainer>
      </div>
    </section>
  )
}

export default CitizenHazardMap
