import { AlertTriangle, ImagePlus, LocateFixed, UploadCloud, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { INCIDENT_TYPES } from '../data/incidentTypes'
import { api } from '../lib/api'
import { nowForDateTimeLocal, serializeDateTimeLocal } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'

const DEFAULT_LOCATION = { lat: 7.9062, lng: 125.0936 }

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
      return 'Location permission was denied. Allow location access or drag the marker manually.'
    case 2:
      return 'Your device could not determine a precise position. Adjust the marker manually.'
    case 3:
      return 'Location detection timed out. Try again or adjust the marker manually.'
    default:
      return 'Unable to detect your live location. Adjust the marker manually.'
  }
}

function ReportPage() {
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
  const navigate = useNavigate()
  const canUseLiveGeolocation = supportsLiveGeolocation()
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
      const message = 'Live GPS is not supported on this device/browser. Adjust the marker manually.'
      setLocationNotice(message)
      if (showFeedback) {
        toast.error(message)
      }
      return
    }

    if (!canUseLiveGeolocation) {
      const message = 'Live GPS requires HTTPS or localhost on mobile browsers. Adjust the marker manually while testing over LAN.'
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

    setMediaFiles((previous) => [...previous, ...nextFiles])
    setErrors((previous) => ({ ...previous, media: undefined }))
  }

  const removeFile = (indexToRemove) => {
    setMediaFiles((previous) => previous.filter((_, index) => index !== indexToRemove))
  }

  const submitIncident = async (forceSubmit = false) => {
    if (mediaFiles.length === 0) {
      setErrors((previous) => ({ ...previous, media: 'At least 1 photo or video is required.' }))
      return
    }

    setIsSubmitting(true)
    setErrors({})

    const formData = new FormData()
    const normalizedAddress = addressLabel || `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
    formData.append('type', form.type)
    formData.append('description', form.description)
    formData.append('incident_datetime', serializeDateTimeLocal(form.incident_datetime))
    if (clientTimezone) {
      formData.append('client_timezone', clientTimezone)
    }
    formData.append('latitude', String(location.lat))
    formData.append('longitude', String(location.lng))
    formData.append('address_label', normalizedAddress)
    mediaFiles.forEach((file) => formData.append('media[]', file))

    if (forceSubmit) {
      formData.append('force_submit', '1')
    }

    try {
      await api.post('/api/v1/incidents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      toast.success('Emergency report submitted successfully.')
      navigate('/my-reports')
    } catch (error) {
      if (error?.response?.status === 409 && error?.response?.data?.duplicate && !forceSubmit) {
        setDuplicateModal({
          open: true,
          message: error.response.data.message,
        })
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
    <div className="min-h-screen bg-panel px-4 py-8">
      <div className="mx-auto w-full max-w-[700px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-4xl italic text-navy">Report Emergency</h1>
            <p className="text-sm text-slate-500">Submit an incident with GPS location and evidence.</p>
          </div>
          <Link
            to="/my-reports"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-navy hover:border-danger hover:text-danger"
          >
            My Reports
          </Link>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-5 shadow-card md:p-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Step 1 - Location</h2>
              <button
                type="button"
                onClick={() => detectLocation(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-navy hover:border-danger hover:text-danger"
              >
                <LocateFixed className="h-4 w-4" />
                {isLocating ? 'Detecting...' : 'Re-detect Location'}
              </button>
            </div>

            <div className="h-80 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <MapContainer center={location} zoom={15} className="h-full w-full">
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <RecenterMap position={location} />
                <DraggableLocationMarker position={location} onLocationChange={setLocation} />
              </MapContainer>
            </div>

            <div className="rounded-xl border border-slate-200 bg-panel px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-navy">Detected Address</p>
              <p className="mt-1">
                {isResolvingAddress ? 'Resolving location...' : addressLabel || 'Waiting for location...'}
              </p>
            </div>
            {locationNotice ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {locationNotice}
              </div>
            ) : null}
            {errors.address_label && <p className="error-text">{errors.address_label}</p>}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Step 2 - Incident Details</h2>

            <div>
              <p className="mb-2 text-sm font-medium text-navy">Incident Type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INCIDENT_TYPES.map((typeOption) => {
                  const Icon = typeOption.icon
                  const isActive = form.type === typeOption.value

                  return (
                    <button
                      key={typeOption.value}
                      type="button"
                      onClick={() => setFieldValue('type', typeOption.value)}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        isActive
                          ? `${typeOption.chipClass} ring-2 ring-danger/25`
                          : 'border-slate-200 bg-white text-slate-600 hover:border-danger/40'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {typeOption.label}
                    </button>
                  )
                })}
              </div>
              {errors.type && <p className="error-text">{errors.type}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <textarea
                className="form-input min-h-28 resize-none"
                value={form.description}
                onChange={(event) => setFieldValue('description', event.target.value)}
                placeholder="Describe the incident clearly. Include landmarks and current risks."
              />
              <p className="mt-1 text-xs text-slate-500">{form.description.length}/1000</p>
              {errors.description && <p className="error-text">{errors.description}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Date & Time</label>
              <input
                type="datetime-local"
                className="form-input"
                value={form.incident_datetime}
                onChange={(event) => setFieldValue('incident_datetime', event.target.value)}
                max={nowForDateTimeLocal()}
              />
              {errors.incident_datetime && <p className="error-text">{errors.incident_datetime}</p>}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Step 3 - Evidence</h2>

            <div
              className="rounded-xl border-2 border-dashed border-danger/35 bg-danger/5 p-4"
              onDrop={(event) => {
                event.preventDefault()
                addFiles(event.dataTransfer.files)
              }}
              onDragOver={(event) => event.preventDefault()}
            >
              <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                <UploadCloud className="h-8 w-8 text-danger" />
                <p className="text-sm font-medium text-navy">Drag-and-drop media or click to upload</p>
                <p className="text-xs text-slate-500">At least 1 photo required (JPG, PNG, MP4, MOV)</p>
                <input
                  type="file"
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.mp4,.mov"
                  multiple
                  onChange={(event) => addFiles(event.target.files)}
                />
              </label>
            </div>

            {mediaFiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {mediaPreviews.map((item, index) => {
                  return (
                    <div key={`${item.file.name}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200">
                      {item.isVideo ? (
                        <video src={item.previewUrl} className="h-24 w-full object-cover" />
                      ) : (
                        <img src={item.previewUrl} alt={item.file.name} className="h-24 w-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute right-1 top-1 rounded-full bg-white p-1 text-danger shadow"
                        aria-label="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500">
                        <ImagePlus className="h-3.5 w-3.5" />
                        <span className="truncate">{item.file.name}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {errors.media && <p className="error-text">{errors.media}</p>}
            {errors['media.0'] && <p className="error-text">{errors['media.0']}</p>}
          </section>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Emergency Report'}
          </button>
        </form>
      </div>

      {duplicateModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/75 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
              <div>
                <h3 className="text-lg font-semibold text-navy">Possible Duplicate Report</h3>
                <p className="mt-1 text-sm text-slate-600">{duplicateModal.message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateModal({ open: false, message: '' })}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDuplicateModal({ open: false, message: '' })
                  await submitIncident(true)
                }}
                className="rounded-lg bg-warning px-3 py-2 text-sm font-semibold text-white"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportPage
