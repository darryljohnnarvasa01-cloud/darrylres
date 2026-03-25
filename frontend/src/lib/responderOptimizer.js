const CITY_CENTER = {
  latitude: 7.9062,
  longitude: 125.0936,
}

const ACTIVE_STATUSES = new Set(['verified', 'under_assessment', 'responding'])

function normalizeBarangay(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractIncidentBarangay(incident) {
  const label = incident?.reporter?.barangay ?? incident?.barangay ?? incident?.address_label?.split(',')?.[0]
  return String(label ?? '').trim()
}

function buildBarangayCentroids(incidents) {
  const groups = new Map()

  incidents.forEach((incident) => {
    if (!Number.isFinite(incident?.latitude) || !Number.isFinite(incident?.longitude)) {
      return
    }

    const barangay = extractIncidentBarangay(incident)
    const key = normalizeBarangay(barangay)

    if (!key) {
      return
    }

    const current = groups.get(key) ?? {
      barangay,
      latitudeSum: 0,
      longitudeSum: 0,
      count: 0,
    }

    current.latitudeSum += Number(incident.latitude)
    current.longitudeSum += Number(incident.longitude)
    current.count += 1

    groups.set(key, current)
  })

  return groups
}

function buildResponderProfiles(incidents) {
  const profiles = new Map()

  incidents.forEach((incident) => {
    const assignments = Array.isArray(incident?.assignments) ? incident.assignments : []
    const seenStaffIds = new Set()

    assignments.forEach((assignment) => {
      const staffId = assignment?.staff?.id ?? assignment?.staff_id

      if (!staffId || seenStaffIds.has(staffId)) {
        return
      }

      seenStaffIds.add(staffId)

      const profile = profiles.get(staffId) ?? {
        handledTotal: 0,
        activeAssignments: 0,
        typeCounts: {},
      }

      profile.handledTotal += 1
      profile.typeCounts[incident.type] = (profile.typeCounts[incident.type] ?? 0) + 1

      if (ACTIVE_STATUSES.has(incident.status)) {
        profile.activeAssignments += 1
      }

      profiles.set(staffId, profile)
    })
  })

  return profiles
}

export function haversineKilometers(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(toLatitude - fromLatitude)
  const dLng = toRadians(toLongitude - fromLongitude)
  const lat1 = toRadians(fromLatitude)
  const lat2 = toRadians(toLatitude)

  const a = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function buildResponderSuggestions({ incident, staff, responderMetrics, incidents }) {
  if (!incident || !Array.isArray(staff) || !staff.length) {
    return []
  }

  const metricsById = new Map(
    (Array.isArray(responderMetrics) ? responderMetrics : []).map((responder) => [responder.id, responder]),
  )
  const centroids = buildBarangayCentroids(Array.isArray(incidents) ? incidents : [])
  const profiles = buildResponderProfiles(Array.isArray(incidents) ? incidents : [])

  const rawSuggestions = staff.map((person) => {
    const metrics = metricsById.get(person.id)
    const profile = profiles.get(person.id)
    const centroid = centroids.get(normalizeBarangay(person.barangay))
    const referencePoint = centroid && centroid.count > 0
      ? {
          latitude: centroid.latitudeSum / centroid.count,
          longitude: centroid.longitudeSum / centroid.count,
          source: 'barangay',
        }
      : {
          ...CITY_CENTER,
          source: 'city',
        }

    const distanceKm = Number.isFinite(incident.latitude) && Number.isFinite(incident.longitude)
      ? haversineKilometers(
          Number(referencePoint.latitude),
          Number(referencePoint.longitude),
          Number(incident.latitude),
          Number(incident.longitude),
        )
      : 0

    const typeCounts = profile?.typeCounts ?? {}
    const typeRanking = Object.entries(typeCounts).sort((left, right) => right[1] - left[1])
    const primaryType = typeRanking[0]?.[0] ?? null
    const specializationMatch = primaryType === incident.type
    const currentAssignmentCount = Number(metrics?.current_assignment_count ?? profile?.activeAssignments ?? 0)
    const online = Boolean(metrics?.online)

    return {
      ...person,
      online,
      currentAssignmentCount,
      distanceKm,
      distanceSource: referencePoint.source,
      specializationMatch,
      specialtyType: primaryType,
      specialtyCount: typeCounts[incident.type] ?? 0,
    }
  })

  const workloadValues = rawSuggestions.map((item) => item.currentAssignmentCount)
  const distanceValues = rawSuggestions.map((item) => item.distanceKm)
  const minWorkload = Math.min(...workloadValues)
  const maxWorkload = Math.max(...workloadValues)
  const minDistance = Math.min(...distanceValues)
  const maxDistance = Math.max(...distanceValues)

  return rawSuggestions
    .map((item) => {
      const workloadScore = maxWorkload === minWorkload
        ? 1
        : 1 - ((item.currentAssignmentCount - minWorkload) / (maxWorkload - minWorkload))
      const distanceScore = maxDistance === minDistance
        ? 1
        : 1 - ((item.distanceKm - minDistance) / (maxDistance - minDistance))
      const specializationScore = item.specializationMatch
        ? 1
        : item.specialtyType
          ? 0.45
          : 0.3
      const availabilityScore = item.online ? 0.08 : 0
      const recommendationScore = (workloadScore * 0.45) + (distanceScore * 0.35) + (specializationScore * 0.2) + availabilityScore

      return {
        ...item,
        recommendationScore,
      }
    })
    .sort((left, right) => (
      right.recommendationScore - left.recommendationScore
      || Number(right.online) - Number(left.online)
      || left.currentAssignmentCount - right.currentAssignmentCount
      || left.distanceKm - right.distanceKm
      || left.full_name.localeCompare(right.full_name)
    ))
    .slice(0, 3)
}
