import { Circle, Polygon, Popup, Tooltip } from 'react-leaflet'
import { normalizeHazardCircle, normalizeHazardPositions } from '../../lib/hazardGeometry'
import { t as translateLabel } from '../../lib/i18n'

const HAZARD_STYLE = {
  danger: {
    color: '#B91C1C',
    fillColor: '#DC2626',
    fillOpacity: 0.55,
    weight: 4,
    dashArray: '8, 6',
  },
  flood: {
    color: '#0369A1',
    fillColor: '#0BA5EC',
    fillOpacity: 0.5,
    weight: 4,
  },
  evacuation: {
    color: '#047857',
    fillColor: '#10B981',
    fillOpacity: 0.5,
    weight: 4,
  },
}

function labelForType(type, translate) {
  switch (type) {
    case 'danger':
      return 'Danger Zone'
    case 'flood':
      return 'Flood-prone Area'
    case 'evacuation':
      return translate('Evacuation Center')
    default:
      return 'Hazard Zone'
  }
}

function HazardPopup({ zone, translateLabels }) {
  return (
    <Popup>
      <div className="w-56 space-y-1">
        <p className="text-sm font-semibold text-navy">{zone.name}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {labelForType(zone.type, translateLabels ? translateLabel : (key) => key)}
        </p>
        {zone.description ? (
          <p className="text-xs text-slate-600">{zone.description}</p>
        ) : null}
      </div>
    </Popup>
  )
}

function HazardLayer({ zones = [], translateLabels = false }) {
  return (
    <>
      {zones.map((zone) => {
        const pathOptions = HAZARD_STYLE[zone.type] ?? HAZARD_STYLE.danger
        const circle = normalizeHazardCircle(zone.polygon)

        if (circle) {
          return (
            <Circle
              key={zone.id}
              center={circle.center}
              radius={circle.radius}
              pathOptions={pathOptions}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1} className="bg-slate-900 text-white text-xs px-2 py-1 rounded border-0">
                <span className="font-semibold">{zone.name}</span>
              </Tooltip>
              <HazardPopup zone={zone} translateLabels={translateLabels} />
            </Circle>
          )
        }

        const positions = normalizeHazardPositions(zone.polygon)

        if (positions.length < 3) {
          return null
        }

        return (
          <Polygon
            key={zone.id}
            positions={positions}
            pathOptions={pathOptions}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1} className="bg-slate-900 text-white text-xs px-2 py-1 rounded border-0">
              <span className="font-semibold">{zone.name}</span>
            </Tooltip>
            <HazardPopup zone={zone} translateLabels={translateLabels} />
          </Polygon>
        )
      })}
    </>
  )
}

export default HazardLayer
