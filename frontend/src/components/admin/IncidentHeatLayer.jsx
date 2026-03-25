import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.heat'
import { useMap } from 'react-leaflet'

const DEFAULT_OPTIONS = {
  radius: 28,
  blur: 22,
  maxZoom: 17,
  minOpacity: 0.35,
  gradient: {
    0.2: '#2563EB',
    0.45: '#FACC15',
    0.75: '#F97316',
    1: '#DC2626',
  },
}

function IncidentHeatLayer({ points }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!map || typeof L.heatLayer !== 'function') {
      return undefined
    }

    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }

    if (!points.length) {
      return undefined
    }

    layerRef.current = L.heatLayer(points, DEFAULT_OPTIONS).addTo(map)

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, points])

  return null
}

export default IncidentHeatLayer
