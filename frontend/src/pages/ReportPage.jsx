import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  FileVideo,
  ImagePlus,
  LocateFixed,
  LogIn,
  MapPin,
  Navigation,
  ShieldAlert,
  UploadCloud,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import OfflineQueueIndicator from '../components/OfflineQueueIndicator'
import { INCIDENT_TYPES } from '../data/incidentTypes'
import { api } from '../lib/api'
import { nowForDateTimeLocal, serializeDateTimeLocal } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'
import { guestHeaders } from '../lib/guestReporting'
import { useI18n } from '../lib/i18n'

const DEFAULT_LOCATION = { lat: 7.9062, lng: 125.0936 }
const DEFAULT_GUEST_QUOTA = { limit: 10, used: 0, remaining: 10, limit_reached: false }
const MAX_REPORT_MEDIA_FILES = 5
const focusRingClass = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20'

function createClientUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `report-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function browserIsOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function isNetworkSubmitFailure(error) {
  return !error?.response && ['ERR_NETWORK', 'ECONNABORTED', undefined].includes(error?.code)
}

function RecenterMap({ position }) {
  const map = useMap()

  useEffect(() => {
    map.setView(position)
  }, [map, position])

  return null
}

function DraggableLocationMarker({ position, onLocationChange }) {
  const markerRef = useRef(null)
  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: 'incident-marker-wrap',
        html: '<span class="incident-marker-dot"></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    [],
  )

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current

        if (!marker) {
          return
        }

        const nextLocation = marker.getLatLng()
        onLocationChange({ lat: nextLocation.lat, lng: nextLocation.lng })
      },
    }),
    [onLocationChange],
  )

  return (
    <Marker
      draggable
      position={position}
      icon={markerIcon}
      eventHandlers={eventHandlers}
      ref={markerRef}
    />
  )
}

function supportsLiveGeolocation() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  return Boolean(navigator.geolocation) && window.isSecureContext
}

function geolocationFailureMessage(error) {
  switch (error?.code) {
    case 1:
      return 'Location access was blocked. You can still report: drag the map marker to the incident spot.'
    case 2:
      return 'Your device could not find an exact position. Move the marker to the closest safe location.'
    case 3:
      return 'Location detection took too long. Try again, or drag the marker yourself.'
    default:
      return 'We could not detect your location. Drag the marker to the incident area.'
  }
}

function ReportPage() {
  const { isAuthenticated, role } = useAuth()
  const { t } = useI18n()
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const [isLocating, setIsLocating] = useState(false)
  const [isResolvingAddress, setIsResolvingAddress] = useState(false)
  const [addressLabel, setAddressLabel] = useState('')
  const [locationNotice, setLocationNotice] = useState('')
  const [form, setForm] = useState({
    type: '',
    description: '',
    incident_datetime: nowForDateTimeLocal(),
  })
  const [mediaFiles, setMediaFiles] = useState([])
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [duplicateModal, setDuplicateModal] = useState({ open: false, message: '' })
  const [guestQuota, setGuestQuota] = useState(DEFAULT_GUEST_QUOTA)
  const [guestLimitModalOpen, setGuestLimitModalOpen] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const lastPrefillRef = useRef('')
  const isCitizenReporter = isAuthenticated && role === 'citizen'
  const isGuestMode = !isCitizenReporter
  const guestLimitReached = isGuestMode && guestQuota.limit_reached
  const canUseLiveGeolocation = supportsLiveGeolocation()
  const mediaSlotsRemaining = Math.max(0, MAX_REPORT_MEDIA_FILES - mediaFiles.length)
  const mediaCountLabel = `${mediaFiles.length}/${MAX_REPORT_MEDIA_FILES} attached`
  const guestAuthState = useMemo(
    () => ({
      fromGuestReporting: isGuestMode,
      fromGuestLimit: guestLimitReached,
      returnTo: '/report',
    }),
    [guestLimitReached, isGuestMode],
  )
  const clientTimezone = useMemo(() => {
    if (typeof Intl === 'undefined') {
      return ''
    }

    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
    } catch {
      return ''
    }
  }, [])

  useEffect(() => {
    const signature = searchParams.toString()

    if (!signature || signature === lastPrefillRef.current) {
      return
    }

    const requestedType = searchParams.get('type') ?? ''
    const requestedDescription = searchParams.get('description') ?? ''
    const validType = INCIDENT_TYPES.some((item) => item.value === requestedType)
      ? requestedType
      : ''

    if (!validType && !requestedDescription) {
      return
    }

    lastPrefillRef.current = signature
    setForm((previous) => ({
      ...previous,
      type: validType || previous.type,
      description: requestedDescription || previous.description,
    }))
    setErrors((previous) => ({
      ...previous,
      type: undefined,
      description: undefined,
    }))

    if (searchParams.get('source') === 'voice') {
      toast.success('Voice report details were added. Review and submit with location and media.')
    }
  }, [searchParams])

  const mediaPreviews = useMemo(
    () =>
      mediaFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith('video/'),
      })),
    [mediaFiles],
  )

  useEffect(() => {
    return () => {
      mediaPreviews.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    }
  }, [mediaPreviews])

  const reverseGeocode = useCallback(async (lat, lng) => {
    setIsResolvingAddress(true)

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        },
      )
      const payload = await response.json()
      setAddressLabel(payload.display_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      setErrors((previous) => ({ ...previous, address_label: undefined }))
    } catch {
      setAddressLabel(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    } finally {
      setIsResolvingAddress(false)
    }
  }, [])

  const detectLocation = useCallback((showFeedback = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const message = 'This device cannot share live location here. Drag the marker to the incident spot.'
      setLocationNotice(message)
      if (showFeedback) {
        toast.error(message)
      }
      return
    }

    if (!canUseLiveGeolocation) {
      const message = 'Live GPS is unavailable in this session. You can still report by dragging the marker on the map.'
      setLocationNotice(message)
      if (showFeedback) {
        toast(message)
      }
      return
    }

    setIsLocating(true)
    setLocationNotice('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setLocationNotice('')
        setIsLocating(false)
      },
      (error) => {
        const message = geolocationFailureMessage(error)
        setLocationNotice(message)
        if (showFeedback) {
          toast.error(message)
        }
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }, [canUseLiveGeolocation])

  useEffect(() => {
    detectLocation()
  }, [detectLocation])

  useEffect(() => {
    if (!isGuestMode) {
      return undefined
    }

    let active = true

    const loadGuestQuota = async () => {
      try {
        const response = await api.get('/api/v1/incidents/guest/quota', {
          headers: guestHeaders(),
          cache: false,
        })
        const quota = response.data?.data?.guest_quota ?? DEFAULT_GUEST_QUOTA

        if (!active) {
          return
        }

        setGuestQuota(quota)

        if (quota.limit_reached) {
          setGuestLimitModalOpen(true)
        }
      } catch {
        // Quota is enforced server-side during submit even if this display call fails.
      }
    }

    loadGuestQuota()

    return () => {
      active = false
    }
  }, [isGuestMode])

  useEffect(() => {
    const timer = setTimeout(() => {
      reverseGeocode(location.lat, location.lng)
    }, 300)

    return () => clearTimeout(timer)
  }, [location, reverseGeocode])

  const setFieldValue = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  const addFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles ?? [])
    if (nextFiles.length === 0) {
      return
    }

    const remainingSlots = Math.max(0, MAX_REPORT_MEDIA_FILES - mediaFiles.length)
    const acceptedFiles = nextFiles.slice(0, remainingSlots)
    const mediaError = acceptedFiles.length < nextFiles.length
      ? `You can attach up to ${MAX_REPORT_MEDIA_FILES} files per report.`
      : undefined

    setMediaFiles((previous) => [...previous, ...acceptedFiles])
    setErrors((previous) => ({ ...previous, media: mediaError }))
  }

  const removeFile = (indexToRemove) => {
    setMediaFiles((previous) => previous.filter((_, index) => index !== indexToRemove))
  }

  const buildReportPayload = (forceSubmit = false, clientUuid = createClientUuid()) => {
    const normalizedAddress = addressLabel || `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
    const payload = {
      client_uuid: clientUuid,
      type: form.type,
      description: form.description,
      incident_datetime: serializeDateTimeLocal(form.incident_datetime),
      latitude: String(location.lat),
      longitude: String(location.lng),
      address_label: normalizedAddress,
    }

    if (clientTimezone) {
      payload.client_timezone = clientTimezone
    }

    if (forceSubmit) {
      payload.force_submit = '1'
    }

    return payload
  }

  const validateReportInput = () => {
    const nextErrors = {}

    if (!form.type) {
      nextErrors.type = 'Choose the incident type that fits best.'
    }

    if (form.description.trim().length < 20) {
      nextErrors.description = 'Add a few more details so responders know what to look for.'
    }

    if (!form.incident_datetime) {
      nextErrors.incident_datetime = 'Add when this happened.'
    } else {
      const incidentTime = new Date(serializeDateTimeLocal(form.incident_datetime)).getTime()

      if (!Number.isFinite(incidentTime) || incidentTime > Date.now()) {
        nextErrors.incident_datetime = 'Use the current time or an earlier time.'
      }
    }

    if (!addressLabel && (!Number.isFinite(location.lat) || !Number.isFinite(location.lng))) {
      nextErrors.address_label = 'Set the incident location on the map.'
    }

    if (mediaFiles.length === 0) {
      nextErrors.media = 'Attach at least 1 photo or video if it is safe to do so.'
    } else if (mediaFiles.length > MAX_REPORT_MEDIA_FILES) {
      nextErrors.media = `You can attach up to ${MAX_REPORT_MEDIA_FILES} files per report.`
    }

    return nextErrors
  }

  const resetReportForm = () => {
    setForm({
      type: '',
      description: '',
      incident_datetime: nowForDateTimeLocal(),
    })
    setMediaFiles([])
  }

  const queueOfflineSubmission = async (clientUuid = createClientUuid()) => {
    const { queueOfflineReport, syncPendingReports } = await import('../offline/offlineReports')
    const endpoint = isGuestMode ? '/api/v1/incidents/guest' : '/api/v1/incidents'

    await queueOfflineReport({
      payload: buildReportPayload(true, clientUuid),
      mediaFiles,
      endpoint,
      headers: isGuestMode ? guestHeaders() : {},
      reporterMode: isGuestMode ? 'guest' : 'citizen',
    })

    window.setTimeout(() => {
      syncPendingReports().catch(() => {
        // Background sync errors are recorded in IndexedDB by the offline queue.
      })
    }, 0)

    resetReportForm()
    toast.success('Report saved offline. It will sync automatically when connection returns.')
  }

  const submitIncident = async (forceSubmit = false) => {
    if (guestLimitReached) {
      setGuestLimitModalOpen(true)
      return
    }

    const clientErrors = validateReportInput()

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    const clientUuid = createClientUuid()
    const payload = buildReportPayload(forceSubmit, clientUuid)

    if (browserIsOffline()) {
      try {
        await queueOfflineSubmission(clientUuid)
      } catch (error) {
        toast.error(error?.message ?? 'Unable to save report offline.')
      } finally {
        setIsSubmitting(false)
      }

      return
    }

    const formData = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value))
      }
    })
    mediaFiles.forEach((file) => formData.append('media[]', file))

    try {
      const endpoint = isGuestMode ? '/api/v1/incidents/guest' : '/api/v1/incidents'
      const response = await api.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(isGuestMode ? guestHeaders() : {}),
        },
      })
      const quota = response.data?.data?.guest_quota

      if (quota) {
        setGuestQuota(quota)
      }

      toast.success('Emergency report submitted successfully.')

      if (isGuestMode) {
        resetReportForm()

        if (quota?.limit_reached) {
          setGuestLimitModalOpen(true)
        }
      } else {
        navigate('/my-reports')
      }
    } catch (error) {
      if (error?.response?.status === 409 && error?.response?.data?.duplicate && !forceSubmit) {
        const quota = error.response.data?.data?.guest_quota
        if (quota) {
          setGuestQuota(quota)
        }
        setDuplicateModal({
          open: true,
          message: error.response.data.message,
        })
        return
      }

      if (error?.response?.status === 429 && error?.response?.data?.code === 'guest_report_limit_reached') {
        const quota = error.response.data?.data?.guest_quota ?? { ...DEFAULT_GUEST_QUOTA, limit_reached: true, remaining: 0 }
        setGuestQuota(quota)
        setGuestLimitModalOpen(true)
        return
      }

      if (isNetworkSubmitFailure(error)) {
        try {
          await queueOfflineSubmission(clientUuid)
        } catch (offlineError) {
          toast.error(offlineError?.message ?? 'Unable to save report offline.')
        }

        return
      }

      const parsed = parseApiError(error)
      setErrors(parsed.fields)
      toast.error(parsed.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    await submitIncident(false)
  }

  return (
    <div className="min-h-screen bg-panel px-3 py-4 pb-28 sm:px-4 sm:py-8 sm:pb-10">
      <div className="mx-auto w-full max-w-[760px] space-y-4 sm:space-y-5">
        <header className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-danger">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Emergency report
              </p>
              <h1 className="mt-3 font-heading text-4xl italic leading-none text-navy sm:text-5xl">
                {t('Report')} {t('Emergency')}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
                {isGuestMode
                  ? 'Send the essentials now. Add the exact spot, what happened, and safe evidence.'
                  : 'Share the incident location, details, and evidence so responders can verify quickly.'}
              </p>
            </div>
            {isCitizenReporter ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <LanguageSwitcher />
                <Link
                  to="/my-reports"
                  className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy transition hover:border-danger hover:text-danger sm:flex-none ${focusRingClass}`}
                >
                  My Reports
                </Link>
              </div>
            ) : (
              <div className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 sm:w-auto sm:flex sm:justify-end">
                <LanguageSwitcher />
                <Link
                  to="/login"
                  state={guestAuthState}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy transition hover:border-danger hover:text-danger ${focusRingClass}`}
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Login
                </Link>
                <Link
                  to="/register"
                  state={guestAuthState}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 ${focusRingClass}`}
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Register
                </Link>
              </div>
            )}
          </div>
        </header>

        <OfflineQueueIndicator />

        {isGuestMode && (
          <section className={`rounded-2xl border p-4 shadow-sm ${
            guestLimitReached ? 'border-danger/30 bg-danger/5' : 'border-info/20 bg-white'
          }`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Guest mode</p>
                <h2 className="mt-1 text-base font-semibold text-navy sm:text-lg">
                  {guestLimitReached ? 'Guest report limit reached' : 'Quick report mode'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {guestLimitReached
                    ? 'Create an account or log in to continue reporting from this device.'
                    : `${guestQuota.remaining} guest report${guestQuota.remaining === 1 ? '' : 's'} remaining on this device.`}
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy">
                <CheckCircle2 className={`h-4 w-4 ${guestLimitReached ? 'text-danger' : 'text-success'}`} aria-hidden="true" />
                {guestQuota.used}/{guestQuota.limit} used
              </div>
            </div>
            {guestLimitReached && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Link
                  to="/login"
                  state={guestAuthState}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-danger hover:text-danger ${focusRingClass}`}
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Login
                </Link>
                <button
                  type="button"
                  onClick={() => navigate('/register', { state: guestAuthState })}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc1f34] ${focusRingClass}`}
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Create Account
                </button>
              </div>
            )}
          </section>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-4 shadow-card sm:p-5 md:p-6">
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionHeader
                eyebrow="Step 1"
                title="Pin the location"
                description="Use GPS first, then drag the marker if the pin is off."
                icon={MapPin}
              />
              <button
                type="button"
                onClick={() => detectLocation(true)}
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy transition hover:border-danger hover:text-danger sm:w-auto ${focusRingClass}`}
                aria-label="Detect my current location again"
              >
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                {isLocating ? 'Detecting...' : 'Re-detect Location'}
              </button>
            </div>

            <div className="h-[18rem] overflow-hidden rounded-xl border border-slate-200 shadow-sm sm:h-80">
              <MapContainer center={location} zoom={15} className="h-full w-full">
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <RecenterMap position={location} />
                <DraggableLocationMarker position={location} onLocationChange={setLocation} />
              </MapContainer>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="rounded-xl border border-slate-200 bg-panel px-4 py-3 text-sm text-slate-600">
                <p className="flex items-center gap-2 font-semibold text-navy">
                  <Navigation className="h-4 w-4 text-danger" aria-hidden="true" />
                  Incident address
                </p>
                <p className="mt-1 leading-relaxed">
                  {isResolvingAddress ? 'Finding the nearest address...' : addressLabel || 'Move the marker to set the address.'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <p className="font-semibold text-navy">Adjust manually</p>
                <p className="mt-1">Drag the red marker to the safest known spot.</p>
              </div>
            </div>
            {locationNotice ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {locationNotice}
              </div>
            ) : null}
            <FieldError id="location-error">{errors.address_label}</FieldError>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-5">
            <SectionHeader
              eyebrow="Step 2"
              title="What happened?"
              description="Pick the closest type and add the details responders need first."
              icon={AlertTriangle}
            />

            <div>
              <p className="mb-2 text-sm font-semibold text-navy">Incident type</p>
              <div
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                role="radiogroup"
                aria-label="Incident type"
                aria-describedby="type-error"
              >
                {INCIDENT_TYPES.map((typeOption) => {
                  const Icon = typeOption.icon
                  const isActive = form.type === typeOption.value

                  return (
                    <button
                      key={typeOption.value}
                      type="button"
                      onClick={() => setFieldValue('type', typeOption.value)}
                      className={`inline-flex min-h-[4.5rem] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center text-sm font-semibold transition sm:min-h-[4rem] sm:flex-row sm:px-3 ${
                        isActive
                          ? `${typeOption.chipClass} border-danger ring-2 ring-danger/25`
                          : 'border-slate-200 bg-white text-slate-700 hover:border-danger/40 hover:bg-danger/5'
                      } ${focusRingClass}`}
                      role="radio"
                      aria-checked={isActive}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{t(typeOption.label)}</span>
                      {isActive ? <span className="sr-only">selected</span> : null}
                    </button>
                  )
                })}
              </div>
              <FieldError id="type-error">{errors.type}</FieldError>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-navy" htmlFor="report-description">Description</label>
              <textarea
                id="report-description"
                className="form-input min-h-32 resize-none text-base sm:text-sm"
                value={form.description}
                onChange={(event) => setFieldValue('description', event.target.value)}
                placeholder="Example: Fire in a kitchen near Valencia Public Market. Smoke visible. Two people may be inside."
                aria-describedby="description-help description-count description-error"
                aria-invalid={Boolean(errors.description)}
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <p id="description-help">Include landmark, visible danger, number of people affected, and access notes.</p>
                <p id="description-count">{form.description.length}/1000</p>
              </div>
              <FieldError id="description-error">{errors.description}</FieldError>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-navy" htmlFor="incident-datetime">Date & time</label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="incident-datetime"
                  type="datetime-local"
                  className="form-input pl-11 text-base sm:text-sm"
                  value={form.incident_datetime}
                  onChange={(event) => setFieldValue('incident_datetime', event.target.value)}
                  max={nowForDateTimeLocal()}
                  aria-describedby="incident-datetime-error"
                  aria-invalid={Boolean(errors.incident_datetime)}
                />
              </div>
              <FieldError id="incident-datetime-error">{errors.incident_datetime}</FieldError>
            </div>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionHeader
                eyebrow="Step 3"
                title="Add photo or video"
                description="Attach evidence only if it is safe. Photos and short videos help verification."
                icon={Camera}
              />
              <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-panel px-3 py-2 text-sm font-semibold text-navy">
                <ImagePlus className="h-4 w-4 text-danger" aria-hidden="true" />
                {mediaCountLabel}
              </div>
            </div>

            <div
              className={`rounded-xl border-2 border-dashed p-4 transition ${
                mediaSlotsRemaining > 0
                  ? 'border-danger/40 bg-danger/5 hover:border-danger/70'
                  : 'border-slate-200 bg-slate-50'
              }`}
              onDrop={(event) => {
                event.preventDefault()
                addFiles(event.dataTransfer.files)
              }}
              onDragOver={(event) => event.preventDefault()}
            >
              <label
                htmlFor="report-media-input"
                className={`flex min-h-36 flex-col items-center justify-center gap-2 text-center ${mediaSlotsRemaining > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
              >
                <UploadCloud className="h-10 w-10 text-danger" aria-hidden="true" />
                <p className="text-base font-semibold text-navy">
                  {mediaSlotsRemaining > 0 ? 'Tap to add photo or video' : 'Media limit reached'}
                </p>
                <p className="text-sm text-slate-600">
                  JPG, PNG, MP4, or MOV. {mediaSlotsRemaining} slot{mediaSlotsRemaining === 1 ? '' : 's'} left.
                </p>
                <input
                  id="report-media-input"
                  type="file"
                  className="sr-only"
                  accept=".jpg,.jpeg,.png,.mp4,.mov"
                  multiple
                  onChange={(event) => addFiles(event.target.files)}
                  disabled={mediaSlotsRemaining === 0}
                  aria-label="Upload incident photos or videos"
                  aria-describedby="media-error media-file-error"
                  aria-invalid={Boolean(errors.media || errors['media.0'])}
                />
              </label>
            </div>

            {mediaFiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {mediaPreviews.map((item, index) => {
                  const MediaIcon = item.isVideo ? FileVideo : ImagePlus

                  return (
                    <div key={`${item.file.name}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="relative">
                      {item.isVideo ? (
                          <video src={item.previewUrl} className="h-32 w-full object-cover sm:h-24" aria-label={`Preview video ${item.file.name}`} />
                      ) : (
                          <img src={item.previewUrl} alt={`Preview of ${item.file.name}`} className="h-32 w-full object-cover sm:h-24" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                          className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-danger shadow transition hover:bg-danger hover:text-white ${focusRingClass}`}
                          aria-label={`Remove ${item.file.name}`}
                      >
                          <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600">
                        <MediaIcon className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy">{item.file.name}</p>
                          <p>{formatFileSize(item.file)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <FieldError id="media-error">{errors.media}</FieldError>
            <FieldError id="media-file-error">{errors['media.0']}</FieldError>
          </section>

          <button
            type="submit"
            disabled={isSubmitting || guestLimitReached}
            className={`sticky bottom-3 z-20 flex min-h-14 w-full items-center justify-center rounded-2xl bg-danger px-4 py-4 text-base font-bold text-white shadow-card transition hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60 sm:static ${focusRingClass}`}
            aria-label={guestLimitReached ? 'Create an account to continue reporting' : 'Submit emergency report'}
          >
            {guestLimitReached ? 'Create an Account to Continue' : isSubmitting ? 'Submitting...' : `${t('Submit')} ${t('Emergency')} ${t('Report')}`}
          </button>
        </form>
      </div>

      {duplicateModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/75 px-4" role="dialog" aria-modal="true" aria-labelledby="duplicate-report-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" aria-hidden="true" />
              <div>
                <h3 id="duplicate-report-title" className="text-lg font-semibold text-navy">Possible Duplicate Report</h3>
                <p className="mt-1 text-sm text-slate-600">{duplicateModal.message}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={() => setDuplicateModal({ open: false, message: '' })}
                className={`min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-navy ${focusRingClass}`}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDuplicateModal({ open: false, message: '' })
                  await submitIncident(true)
                }}
                className={`min-h-11 rounded-xl bg-warning px-3 py-2 text-sm font-semibold text-white ${focusRingClass}`}
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {guestLimitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/75 px-4" role="dialog" aria-modal="true" aria-labelledby="guest-limit-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <UserPlus className="mt-0.5 h-5 w-5 text-danger" aria-hidden="true" />
              <div>
                <h3 id="guest-limit-title" className="text-lg font-semibold text-navy">Create an account to continue</h3>
                <p className="mt-1 text-sm text-slate-600">
                  You've reached the maximum number of reports. Create an account to continue reporting and track your incidents.
                </p>
                <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                  Guest usage: {guestQuota.used}/{guestQuota.limit} reports submitted.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Link
                to="/login"
                state={{ ...guestAuthState, fromGuestLimit: true }}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-navy ${focusRingClass}`}
              >
                Login
              </Link>
              <button
                type="button"
                onClick={() => setGuestLimitModalOpen(false)}
                className={`min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-navy ${focusRingClass}`}
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => navigate('/register', { state: { ...guestAuthState, fromGuestLimit: true } })}
                className={`min-h-11 rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white sm:col-auto ${focusRingClass}`}
              >
                Register
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ eyebrow, title, description, icon }) {
  const HeadingIcon = icon

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <HeadingIcon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-0.5 text-lg font-semibold text-navy">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
    </div>
  )
}

function FieldError({ id, children }) {
  if (!children) {
    return null
  }

  return (
    <p id={id} className="mt-2 inline-flex items-start gap-1.5 text-sm font-medium text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

function formatFileSize(file) {
  if (!file?.size) {
    return ''
  }

  const megabytes = file.size / (1024 * 1024)
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`
}

export default ReportPage
