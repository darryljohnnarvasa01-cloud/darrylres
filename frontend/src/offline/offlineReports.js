import Dexie from 'dexie'
import { api } from '../lib/api'
import { getAuthState } from '../lib/authStorage'

const MAX_OFFLINE_REPORTS = 20
const SYNC_BATCH_SIZE = 5
const DEFAULT_SYNC_INTERVAL_MS = 3 * 60 * 1000
const BASE_BACKOFF_MS = 60 * 1000
const MAX_BACKOFF_MS = 30 * 60 * 1000
const MAX_IMAGE_EDGE = 1600
const IMAGE_QUALITY = 0.72
const STALE_SYNCING_MS = 2 * 60 * 1000
const OFFLINE_REPORT_QUEUE_CHANGED = 'rescuelink:offline-report-queue-changed'

const db = new Dexie('rescuelink_offline_reports')

db.version(1).stores({
  reports: '++id, &client_uuid, status, next_attempt_at, created_at, updated_at',
})

let syncInFlight = null
let syncEngineStop = null

function nowIso() {
  return new Date().toISOString()
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_REPORT_QUEUE_CHANGED))
  }
}

function online() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function createClientUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function backoffForAttempt(attemptCount) {
  const exponential = BASE_BACKOFF_MS * (2 ** Math.max(0, attemptCount - 1))
  const jitter = Math.floor(Math.random() * 5000)

  return Math.min(exponential + jitter, MAX_BACKOFF_MS)
}

function shouldCompress(file) {
  return file?.type?.startsWith('image/') && ['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error('Unable to compress image.'))
    }, type === 'image/png' ? 'image/jpeg' : type, quality)
  })
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }

  const url = URL.createObjectURL(file)

  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Unable to read image.'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function compressImage(file) {
  if (!shouldCompress(file)) {
    return file
  }

  const image = await loadImage(file)
  const width = image.width
  const height = image.height
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height))
  const canvas = document.createElement('canvas')

  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))

  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  if (typeof image.close === 'function') {
    image.close()
  }

  const blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_QUALITY)
  const baseName = file.name.replace(/\.[^.]+$/, '')

  return new File([blob], `${baseName || 'incident-photo'}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

async function serializeMedia(files) {
  const media = []

  for (const file of files) {
    const normalizedFile = await compressImage(file)

    media.push({
      name: normalizedFile.name,
      type: normalizedFile.type || 'application/octet-stream',
      size: normalizedFile.size,
      lastModified: normalizedFile.lastModified || Date.now(),
      blob: normalizedFile,
    })
  }

  return media
}

function mediaToFormData(report) {
  const formData = new FormData()

  formData.append('client_uuid', report.client_uuid)

  ;(report.media ?? []).forEach((item) => {
    formData.append('media[]', item.blob, item.name)
  })

  return formData
}

function mediaUploadEndpointFor(report) {
  if (report.media_upload_endpoint) {
    return report.media_upload_endpoint
  }

  return report.endpoint === '/api/v1/incidents/guest'
    ? '/api/v1/incidents/guest/offline-media'
    : '/api/v1/incidents/offline-media'
}

function incidentPayloadFor(report, uploadedMedia) {
  return {
    ...(report.payload ?? {}),
    client_uuid: report.client_uuid,
    force_submit: '1',
    offline_media: uploadedMedia.map((item) => ({
      file_path: item.file_path,
      file_type: item.file_type,
      token: item.token,
    })),
  }
}

function requestHeadersFor(report) {
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(report.headers ?? {}),
  }

  if (report.reporter_mode === 'citizen') {
    const { token } = getAuthState()

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  return headers
}

async function pruneSyncedReports() {
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000)

  await db.reports
    .where('status')
    .equals('synced')
    .filter((report) => new Date(report.updated_at).getTime() < cutoff)
    .delete()
}

async function restoreStaleSyncingReports() {
  const cutoff = Date.now() - STALE_SYNCING_MS
  const staleReports = await db.reports
    .where('status')
    .equals('syncing')
    .filter((report) => new Date(report.updated_at).getTime() < cutoff)
    .toArray()

  await Promise.all(
    staleReports.map((report) => db.reports.update(report.id, {
      status: 'failed',
      last_error: 'Previous sync attempt was interrupted.',
      next_attempt_at: 0,
      updated_at: nowIso(),
    })),
  )
}

export async function queueOfflineReport({
  payload,
  mediaFiles,
  endpoint,
  headers = {},
  reporterMode = 'guest',
}) {
  const activeCount = await db.reports
    .where('status')
    .anyOf('pending', 'syncing', 'failed')
    .count()

  if (activeCount >= MAX_OFFLINE_REPORTS) {
    throw new Error(`Offline report queue is full. Sync or remove pending reports before adding more than ${MAX_OFFLINE_REPORTS}.`)
  }

  const clientUuid = payload?.client_uuid || createClientUuid()
  const createdAt = nowIso()
  const media = await serializeMedia(mediaFiles ?? [])

  const id = await db.reports.add({
    client_uuid: clientUuid,
    endpoint,
    media_upload_endpoint: endpoint === '/api/v1/incidents/guest'
      ? '/api/v1/incidents/guest/offline-media'
      : '/api/v1/incidents/offline-media',
    headers,
    reporter_mode: reporterMode,
    payload: {
      ...payload,
      client_uuid: clientUuid,
      force_submit: '1',
    },
    media,
    status: 'pending',
    attempt_count: 0,
    last_error: null,
    server_incident_id: null,
    uploaded_media: [],
    next_attempt_at: 0,
    created_at: createdAt,
    updated_at: createdAt,
  })

  notifyQueueChanged()

  return {
    id,
    client_uuid: clientUuid,
    status: 'pending',
  }
}

async function uploadQueuedMedia(report) {
  const uploadedMedia = Array.isArray(report.uploaded_media) ? report.uploaded_media : []

  if (uploadedMedia.length > 0) {
    return uploadedMedia
  }

  const queuedMedia = report.media ?? []

  if (queuedMedia.length === 0) {
    throw new Error('Offline report has no queued media files.')
  }

  const response = await api.post(
    mediaUploadEndpointFor(report),
    mediaToFormData(report),
    {
      headers: {
        ...requestHeadersFor(report),
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000,
    },
  )
  const nextUploadedMedia = response.data?.data?.media ?? []

  if (!Array.isArray(nextUploadedMedia) || nextUploadedMedia.length === 0) {
    throw new Error('Offline media upload did not return file references.')
  }

  await db.reports.update(report.id, {
    uploaded_media: nextUploadedMedia,
    updated_at: nowIso(),
  })
  notifyQueueChanged()

  return nextUploadedMedia
}

async function syncReport(report) {
  await db.reports.update(report.id, {
    status: 'syncing',
    updated_at: nowIso(),
  })
  notifyQueueChanged()

  try {
    const uploadedMedia = await uploadQueuedMedia(report)
    const response = await api.post(
      report.endpoint,
      incidentPayloadFor(report, uploadedMedia),
      {
        headers: requestHeadersFor(report),
        timeout: 30000,
      },
    )

    await db.reports.update(report.id, {
      status: 'synced',
      server_incident_id: response.data?.data?.incident?.id ?? null,
      last_error: null,
      updated_at: nowIso(),
    })
    notifyQueueChanged()

    return { ok: true, id: report.id }
  } catch (error) {
    const nextAttemptCount = Number(report.attempt_count ?? 0) + 1
    const status = error?.response?.status
    const message = error?.response?.data?.message ?? error?.message ?? 'Offline sync failed.'

    await db.reports.update(report.id, {
      status: 'failed',
      attempt_count: nextAttemptCount,
      last_error: message,
      last_status: status ?? null,
      next_attempt_at: Date.now() + backoffForAttempt(nextAttemptCount),
      updated_at: nowIso(),
    })
    notifyQueueChanged()

    return { ok: false, id: report.id, message, status }
  }
}

export async function syncPendingReports() {
  if (!online()) {
    return { started: false, reason: 'offline', synced: 0, failed: 0 }
  }

  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = (async () => {
    await restoreStaleSyncingReports()

    const readyAt = Date.now()
    const reports = await db.reports
      .orderBy('created_at')
      .filter((report) => (
        ['pending', 'failed'].includes(report.status)
        && Number(report.next_attempt_at ?? 0) <= readyAt
      ))
      .limit(SYNC_BATCH_SIZE)
      .toArray()

    let synced = 0
    let failed = 0

    for (const report of reports) {
      const result = await syncReport(report)

      if (result.ok) {
        synced += 1
      } else {
        failed += 1
      }
    }

    await pruneSyncedReports()

    return {
      started: true,
      synced,
      failed,
      remaining: await db.reports.where('status').anyOf('pending', 'failed').count(),
    }
  })().finally(() => {
    syncInFlight = null
  })

  return syncInFlight
}

export function startOfflineSyncEngine({ intervalMs = DEFAULT_SYNC_INTERVAL_MS } = {}) {
  if (syncEngineStop) {
    return syncEngineStop
  }

  let stopped = false

  const triggerSync = () => {
    if (!stopped) {
      syncPendingReports().catch(() => {
        // Background sync must never surface errors into the main UI loop.
      })
    }
  }

  const startupTimer = window.setTimeout(triggerSync, 0)
  const interval = window.setInterval(triggerSync, intervalMs)
  window.addEventListener('online', triggerSync)

  syncEngineStop = () => {
    stopped = true
    window.clearTimeout(startupTimer)
    window.clearInterval(interval)
    window.removeEventListener('online', triggerSync)
    syncEngineStop = null
  }

  return syncEngineStop
}

export async function getOfflineQueueSummary() {
  const [pending, syncing, failed, synced] = await Promise.all([
    db.reports.where('status').equals('pending').count(),
    db.reports.where('status').equals('syncing').count(),
    db.reports.where('status').equals('failed').count(),
    db.reports.where('status').equals('synced').count(),
  ])

  return { pending, syncing, failed, synced }
}
