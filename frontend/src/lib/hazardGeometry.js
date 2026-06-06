export function normalizeHazardPositions(polygon) {
  const rawCoordinates = Array.isArray(polygon)
    ? polygon
    : polygon?.type === 'Polygon'
      ? polygon?.coordinates?.[0] ?? []
      : polygon?.coordinates ?? polygon?.positions ?? []

  if (!Array.isArray(rawCoordinates)) {
    return []
  }

  return rawCoordinates
    .map((point) => {
      if (Array.isArray(point)) {
        const first = Number(point[0])
        const second = Number(point[1])

        if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
          return [second, first]
        }

        return [first, second]
      }

      return [Number(point?.lat ?? point?.latitude), Number(point?.lng ?? point?.longitude)]
    })
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
}

export function normalizeHazardCircle(polygon) {
  const circle = polygon?.circle ?? polygon
  const center = circle?.center
  const centerLat = Array.isArray(center) ? center[0] : center?.lat ?? center?.latitude ?? circle?.lat ?? circle?.latitude
  const centerLng = Array.isArray(center) ? center[1] : center?.lng ?? center?.longitude ?? circle?.lng ?? circle?.longitude
  const radius = Number(circle?.radius ?? circle?.radius_meters)

  if (!Number.isFinite(Number(centerLat)) || !Number.isFinite(Number(centerLng)) || !Number.isFinite(radius) || radius <= 0) {
    return null
  }

  return {
    center: [Number(centerLat), Number(centerLng)],
    radius,
  }
}

export function isPointInPolygon(point, polygon) {
  const positions = normalizeHazardPositions(polygon)

  if (positions.length < 3) {
    return false
  }

  const lat = Number(point?.lat ?? point?.latitude)
  const lng = Number(point?.lng ?? point?.longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false
  }

  let inside = false

  for (let i = 0, j = positions.length - 1; i < positions.length; j = i, i += 1) {
    const [latI, lngI] = positions[i]
    const [latJ, lngJ] = positions[j]
    const intersects = ((lngI > lng) !== (lngJ > lng))
      && (lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI)

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

export function distanceMeters(left, right) {
  const lat1 = Number(left?.lat ?? left?.latitude)
  const lng1 = Number(left?.lng ?? left?.longitude)
  const lat2 = Number(right?.lat ?? right?.latitude)
  const lng2 = Number(right?.lng ?? right?.longitude)

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY
  }

  const earthRadius = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2

  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export function isPointInHazardZone(point, zone) {
  const circle = normalizeHazardCircle(zone?.polygon)

  if (circle) {
    return distanceMeters(point, { latitude: circle.center[0], longitude: circle.center[1] }) <= circle.radius
  }

  return isPointInPolygon(point, zone?.polygon)
}
