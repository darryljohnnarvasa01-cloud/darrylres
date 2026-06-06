import { memo } from 'react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'

const TYPE_COLORS = {
  fire: '#D7263D',
  medical: '#1570EF',
  crime: '#7A5AF8',
  flood: '#0BA5EC',
  accident: '#F79009',
  other: '#98A2B3',
}

function incidentPinIcon(type, status) {
  const color = TYPE_COLORS[type] ?? '#98A2B3'
  const pulse = status === 'responding' || status === 'under_assessment' ? 'pin-pulse' : ''

  return L.divIcon({
    className: 'admin-pin-wrap',
    html: `<span class="admin-pin ${pulse}" style="--pin-color:${color};"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

const IncidentMap = memo(function IncidentMap({
  latitude,
  longitude,
  type,
  status,
  staffLocation,
}) {
  const mapCenter = [latitude, longitude]

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="h-[250px]">
        <MapContainer
          center={mapCenter}
          zoom={15}
          className="h-full w-full"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={mapCenter}
            icon={incidentPinIcon(type, status)}
          >
            <Popup>Incident location</Popup>
          </Marker>
          {staffLocation && (
            <CircleMarker
              center={[staffLocation.latitude, staffLocation.longitude]}
              radius={8}
              pathOptions={{
                color: '#1570EF',
                fillColor: '#1570EF',
                fillOpacity: 0.65,
              }}
            >
              <Popup>Your current location</Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>
    </section>
  )
})

export default IncidentMap
