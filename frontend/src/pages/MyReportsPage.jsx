import { Loader2, MapPin, Phone, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import StatusPill from '../components/incident/StatusPill'
import { getIncidentType } from '../data/incidentTypes'
import { api } from '../lib/api'
import { formatDateTime, timeAgo } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'

function IncidentDetailModal({ incident, loading, onClose }) {
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

  if (!loading && !incident) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/70 px-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-card md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-3xl italic text-navy">
              {loading ? 'Loading report...' : `Incident #${incident.id.slice(0, 8)}`}
            </h2>
            {!loading && (
              <p className="mt-1 text-sm text-slate-500">
                Submitted {timeAgo(incident.created_at)} • {formatDateTime(incident.incident_datetime)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:border-danger hover:text-danger"
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-danger" />
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="inline-flex items-center gap-2">
                <StatusPill status={incident.status} />
                <span className="text-sm font-semibold text-navy">{getIncidentType(incident.type).label}</span>
              </div>
              <div className="text-xs text-slate-500">Location confirmed via GPS marker</div>
            </div>

            <div className="h-56 overflow-hidden rounded-xl border border-slate-200">
              <MapContainer
                center={[incident.latitude, incident.longitude]}
                zoom={15}
                className="h-full w-full"
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[incident.latitude, incident.longitude]} icon={markerIcon} />
              </MapContainer>
            </div>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Details</h3>
              <div className="mt-2 rounded-xl border border-slate-200 bg-panel p-4 text-sm text-slate-700">
                <p className="font-medium text-navy">{incident.address_label}</p>
                <p className="mt-2 whitespace-pre-wrap">{incident.description}</p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contact</h3>
              <div className="mt-2 rounded-xl border border-slate-200 bg-panel p-4 text-sm">
                <p className="font-medium text-navy">{incident.reporter?.full_name ?? 'Anonymous reporter'}</p>
                {incident.reporter?.phone && (
                  <a
                    href={`tel:${incident.reporter.phone}`}
                    className="mt-1 inline-flex items-center gap-1 text-info hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {incident.reporter.phone}
                  </a>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Media</h3>
              {incident.media?.length ? (
                <div className="mt-2 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {incident.media.map((mediaItem) => (
                    <div key={mediaItem.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {mediaItem.file_type === 'video' ? (
                        <video src={mediaItem.file_url} controls className="h-28 w-full object-cover" />
                      ) : (
                        <img src={mediaItem.file_url} alt="Incident evidence" className="h-28 w-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No evidence files uploaded.</p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Audit Timeline</h3>
              <div className="mt-3 space-y-3">
                {(incident.logs?.length ? incident.logs : [{ id: 'submitted', new_status: incident.status, created_at: incident.created_at, notes: 'Incident submitted.' }]).map((log) => (
                  <div key={log.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-navy">
                      {log.new_status?.replaceAll('_', ' ') ?? 'status update'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {log.changed_by_user ? `${log.changed_by_user.full_name} • ` : ''}
                      {formatDateTime(log.created_at)}
                    </p>
                    {log.notes && <p className="mt-1 text-sm text-slate-600">{log.notes}</p>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function MyReportsPage() {
  const [incidents, setIncidents] = useState([])
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1 })
  const [loading, setLoading] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchMine = async (page = 1) => {
    setLoading(true)

    try {
      const response = await api.get('/api/v1/incidents/mine', { params: { page } })
      const pageData = response.data?.data?.incidents
      setIncidents(pageData?.data ?? [])
      setPagination({
        current_page: pageData?.current_page ?? 1,
        last_page: pageData?.last_page ?? 1,
      })
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMine()
  }, [])

  const openDetail = async (incidentId) => {
    setDetailLoading(true)
    setSelectedIncident(null)

    try {
      const response = await api.get(`/api/v1/incidents/${incidentId}`)
      setSelectedIncident(response.data?.data?.incident ?? null)
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-panel px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-4xl italic text-navy">My Reports</h1>
            <p className="text-sm text-slate-500">Track submitted incidents and response progress.</p>
          </div>
          <Link
            to="/report"
            className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc1f34]"
          >
            New Report
          </Link>
        </header>

        <section className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-card">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-danger" />
              <p className="mt-2 text-sm text-slate-500">Loading reports...</p>
            </div>
          ) : incidents.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-card">
              <p className="text-sm text-slate-500">No reports yet.</p>
            </div>
          ) : (
            incidents.map((incident) => {
              const type = getIncidentType(incident.type)
              const Icon = type.icon

              return (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => openDetail(incident.id)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-danger/40 hover:shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-xl border px-3 py-2 ${type.chipClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy">{type.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{timeAgo(incident.incident_datetime)}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          {incident.description.length > 120
                            ? `${incident.description.slice(0, 117)}...`
                            : incident.description}
                        </p>
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3.5 w-3.5" />
                          {incident.address_label}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={incident.status} />
                  </div>
                </button>
              )
            })
          )}
        </section>

        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-slate-500">
            Page {pagination.current_page} of {pagination.last_page}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.current_page <= 1}
              onClick={() => fetchMine(pagination.current_page - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.current_page >= pagination.last_page}
              onClick={() => fetchMine(pagination.current_page + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <IncidentDetailModal
        incident={selectedIncident}
        loading={detailLoading}
        onClose={() => {
          setSelectedIncident(null)
          setDetailLoading(false)
        }}
      />
    </div>
  )
}

export default MyReportsPage
