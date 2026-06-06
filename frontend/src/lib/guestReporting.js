const GUEST_REPORTER_ID_KEY = 'rescuelink_guest_reporter_id'

function fallbackId() {
  return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export function getGuestReporterId() {
  if (typeof window === 'undefined') {
    return fallbackId()
  }

  const existing = window.localStorage.getItem(GUEST_REPORTER_ID_KEY)

  if (existing) {
    return existing
  }

  const nextId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : fallbackId()

  window.localStorage.setItem(GUEST_REPORTER_ID_KEY, nextId)

  return nextId
}

export function guestHeaders() {
  return {
    'X-RescueLink-Guest-Id': getGuestReporterId(),
  }
}
