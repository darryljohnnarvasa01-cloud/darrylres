/**
 * SOS Offline Queue - IndexedDB helper for storing and syncing SOS alerts
 * Dynamically loaded only when offline mode is needed.
 */
import Dexie from 'dexie'
import { api } from '../lib/api'
import { guestHeaders } from '../lib/guestReporting'
import { getAuthState } from '../lib/authStorage'

const DB_NAME = 'rescuelink_sos_queue'
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 5000
const MAX_BACKOFF_MS = 60000
const OFFLINE_SOS_QUEUE_CHANGED = 'rescuelink:offline-sos-queue-changed'

const db = new Dexie(DB_NAME)

db.version(1).stores({
  alerts: '++id, &client_uuid, status, next_attempt_at, created_at, updated_at',
})

let syncInFlight = null

function nowIso() {
  return new Date().toISOString()
}

function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function createClientUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `sos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function backoffForAttempt(attemptCount) {
  const exponential = BASE_BACKOFF_MS * (2 ** Math.max(0, attemptCount - 1))
  const jitter = Math.floor(Math.random() * 3000)
  return Math.min(exponential + jitter, MAX_BACKOFF_MS)
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_SOS_QUEUE_CHANGED))
  }
}

/**
 * Queue an SOS alert for background sync
 */
export async function queueOfflineSos({
  latitude,
  longitude,
  type = 'sos',
  description = 'Emergency SOS triggered',
  isAuthenticated,
}) {
  const clientUuid = createClientUuid()
  const createdAt = nowIso()

  const payload = {
    latitude,
    longitude,
    type,
    description,
    client_uuid: clientUuid,
  }

  const id = await db.alerts.add({
    client_uuid: clientUuid,
    payload,
    is_authenticated: isAuthenticated,
    status: 'pending',
    attempt_count: 0,
    last_error: null,
    next_attempt_at: 0,
    created_at: createdAt,
    updated_at: createdAt,
  })

  notifyQueueChanged()

  // Try to trigger background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready
      await registration.sync.register('sync-sos-alerts')
    } catch {
      // Background sync registration failed, will use fallback online listener
    }
  }

  return {
    id,
    client_uuid: clientUuid,
    status: 'pending',
  }
}

/**
 * Get count of pending SOS alerts
 */
export async function getPendingSosCount() {
  return db.alerts
    .where('status')
    .anyOf('pending', 'failed')
    .count()
}

/**
 * Get all pending SOS alerts
 */
export async function getPendingSosAlerts() {
  return db.alerts
    .where('status')
    .anyOf('pending', 'failed')
    .toArray()
}

/**
 * Sync a single SOS alert
 */
async function syncSosAlert(alert) {
  await db.alerts.update(alert.id, {
    status: 'syncing',
    updated_at: nowIso(),
  })
  notifyQueueChanged()

  try {
    const endpoint = alert.is_authenticated ? '/api/v1/sos' : '/api/v1/sos/guest'
    const response = await api.post(endpoint, alert.payload, {
      headers: alert.is_authenticated ? {} : guestHeaders(),
      timeout: 30000,
    })

    await db.alerts.update(alert.id, {
      status: 'synced',
      server_alert_id: response.data?.data?.sos_alert?.id ?? null,
      last_error: null,
      updated_at: nowIso(),
    })
    notifyQueueChanged()

    return {
      ok: true,
      id: alert.id,
      serverAlert: response.data?.data?.sos_alert ?? null,
    }
  } catch (error) {
    const nextAttemptCount = Number(alert.attempt_count ?? 0) + 1
    const status = error?.response?.status
    const message = error?.response?.data?.message ?? error?.message ?? 'Sync failed'

    // If max retries reached, mark as failed
    const shouldRetry = nextAttemptCount < MAX_RETRIES && status !== 401 && status !== 403

    await db.alerts.update(alert.id, {
      status: shouldRetry ? 'failed' : 'max_retries_exceeded',
      attempt_count: nextAttemptCount,
      last_error: message,
      last_status: status ?? null,
      next_attempt_at: shouldRetry ? Date.now() + backoffForAttempt(nextAttemptCount) : 0,
      updated_at: nowIso(),
    })
    notifyQueueChanged()

    return {
      ok: false,
      id: alert.id,
      message,
      status,
      maxRetriesExceeded: !shouldRetry,
    }
  }
}

/**
 * Sync all pending SOS alerts
 */
export async function syncPendingSos() {
  if (!isOnline()) {
    return { started: false, reason: 'offline', synced: 0, failed: 0 }
  }

  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = (async () => {
    const readyAt = Date.now()
    const alerts = await db.alerts
      .orderBy('created_at')
      .filter((alert) =>
        ['pending', 'failed'].includes(alert.status)
        && Number(alert.next_attempt_at ?? 0) <= readyAt
      )
      .toArray()

    let synced = 0
    let failed = 0
    const syncedAlerts = []

    for (const alert of alerts) {
      const result = await syncSosAlert(alert)

      if (result.ok) {
        synced += 1
        syncedAlerts.push(result.serverAlert)
      } else {
        failed += 1
      }
    }

    // Clean up synced alerts older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await db.alerts
      .where('status')
      .equals('synced')
      .filter((alert) => alert.created_at < cutoff)
      .delete()

    return {
      started: true,
      synced,
      failed,
      syncedAlerts,
      remaining: await db.alerts.where('status').anyOf('pending', 'failed').count(),
    }
  })().finally(() => {
    syncInFlight = null
  })

  return syncInFlight
}

/**
 * Clear all synced SOS alerts
 */
export async function clearSyncedSos() {
  await db.alerts.where('status').equals('synced').delete()
  notifyQueueChanged()
}

/**
 * Subscribe to queue changes
 */
export function onSosQueueChanged(callback) {
  const handler = () => {
    callback()
  }
  window.addEventListener(OFFLINE_SOS_QUEUE_CHANGED, handler)
  return () => window.removeEventListener(OFFLINE_SOS_QUEUE_CHANGED, handler)
}

/**
 * Generate SMS deep link with emergency message
 */
export function generateSmsLink({
  phoneNumber,
  latitude,
  longitude,
  timestamp,
  shortUrl = null,
}) {
  const formattedTime = new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const locationLink = shortUrl
    ? `${shortUrl}`
    : `https://maps.google.com/?q=${latitude},${longitude}`

  const message = `EMERGENCY SOS - Location: ${latitude.toFixed(6)},${longitude.toFixed(6)} - Time: ${formattedTime} - Track: ${locationLink}`

  // iOS and Android have different SMS URL formats
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isIOS) {
    // iOS format: sms:number&body=...
    return `sms:${phoneNumber}&body=${encodeURIComponent(message)}`
  }
  // Android format: sms:number?body=...
  return `sms:${phoneNumber}?body=${encodeURIComponent(message)}`
}

/**
 * Get emergency contacts from localStorage or use default
 */
export function getEmergencyContacts() {
  if (typeof window === 'undefined') {
    return [{ name: 'Emergency Rescue Line', number: '+1234567890' }]
  }

  try {
    const stored = window.localStorage.getItem('rescuelink_emergency_contacts')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // Fall through to default
  }

  // Default hardcoded rescue line
  return [{ name: 'Emergency Rescue Line', number: '+1234567890' }]
}

/**
 * Save emergency contacts to localStorage
 */
export function saveEmergencyContacts(contacts) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('rescuelink_emergency_contacts', JSON.stringify(contacts))
}

/**
 * Generate shareable link for alert tracking (simplified version)
 * In production, this would call a URL shortening service
 */
export async function generateTrackingLink(clientUuid) {
  // For now, return a direct link to the app's tracking page
  // In production, integrate with a URL shortener API
  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/track`
    : 'https://rescuelink.app/track'

  return `${baseUrl}?sos=${clientUuid}`
}
