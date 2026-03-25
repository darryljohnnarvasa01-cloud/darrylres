import { ArrowLeft, CheckCircle2, LogOut, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import BrandMark from '../../components/BrandMark'
import StatusPill from '../../components/incident/StatusPill'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { getIncidentType } from '../../data/incidentTypes'
import { api } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'

const STATUS_FLOW = {
  verified: 'under_assessment',
  under_assessment: 'responding',
  responding: 'resolved',
}

const STATUS_LABELS = {
  under_assessment: 'Under Assessment',
  responding: 'Responding',
  resolved: 'Resolved',
}

const UNIT_OPTIONS = ['BFP Fire Bureau', 'PNP Police', 'CDRRMO Team', 'Medical/EMS', 'LGU Officials']

const TYPE_COLORS = {
  fire: '#D7263D',
  medical: '#1570EF',
  crime: '#7A5AF8',
  flood: '#0BA5EC',
  accident: '#F79009',
  other: '#98A2B3',
}

function incidentPinIcon(type, status) {
  const color = TYPE_COLORS[type] ?? '#98A2B3'
  const pulse = status === 'responding' || status === 'under_assessment' ? 'pin-pulse' : ''

  return L.divIcon({
    className: 'admin-pin-wrap',
    html: `<span class="admin-pin ${pulse}" style="--pin-color:${color};"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function StaffIncidentDetailPage() {
  const { incidentId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [incident, setIncident] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [unitsCoordinated, setUnitsCoordinated] = useState([])
  const [formError, setFormError] = useState('')
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [staffLocation, setStaffLocation] = useState(null)

  const fetchIncident = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get(`/api/v1/staff/incidents/${incidentId}`)
      setIncident(response.data?.data?.incident ?? null)
    } catch (error) {
      const parsed = parseApiError(error)
      toast.error(parsed.message)
      if (parsed.status === 404) {
        navigate('/staff', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }, [incidentId, navigate])

  useEffect(() => {
    fetchIncident()
  }, [fetchIncident])

  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStaffLocation([position.coords.latitude, position.coords.longitude])
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    )
  }, [])

  const nextStatus = useMemo(() => STATUS_FLOW[incident?.status] ?? '', [incident?.status])
  const isResolved = incident?.status === 'resolved' || Boolean(incident?.resolved_at)
  const timelineLogs = useMemo(() => {
    if (!Array.isArray(incident?.logs)) {
      return []
    }

    return [...incident.logs].sort((left, right) => {
      const leftTime = Date.parse(left.created_at ?? '')
      const rightTime = Date.parse(right.created_at ?? '')

      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime
      }

      return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
    })
  }, [incident?.logs])

  useEffect(() => {
    setSelectedStatus(nextStatus)
  }, [nextStatus])

  const toggleUnit = (unit) => {
    setUnitsCoordinated((current) =>
      current.includes(unit) ? current.filter((item) => item !== unit) : [...current, unit],
    )
  }

  const submitUpdate = useCallback(async () => {
    if (!selectedStatus) {
      setFormError('Select the next status before saving.')
      return
    }

    if (notes.trim().length < 10) {
      setFormError('Field notes must be at least 10 characters.')
      return
    }

    setSubmitting(true)
    setFormError('')

    try {
      await api.patch(`/api/v1/staff/incidents/${incidentId}/status`, {
        status: selectedStatus,
        notes: notes.trim(),
        units_coordinated: unitsCoordinated,
      })

      toast.success('Incident status updated.')
      setNotes('')
      setUnitsCoordinated([])
      await fetchIncident()
    } catch (error) {
      const parsed = parseApiError(error)
      setFormError(parsed.message)
      toast.error(parsed.message)
    } finally {
      setSubmitting(false)
      setShowResolveModal(false)
    }
  }, [fetchIncident, incidentId, notes, selectedStatus, unitsCoordinated])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (selectedStatus === 'resolved') {
      setShowResolveModal(true)
      return
    }

    await submitUpdate()
  }

  const type = getIncidentType(incident?.type)
  const TypeIcon = type.icon
  const mapCenter = incident ? [incident.latitude, incident.longitude] : [7.9062, 125.0936]

  return (
    <div className="min-h-screen bg-panel">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="max-w-[180px]">
            <BrandMark />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:inline-flex">
              <UserCircle2 className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-navy">{user?.full_name}</span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-navy hover:border-danger hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 pb-8 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link to="/staff" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-navy">
            <ArrowLeft className="h-4 w-4" />
            Back to Incidents
          </Link>
          {incident && <p className="text-xs text-slate-500">Incident #{incident.id.slice(0, 8)}</p>}
        </div>

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading incident details...
          </section>
        ) : incident ? (
          <>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
              <div className="h-[250px]">
                <MapContainer center={mapCenter} zoom={15} className="h-full w-full" scrollWheelZoom={false}>
                  <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={mapCenter} icon={incidentPinIcon(incident.type, incident.status)}>
                    <Popup>Incident location</Popup>
                  </Marker>
                  {staffLocation && (
                    <CircleMarker center={staffLocation} radius={8} pathOptions={{ color: '#1570EF', fillColor: '#1570EF', fillOpacity: 0.65 }}>
                      <Popup>Your current location</Popup>
                    </CircleMarker>
                  )}
                </MapContainer>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${type.chipClass}`}>
                  <TypeIcon className="h-4 w-4" />
                  {type.label}
                </span>
                <StatusPill status={incident.status} />
                <span className="text-xs text-slate-500">{timeAgo(incident.incident_datetime ?? incident.created_at)}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-navy">{incident.address_label}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{incident.description}</p>
              <div className="mt-4 rounded-xl bg-panel p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reporter</p>
                <p className="mt-1 text-sm font-semibold text-navy">{incident.reporter?.full_name ?? 'Anonymous/IoT'}</p>
                {incident.reporter?.phone && (
                  <a href={`tel:${incident.reporter.phone}`} className="mt-1 inline-flex min-h-12 items-center text-sm font-semibold text-info hover:underline">
                    {incident.reporter.phone}
                  </a>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <p className="text-sm font-semibold text-navy">Evidence Media</p>
              {incident.media?.length ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {incident.media.map((media) => (
                    <div key={media.id} className="overflow-hidden rounded-xl border border-slate-200 bg-panel">
                      {media.file_type === 'video' ? (
                        <video src={media.file_url} controls className="h-48 w-full bg-black object-cover" />
                      ) : (
                        <img src={media.file_url} alt="Incident evidence" className="h-48 w-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No uploaded evidence.</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <p className="text-sm font-semibold text-navy">Audit Timeline</p>
              {timelineLogs.length ? (
                <div className="relative mt-3 border-l border-slate-200 pl-4">
                  {timelineLogs.map((log) => (
                    <div key={log.id} className="relative pb-4 last:pb-0">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-danger" />
                      <p className="text-sm font-semibold capitalize text-navy">{log.new_status.replaceAll('_', ' ')}</p>
                      <p className="text-xs text-slate-500">
                        {log.changed_by_user?.full_name ?? 'System'} - {formatDateTime(log.created_at)}
                      </p>
                      {log.notes && <p className="mt-1 text-sm text-slate-600">{log.notes}</p>}
                      {Array.isArray(log.units_coordinated) && log.units_coordinated.length > 0 && (
                        <p className="mt-1 text-xs text-slate-500">Units: {log.units_coordinated.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No timeline entries yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card md:sticky md:bottom-0 md:z-20 md:shadow-[0_-10px_24px_rgba(12,35,64,0.08)]">
              {isResolved ? (
                <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-xs text-success sm:text-sm">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-semibold">Resolved - further edits are locked.</span>
                </div>
              ) : (
                <form className="space-y-2" onSubmit={handleSubmit}>
                  <p className="text-sm font-semibold text-navy">Update Incident Status</p>
                  <select
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value)}
                    className="form-input min-h-10 text-sm"
                  >
                    <option value="">Select next status</option>
                    {nextStatus && <option value={nextStatus}>{STATUS_LABELS[nextStatus]}</option>}
                  </select>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="form-input min-h-20 resize-none text-sm"
                    placeholder="Describe what you found on scene..."
                  />
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {UNIT_OPTIONS.map((unit) => (
                      <label key={unit} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 sm:text-sm">
                        <input
                          type="checkbox"
                          checked={unitsCoordinated.includes(unit)}
                          onChange={() => toggleUnit(unit)}
                        />
                        {unit}
                      </label>
                    ))}
                  </div>
                  {formError && <p className="text-sm text-danger">{formError}</p>}
                  <button
                    type="submit"
                    disabled={submitting || !nextStatus}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-[#bc1f34] disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Update'}
                  </button>
                </form>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Incident not found.
          </section>
        )}
      </main>

      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-navy">Confirm Resolution</h3>
            <p className="mt-2 text-sm text-slate-600">
              Marking this incident as resolved will lock further updates. Continue?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-navy"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitUpdate}
                disabled={submitting}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StaffIncidentDetailPage

