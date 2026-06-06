import { CheckCircle2, Loader2, LogOut, MapPin, Navigation, RefreshCw, ShieldCheck, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import BrandMark from '../components/BrandMark'
import LanguageSwitcher from '../components/LanguageSwitcher'
import StatusPill from '../components/incident/StatusPill'
import NotificationBell from '../components/notifications/NotificationBell'
import { useAuth } from '../context/AuthContext'
import { getIncidentType, INCIDENT_TYPES } from '../data/incidentTypes'
import { api } from '../lib/api'
import { timeAgo } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'
import { useI18n } from '../lib/i18n'

const ACTIVE_MISSION_STATUSES = new Set(['verified', 'under_assessment', 'responding'])
const EXTRA_SKILLS = [
  { value: 'first_aid', label: 'First Aid' },
  { value: 'evacuation', label: 'Evacuation' },
  { value: 'communications', label: 'Communications' },
  { value: 'logistics', label: 'Logistics' },
]
const SKILL_OPTIONS = [
  ...INCIDENT_TYPES.map((type) => ({ value: type.value, label: type.label })),
  ...EXTRA_SKILLS,
]

function distanceInMeters(from, to) {
  const earthRadius = 6371000
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180
  const lat1 = (from.latitude * Math.PI) / 180
  const lat2 = (to.latitude * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadius * c
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return 'Unknown distance'
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  return `${(meters / 1000).toFixed(1)} km`
}

function VolunteerDashboardPage() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [profile, setProfile] = useState(() => ({
    is_volunteer: Boolean(user?.is_volunteer),
    volunteer_skills: Array.isArray(user?.volunteer_skills) ? user.volunteer_skills : [],
    volunteer_availability: Boolean(user?.volunteer_availability),
  }))
  const [selectedSkills, setSelectedSkills] = useState(profile.volunteer_skills)
  const [available, setAvailable] = useState(profile.volunteer_availability)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [missionLoading, setMissionLoading] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [acceptingId, setAcceptingId] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const nextProfile = {
      is_volunteer: Boolean(user?.is_volunteer),
      volunteer_skills: Array.isArray(user?.volunteer_skills) ? user.volunteer_skills : [],
      volunteer_availability: Boolean(user?.volunteer_availability),
    }

    setProfile(nextProfile)
    setSelectedSkills(nextProfile.volunteer_skills)
    setAvailable(nextProfile.volunteer_availability)
  }, [user?.id, user?.is_volunteer, user?.volunteer_availability, user?.volunteer_skills])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Location services are not supported by this browser.')
      return
    }

    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setLocationLoading(false)
      },
      () => {
        toast.error('Unable to detect your current location.')
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    )
  }, [])

  useEffect(() => {
    refreshLocation()
  }, [refreshLocation])

  const fetchMissions = useCallback(async () => {
    setMissionLoading(true)

    try {
      const response = await api.get('/api/v1/public/incidents/map', { cache: false })
      setIncidents(response.data?.data?.incidents ?? [])
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setMissionLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMissions()
  }, [fetchMissions])

  const nearbyMissions = useMemo(() => {
    if (!currentLocation) {
      return []
    }

    return incidents
      .filter((incident) => ACTIVE_MISSION_STATUSES.has(incident.status))
      .map((incident) => {
        const distance = distanceInMeters(currentLocation, {
          latitude: Number(incident.latitude),
          longitude: Number(incident.longitude),
        })

        return { ...incident, distance_meters: distance }
      })
      .filter((incident) => incident.distance_meters <= 5000)
      .filter((incident) => {
        if (!profile.is_volunteer || profile.volunteer_skills.length === 0) {
          return true
        }

        return profile.volunteer_skills.includes(incident.type) || profile.volunteer_skills.includes('other')
      })
      .sort((a, b) => a.distance_meters - b.distance_meters)
  }, [currentLocation, incidents, profile.is_volunteer, profile.volunteer_skills])

  const toggleSkill = (skill) => {
    setSelectedSkills((current) => (
      current.includes(skill)
        ? current.filter((item) => item !== skill)
        : [...current, skill]
    ))
  }

  const saveVolunteerProfile = async (event) => {
    event.preventDefault()

    if (!isOnline) {
      toast.error('Volunteer profile updates require a connection.')
      return
    }

    if (selectedSkills.length === 0) {
      toast.error('Select at least one response skill.')
      return
    }

    setSavingProfile(true)

    try {
      const response = await api.post('/api/v1/volunteers/register', {
        volunteer_skills: selectedSkills,
        volunteer_availability: available,
        latitude: currentLocation?.latitude,
        longitude: currentLocation?.longitude,
        accuracy: currentLocation?.accuracy,
      })
      const nextProfile = response.data?.data?.volunteer

      setProfile({
        is_volunteer: Boolean(nextProfile?.is_volunteer),
        volunteer_skills: Array.isArray(nextProfile?.volunteer_skills) ? nextProfile.volunteer_skills : selectedSkills,
        volunteer_availability: Boolean(nextProfile?.volunteer_availability),
      })
      toast.success('Volunteer profile updated.')
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setSavingProfile(false)
    }
  }

  const acceptMission = async (incidentId) => {
    if (!isOnline) {
      toast.error('Mission acceptance requires a connection.')
      return
    }

    setAcceptingId(incidentId)

    try {
      await api.post(`/api/v1/volunteers/incidents/${incidentId}/accept`, {
        latitude: currentLocation?.latitude,
        longitude: currentLocation?.longitude,
        accuracy: currentLocation?.accuracy,
      })
      toast.success('Mission accepted. Follow official responder guidance.')
      await fetchMissions()
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-panel">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <Link to="/" className="max-w-[180px]">
            <BrandMark />
          </Link>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:justify-start">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 md:inline-flex">
              <UserCircle2 className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold text-navy">{user?.full_name}</span>
            </div>
            <Link
              to="/report"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy hover:border-danger hover:text-danger sm:min-h-12"
            >
              {t('Report')}
            </Link>
            <LanguageSwitcher className="hidden md:inline-flex" />
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy hover:border-danger hover:text-danger sm:min-h-12"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
            <NotificationBell size="sm" align="right" />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5 pb-8 md:grid-cols-[360px_1fr] md:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Community Response</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Volunteer Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">Register skills and view active missions within 5 km.</p>
            </div>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${profile.is_volunteer ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-500'}`}>
              {profile.is_volunteer ? 'Registered' : 'Not active'}
            </span>
          </div>

          {!isOnline && (
            <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-semibold text-navy">
              Offline mode. Registration and mission acceptance are paused.
            </div>
          )}

          <form className="mt-5 space-y-4" onSubmit={saveVolunteerProfile}>
            <div>
              <label className="text-sm font-semibold text-navy">Response skills</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {SKILL_OPTIONS.map((skill) => (
                  <label
                    key={skill.value}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
                      selectedSkills.includes(skill.value)
                        ? 'border-danger bg-danger/10 text-danger'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-danger"
                      checked={selectedSkills.includes(skill.value)}
                      onChange={() => toggleSkill(skill.value)}
                    />
                    {t(skill.label)}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-panel px-3 py-3">
              <span>
                <span className="block text-sm font-semibold text-navy">Available for dispatch</span>
                <span className="text-xs text-slate-500">Shown only when your GPS is current.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-danger"
                checked={available}
                onChange={(event) => setAvailable(event.target.checked)}
              />
            </label>

            <div className="rounded-xl border border-slate-200 bg-panel px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">GPS location</p>
                  <p className="truncate text-xs text-slate-500">
                    {currentLocation
                      ? `${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}`
                      : 'Waiting for location'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshLocation}
                  disabled={locationLoading}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-navy hover:border-danger hover:text-danger disabled:opacity-50"
                  aria-label="Refresh location"
                >
                  {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile || !isOnline}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Save Volunteer Profile
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-info">Nearby Missions</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">{nearbyMissions.length} active within 5 km</h2>
              </div>
              <button
                type="button"
                onClick={fetchMissions}
                disabled={missionLoading}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy hover:border-danger hover:text-danger disabled:opacity-50"
              >
                {missionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {missionLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-danger" />
                <p className="mt-2">Loading nearby missions...</p>
              </div>
            ) : !currentLocation ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                Allow location access to see nearby missions.
              </div>
            ) : nearbyMissions.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No active missions are currently nearby.
              </div>
            ) : (
              nearbyMissions.map((incident) => {
                const type = getIncidentType(incident.type)
                const Icon = type.icon
                const canAccept = profile.is_volunteer && profile.volunteer_availability && isOnline

                return (
                  <article key={incident.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${type.chipClass}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-navy">{t(type.label)}</p>
                            <StatusPill status={incident.status} size="sm" translate />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{timeAgo(incident.created_at)}</p>
                          <p className="mt-2 flex items-start gap-1 text-sm text-slate-600">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                            <span>{incident.address_label}</span>
                          </p>
                          <p className="mt-2 text-xs font-semibold text-info">
                            {formatDistance(incident.distance_meters)} from your current location
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => acceptMission(incident.id)}
                        disabled={!canAccept || acceptingId === incident.id}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-xs font-semibold text-white hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {acceptingId === incident.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Accept Mission
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default VolunteerDashboardPage
