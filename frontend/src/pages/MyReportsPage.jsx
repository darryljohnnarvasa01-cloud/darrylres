import { Loader2, MapPin, Phone, Send, Star, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import LanguageSwitcher from '../components/LanguageSwitcher'
import StatusPill from '../components/incident/StatusPill'
import IncidentConversationPanel from '../components/messages/IncidentConversationPanel'
import CitizenResponderTracker from '../components/tracking/CitizenResponderTracker'
import { getIncidentType } from '../data/incidentTypes'
import { api } from '../lib/api'
import { formatDateTime, timeAgo } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'
import { useI18n } from '../lib/i18n'

function IncidentDetailModal({ incident, loading, messageInitiallyOpen, onClose }) {
  const { t } = useI18n()
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
                <StatusPill status={incident.status} translate />
                <span className="text-sm font-semibold text-navy">{t(getIncidentType(incident.type).label)}</span>
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
              <CitizenResponderTracker incidentId={incident.id} />
            </section>

            <IncidentConversationPanel
              incidentId={incident.id}
              mode="citizen"
              initiallyOpen={messageInitiallyOpen}
            />

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

function FeedbackRatingModal({
  incident,
  rating,
  comment,
  submitting,
  onRatingChange,
  onCommentChange,
  onSubmit,
  onClose,
}) {
  if (!incident) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-card md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-success">Incident resolved</p>
            <h2 className="mt-1 font-heading text-3xl italic text-navy">Rate the response</h2>
            <p className="mt-1 text-sm text-slate-500">
              Your feedback helps improve future RescueLink dispatches.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:border-danger hover:text-danger"
            aria-label="Close feedback modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-panel p-4">
          <p className="text-sm font-semibold text-navy">
            {incident.reference_code ?? `Incident #${incident.id.slice(0, 8)}`}
          </p>
          <p className="mt-1 text-sm text-slate-500">{incident.address_label}</p>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-navy">Response rating</p>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onRatingChange(value)}
                className="rounded-xl border border-slate-200 p-2 text-amber-400 transition hover:border-amber-300 hover:bg-amber-50"
                aria-label={`Rate ${value} star${value === 1 ? '' : 's'}`}
              >
                <Star
                  className="h-7 w-7"
                  fill={value <= rating ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-navy">Comment</span>
          <textarea
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
            rows={4}
            maxLength={1000}
            className="form-input mt-2 min-h-28 resize-none"
            placeholder="Share what went well or what should improve."
          />
        </label>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy"
          >
            Later
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || rating === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit rating
          </button>
        </div>
      </div>
    </div>
  )
}

function MyReportsPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const linkedIncidentId = searchParams.get('incident')
  const linkedConversationId = searchParams.get('conversation')
  const [incidents, setIncidents] = useState([])
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1 })
  const [loading, setLoading] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [feedbackTarget, setFeedbackTarget] = useState(null)
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [dismissedFeedbackIds, setDismissedFeedbackIds] = useState(() => new Set())

  const maybePromptForFeedback = useCallback((reports) => {
    const nextResolvedReport = reports.find((incident) => (
      incident.status === 'resolved'
      && !incident.feedback_submitted
      && !dismissedFeedbackIds.has(incident.id)
    ))

    if (nextResolvedReport) {
      setFeedbackTarget((current) => {
        if (current) {
          return current
        }

        setFeedbackRating(0)
        setFeedbackComment('')
        return nextResolvedReport
      })
    }
  }, [dismissedFeedbackIds])

  const fetchMine = useCallback(async (page = 1) => {
    setLoading(true)

    try {
      const response = await api.get('/api/v1/incidents/mine', { params: { page } })
      const pageData = response.data?.data?.incidents
      const reports = pageData?.data ?? []
      setIncidents(reports)
      setPagination({
        current_page: pageData?.current_page ?? 1,
        last_page: pageData?.last_page ?? 1,
      })
      maybePromptForFeedback(reports)
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }, [maybePromptForFeedback])

  useEffect(() => {
    fetchMine()
  }, [fetchMine])

  const openDetail = useCallback(async (incidentId) => {
    setDetailLoading(true)
    setSelectedIncident(null)

    try {
      const response = await api.get(`/api/v1/incidents/${incidentId}`)
      const incident = response.data?.data?.incident ?? null
      setSelectedIncident(incident)

      if (incident) {
        maybePromptForFeedback([incident])
      }
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setDetailLoading(false)
    }
  }, [maybePromptForFeedback])

  useEffect(() => {
    if (linkedIncidentId) {
      openDetail(linkedIncidentId)
    }
  }, [linkedIncidentId, openDetail])

  return (
    <div className="min-h-screen bg-panel px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-4xl italic text-navy">My Reports</h1>
            <p className="text-sm text-slate-500">Track submitted incidents and response progress.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/report"
              className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc1f34]"
            >
              New {t('Report')}
            </Link>
            <Link
              to="/broadcasts"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy"
            >
              Broadcasts
            </Link>
          </div>
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
                        <p className="text-sm font-semibold text-navy">{t(type.label)}</p>
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
                    <StatusPill status={incident.status} translate />
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
        messageInitiallyOpen={Boolean(linkedConversationId)}
        onClose={() => {
          setSelectedIncident(null)
          setDetailLoading(false)
        }}
      />

      <FeedbackRatingModal
        incident={feedbackTarget}
        rating={feedbackRating}
        comment={feedbackComment}
        submitting={feedbackSubmitting}
        onRatingChange={setFeedbackRating}
        onCommentChange={setFeedbackComment}
        onClose={() => {
          if (feedbackTarget?.id) {
            setDismissedFeedbackIds((current) => new Set([...current, feedbackTarget.id]))
          }

          setFeedbackTarget(null)
          setFeedbackRating(0)
          setFeedbackComment('')
        }}
        onSubmit={async () => {
          if (!feedbackTarget || feedbackRating === 0) {
            return
          }

          if (navigator.onLine === false) {
            toast.error('Connect to the internet to submit feedback.')
            return
          }

          setFeedbackSubmitting(true)

          try {
            const response = await api.post('/api/v1/feedback', {
              incident_id: feedbackTarget.id,
              rating: feedbackRating,
              comment: feedbackComment.trim() || null,
            })
            const feedback = response.data?.data?.feedback ?? null

            setIncidents((current) => current.map((incident) => (
              incident.id === feedbackTarget.id
                ? { ...incident, feedback_submitted: true, feedback }
                : incident
            )))
            setSelectedIncident((current) => (
              current?.id === feedbackTarget.id
                ? { ...current, feedback_submitted: true, feedback }
                : current
            ))
            toast.success(response.data?.message ?? 'Feedback submitted.')
            setFeedbackTarget(null)
            setFeedbackRating(0)
            setFeedbackComment('')
          } catch (error) {
            toast.error(parseApiError(error).message)
          } finally {
            setFeedbackSubmitting(false)
          }
        }}
      />
    </div>
  )
}

export default MyReportsPage
