import {
  AlertTriangle,
  CheckCircle2,
  LocateFixed,
  Loader2,
  MapPin,
  ShieldAlert,
  X,
  WifiOff,
  MessageSquare,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import LanguageSwitcher from './LanguageSwitcher'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'
import { guestHeaders } from '../lib/guestReporting'
import { useI18n } from '../lib/i18n'

const COUNTDOWN_SECONDS = 3

// Lazy-loaded components for offline mode - only loaded when needed
const SmsFallbackModal = lazy(() => import('./SmsFallbackModal'))
const OfflineIndicator = lazy(() => import('./OfflineIndicator'))

function canUseGeolocation() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation)
}

function geolocationMessage(error) {
  switch (error?.code) {
    case 1:
      return 'Location permission was denied. Enable GPS access before sending SOS.'
    case 2:
      return 'Your device could not determine a GPS position. Move near an open area and retry.'
    case 3:
      return 'GPS detection timed out. Retry once your signal improves.'
    default:
      return 'Unable to detect your GPS location right now.'
  }
}

// Offline state management
function useOnlineStatus() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOffline
}

function SosPanicButton() {
  const { isAuthenticated, user } = useAuth()
  const { t } = useI18n()
  const [location, setLocation] = useState(null)
  const [locationNotice, setLocationNotice] = useState('Detecting your GPS location...')
  const [isLocating, setIsLocating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [lastAlert, setLastAlert] = useState(null)

  // Offline mode state
  const isOffline = useOnlineStatus()
  const [showSmsModal, setShowSmsModal] = useState(false)
  const [offlineLoaded, setOfflineLoaded] = useState(false)
  const [emergencyContacts, setEmergencyContacts] = useState([])
  const [pendingSosCount, setPendingSosCount] = useState(0)
  const [trackingUrl, setTrackingUrl] = useState('')

  // Dynamic imports for offline functionality
  const [sosQueueModule, setSosQueueModule] = useState(null)

  const isCountingDown = countdown > 0

  // Load offline modules only when offline is detected or SMS modal needed
  useEffect(() => {
    if (!isOffline && !showSmsModal) return

    let cancelled = false

    async function loadOfflineModules() {
      try {
        const [sosQueue] = await Promise.all([
          import('../offline/sosQueue.js'),
        ])

        if (cancelled) return

        setSosQueueModule(sosQueue)
        setOfflineLoaded(true)

        // Load emergency contacts
        const contacts = sosQueue.getEmergencyContacts()
        setEmergencyContacts(contacts)

        // Get pending count
        const count = await sosQueue.getPendingSosCount()
        setPendingSosCount(count)

        // Subscribe to queue changes
        const unsubscribe = sosQueue.onSosQueueChanged(async () => {
          const newCount = await sosQueue.getPendingSosCount()
          setPendingSosCount(newCount)
        })

        return () => {
          unsubscribe?.()
        }
      } catch (error) {
        console.error('Failed to load offline modules:', error)
      }
    }

    loadOfflineModules()

    return () => {
      cancelled = true
    }
  }, [isOffline, showSmsModal])

  // Sync pending SOS alerts when coming back online
  useEffect(() => {
    if (!sosQueueModule || isOffline) return

    let cancelled = false

    async function syncWhenOnline() {
      try {
        const result = await sosQueueModule.syncPendingSos()

        if (cancelled) return

        if (result.started && result.synced > 0) {
          toast.success(`${result.synced} queued SOS alert(s) synced successfully`)

          // Show the last synced alert in the success card
          const lastSynced = result.syncedAlerts?.[result.syncedAlerts.length - 1]
          if (lastSynced) {
            setLastAlert(lastSynced)
          }
        }

        if (result.started && result.failed > 0) {
          toast.error(`${result.failed} SOS alert(s) failed to sync`)
        }
      } catch {
        // Silent fail - sync will retry on next online event
      }
    }

    syncWhenOnline()

    // Also sync on online event
    const handleOnline = () => {
      if (!cancelled) {
        syncWhenOnline()
      }
    }

    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
    }
  }, [sosQueueModule, isOffline])

  const formattedCoordinates = useMemo(() => {
    if (!location) {
      return 'Waiting for GPS fix'
    }

    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
  }, [location])

  const detectLocation = useCallback((showFeedback = false) => {
    if (!canUseGeolocation()) {
      const message = 'GPS is not supported by this device or browser.'
      setLocationNotice(message)
      if (showFeedback) {
        toast.error(message)
      }
      return
    }

    setIsLocating(true)
    setLocationNotice('Detecting your GPS location...')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setLocationNotice('GPS location ready.')
        setIsLocating(false)
      },
      (error) => {
        const message = geolocationMessage(error)
        setLocation(null)
        setLocationNotice(message)
        setIsLocating(false)
        if (showFeedback) {
          toast.error(message)
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }, [])

  useEffect(() => {
    detectLocation()
  }, [detectLocation])

  const submitSosOnline = useCallback(async () => {
    if (!location) {
      toast.error('GPS location is required before sending SOS.')
      detectLocation(true)
      return
    }

    setIsSubmitting(true)

    try {
      const endpoint = isAuthenticated ? '/api/v1/sos' : '/api/v1/sos/guest'
      const response = await api.post(endpoint, {
        latitude: location.latitude,
        longitude: location.longitude,
        type: 'sos',
        description: 'Emergency SOS triggered',
      }, {
        headers: isAuthenticated ? {} : guestHeaders(),
      })

      const alert = response.data?.data?.sos_alert
      setLastAlert(alert ?? null)
      toast.success('SOS sent. Emergency responders have been notified.')
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setIsSubmitting(false)
    }
  }, [detectLocation, isAuthenticated, location])

  const submitSosOffline = useCallback(async () => {
    if (!location || !sosQueueModule) return

    try {
      // Queue the SOS for background sync
      const result = await sosQueueModule.queueOfflineSos({
        latitude: location.latitude,
        longitude: location.longitude,
        type: 'sos',
        description: 'Emergency SOS triggered',
        isAuthenticated,
      })

      // Generate tracking URL
      const url = await sosQueueModule.generateTrackingLink(result.client_uuid)
      setTrackingUrl(url)

      toast.success('SOS queued. It will auto-send once connection returns.')

      // Show SMS fallback modal
      setShowSmsModal(true)
    } catch (error) {
      toast.error('Failed to queue SOS. Please try SMS fallback.')
    }
  }, [location, sosQueueModule, isAuthenticated])

  const submitSos = useCallback(async () => {
    if (!location) {
      toast.error('GPS location is required before sending SOS.')
      detectLocation(true)
      return
    }

    if (isOffline) {
      // Offline mode: queue + SMS fallback
      await submitSosOffline()
    } else {
      // Online mode: direct API call
      await submitSosOnline()
    }
  }, [detectLocation, isOffline, location, submitSosOffline, submitSosOnline])

  useEffect(() => {
    if (!isCountingDown) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setCountdown((current) => {
        if (current <= 1) {
          submitSos()
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [isCountingDown, submitSos])

  const startCountdown = useCallback(() => {
    if (isSubmitting || isCountingDown) {
      return
    }

    if (!location) {
      toast.error('Waiting for GPS before starting SOS countdown.')
      detectLocation(true)
      return
    }

    // If offline, load offline modules now before countdown completes
    if (isOffline && !offlineLoaded) {
      setOfflineLoaded(true) // Trigger useEffect to load modules
    }

    setLastAlert(null)
    setCountdown(COUNTDOWN_SECONDS)
    toast('SOS countdown started. Cancel within 3 seconds if this was accidental.')
  }, [detectLocation, isCountingDown, isOffline, isSubmitting, location, offlineLoaded])

  const cancelCountdown = useCallback(() => {
    setCountdown(0)
    toast.success(`${t('SOS')} cancelled.`)
  }, [t])

  const handleSmsModalClose = useCallback(() => {
    setShowSmsModal(false)
  }, [])

  const handleCopyMessage = useCallback(() => {
    toast.success('Message copied to clipboard')
  }, [])

  const handleOpenSms = useCallback((smsUrl) => {
    window.location.href = smsUrl
    toast.success('Opening SMS app...')
  }, [])

  return (
    <main className="min-h-screen bg-panel px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[680px] flex-col justify-center">
        <section className="admin-surface overflow-hidden p-5 text-center md:p-8">
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher />
          </div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-danger">RescueLink {t('SOS')}</p>
          <h1 className="mt-2 font-heading text-4xl italic text-navy md:text-5xl">{t('Emergency')} Panic Button</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">
            Sends your live GPS coordinates directly to the response team. Use only for immediate emergencies.
          </p>

          {/* Offline indicator - lazy loaded */}
          {isOffline && (
            <div className="mt-4 flex justify-center">
              <Suspense fallback={(
                <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
                  <WifiOff className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold">Offline mode</span>
                </div>
              )}
              >
                <OfflineIndicator pendingCount={pendingSosCount} />
              </Suspense>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-left">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-info/10 text-info">
                {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">{formattedCoordinates}</p>
                <p className="mt-1 text-xs text-slate-500">{locationNotice}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => detectLocation(true)}
              disabled={isLocating || isSubmitting || isCountingDown}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-navy transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LocateFixed className="h-4 w-4" />
              {isLocating ? 'Detecting...' : 'Re-detect GPS'}
            </button>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={startCountdown}
              disabled={!location || isSubmitting || isCountingDown}
              className="relative flex h-56 w-56 items-center justify-center rounded-full bg-danger text-white shadow-[0_22px_60px_rgba(220,38,38,0.36)] transition hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Trigger emergency SOS"
            >
              <span className="absolute inset-4 rounded-full border border-white/30" />
              <span className="flex flex-col items-center">
                {isSubmitting ? (
                  <Loader2 className="mb-3 h-10 w-10 animate-spin" />
                ) : (
                  <AlertTriangle className="mb-3 h-11 w-11" />
                )}
                <span className="text-3xl font-black tracking-wide">
                  {isCountingDown ? countdown : t('SOS')}
                </span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-[0.18em]">
                  {isCountingDown ? 'Sending soon' : isSubmitting ? 'Sending' : isOffline ? 'Offline mode' : 'Press to send'}
                </span>
              </span>
            </button>

            {/* SMS Fallback note when offline */}
            {isOffline && (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <MessageSquare className="h-4 w-4" />
                <span>SMS fallback available when triggered</span>
              </div>
            )}

            {isCountingDown && (
              <button
                type="button"
                onClick={cancelCountdown}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-danger hover:text-danger"
              >
                <X className="h-4 w-4" />
                {t('Cancel')} {t('SOS')}
              </button>
            )}
          </div>

          {lastAlert && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold text-navy">SOS alert received</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Alert #{String(lastAlert.id).slice(0, 8)} is {lastAlert.status}. Keep your phone nearby for responder updates.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
            <Link to="/report" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-navy hover:border-danger hover:text-danger">
              Full Report
            </Link>
            {!isAuthenticated && (
              <Link to="/login" className="rounded-xl bg-navy px-4 py-2 font-semibold text-white hover:bg-slate-800">
                Login
              </Link>
            )}
            {isAuthenticated && user?.role === 'citizen' && (
              <Link to="/my-reports" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-navy hover:border-danger hover:text-danger">
                My Reports
              </Link>
            )}
          </div>
        </section>
      </div>

      {/* SMS Fallback Modal - lazy loaded */}
      {showSmsModal && location && (
        <Suspense fallback={(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="rounded-2xl bg-panel p-8 shadow-2xl">
              <Loader2 className="h-8 w-8 animate-spin text-navy" />
            </div>
          </div>
        )}
        >
          <SmsFallbackModal
            isOpen={showSmsModal}
            onClose={handleSmsModalClose}
            latitude={location.latitude}
            longitude={location.longitude}
            timestamp={Date.now()}
            trackingUrl={trackingUrl || 'RescueLink App'}
            emergencyContacts={emergencyContacts}
            onCopyMessage={handleCopyMessage}
            onOpenSms={handleOpenSms}
          />
        </Suspense>
      )}
    </main>
  )
}

export default SosPanicButton
