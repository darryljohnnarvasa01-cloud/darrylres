import { Bot, Link2, MapPinned, ShieldCheck, Sparkles, X } from 'lucide-react'
import L from 'leaflet'
import { useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import useSWR from 'swr'
import { getIncidentType } from '../../data/incidentTypes'
import { api } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/datetime'
import { buildResponderSuggestions } from '../../lib/responderOptimizer'
import StatusPill from '../incident/StatusPill'

const TYPE_COLORS = {
  fire: '#D7263D',
  medical: '#1570EF',
  crime: '#7A5AF8',
  flood: '#0BA5EC',
  accident: '#F79009',
  other: '#98A2B3',
}

function pinIcon(type, status, isIot) {
  const color = isIot ? '#D7263D' : TYPE_COLORS[type] ?? '#98A2B3'
  const pulse = status === 'responding' || status === 'under_assessment' || isIot ? 'pin-pulse' : ''

  return L.divIcon({
    className: 'admin-pin-wrap',
    html: `<span class="admin-pin ${pulse}" style="--pin-color:${color};"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function TypeBadge({ type }) {
  const typeData = getIncidentType(type)
  const Icon = typeData.icon

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${typeData.chipClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {typeData.label}
    </span>
  )
}

const drawerFetcher = (path) => api.get(path).then((response) => response.data?.data ?? {})

function IncidentDetailDrawer({
  incident,
  loading,
  staff,
  relatedIncidents = [],
  onOpenIncident,
  onClose,
  onVerify,
  onReject,
  canManageIncidents = true,
}) {
  const [assignedStaffId, setAssignedStaffId] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const incidentLogs = incident?.logs

  const sortedLogs = useMemo(() => {
    if (!Array.isArray(incidentLogs)) {
      return []
    }

    return [...incidentLogs].sort((left, right) => {
      const leftTime = Date.parse(left.created_at ?? '')
      const rightTime = Date.parse(right.created_at ?? '')

      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime
      }

      return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
    })
  }, [incidentLogs])

  const isPending = incident?.status === 'pending_verification'
  const latestAssignment = incident?.assignments?.[0]
  const incidentCode = incident?.reference_code ?? incident?.id?.slice(0, 8)?.toUpperCase() ?? 'Incident'
  const {
    data: responderMetricsPayload,
    isLoading: responderMetricsLoading,
    error: responderMetricsError,
  } = useSWR(
    isPending && canManageIncidents ? '/api/v1/admin/dashboard/command-center' : null,
    drawerFetcher,
    {
      revalidateOnFocus: false,
    },
  )
  const {
    data: incidentHistoryPayload,
    isLoading: incidentHistoryLoading,
    error: incidentHistoryError,
  } = useSWR(
    isPending && canManageIncidents ? '/api/v1/admin/incidents?per_page=100&lite=1' : null,
    drawerFetcher,
    {
      revalidateOnFocus: false,
    },
  )

  const responderSuggestions = useMemo(
    () => buildResponderSuggestions({
      incident,
      staff,
      responderMetrics: responderMetricsPayload?.responders ?? [],
      incidents: incidentHistoryPayload?.incidents?.data ?? [],
    }),
    [incident, incidentHistoryPayload, responderMetricsPayload, staff],
  )

  const rankedStaff = useMemo(() => {
    const suggestionIds = responderSuggestions.map((item) => item.id)

    return [...staff].sort((left, right) => {
      const leftRank = suggestionIds.indexOf(left.id)
      const rightRank = suggestionIds.indexOf(right.id)

      if (leftRank !== -1 || rightRank !== -1) {
        if (leftRank === -1) {
          return 1
        }

        if (rightRank === -1) {
          return -1
        }

        return leftRank - rightRank
      }

      return left.full_name.localeCompare(right.full_name)
    })
  }, [responderSuggestions, staff])

  const suggestionsLoading = responderMetricsLoading || incidentHistoryLoading
  const suggestionsUnavailable = Boolean(responderMetricsError || incidentHistoryError)
  const suggestionSubtitle = suggestionsUnavailable
    ? 'Suggestion inputs are temporarily unavailable. Manual assignment still works below.'
    : 'Ranked by open workload, barangay distance estimate, and recent incident-type fit.'
  const selectedStaffId = assignedStaffId || responderSuggestions[0]?.id || ''

  if (!incident && !loading) {
    return null
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incident Detail</p>
            <h2 className="mt-1 text-lg font-semibold text-navy">{loading ? 'Loading...' : incidentCode}</h2>
            {!loading && (
              <div className="mt-1 flex items-center gap-2">
                <TypeBadge type={incident.type} />
                <StatusPill status={incident.status} />
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-danger hover:text-danger">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-slate-500">Fetching incident details...</p>
          ) : (
            <>
              <div className="h-48 overflow-hidden rounded-xl border border-slate-200">
                <MapContainer center={[incident.latitude, incident.longitude]} zoom={15} className="h-full w-full" scrollWheelZoom={false}>
                  <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[incident.latitude, incident.longitude]} icon={pinIcon(incident.type, incident.status, incident.is_iot_generated)} />
                </MapContainer>
              </div>
              <div className="rounded-xl bg-panel p-3 text-sm">
                <p className="font-semibold text-navy">{incident.address_label}</p>
                <p className="mt-2 whitespace-pre-wrap text-slate-700">{incident.description}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-navy">{incident.reporter?.full_name ?? 'Anonymous'}</p>
                {incident.reporter?.phone && (
                  <a href={`tel:${incident.reporter.phone}`} className="mt-1 inline-flex text-info hover:underline">
                    {incident.reporter.phone}
                  </a>
                )}
              </div>
              {relatedIncidents.length ? (
                <div>
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Link2 className="h-3.5 w-3.5" />
                    Related reports
                  </p>
                  <p className="mt-1 text-sm text-slate-500">Other reports near this location and time window.</p>

                  <div className="mt-3 space-y-2">
                    {relatedIncidents.map((related) => {
                      const relatedCode = related.reference_code ?? related.id?.slice(0, 8)?.toUpperCase() ?? 'Incident'
                      const relatedReporter = related.reporter?.full_name ?? 'Anonymous'
                      const distanceLabel = Number.isFinite(related.distance_meters) ? `${related.distance_meters}m` : null
                      const responderName = related.assigned_responder ?? null

                      return (
                        <button
                          key={related.id}
                          type="button"
                          disabled={!onOpenIncident}
                          onClick={() => {
                            onOpenIncident?.(related.id)
                          }}
                          className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-info/30 hover:bg-slate-50/60 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-navy" title={relatedCode}>{relatedCode}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <TypeBadge type={related.type} />
                                <StatusPill status={related.status} />
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                {relatedReporter} · {timeAgo(related.created_at)}{distanceLabel ? ` · ${distanceLabel}` : ''}
                              </p>
                              {responderName ? (
                                <p className="mt-1 truncate text-xs text-slate-500" title={responderName}>
                                  Responder: <span className="font-semibold text-slate-600">{responderName}</span>
                                </p>
                              ) : null}
                            </div>
                            {onOpenIncident ? (
                              <span className="shrink-0 rounded-xl bg-panel px-3 py-1 text-xs font-semibold text-info">
                                Open
                              </span>
                            ) : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit Log</p>
                <div className="mt-2 space-y-2">
                  {sortedLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-200 bg-panel px-3 py-2">
                      <p className="text-sm font-semibold text-navy">{log.new_status.replaceAll('_', ' ')}</p>
                      <p className="text-xs text-slate-500">{log.changed_by_user?.full_name ?? 'System'} - {formatDateTime(log.created_at)}</p>
                      {log.notes && <p className="mt-1 text-xs text-slate-600">{log.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        {!loading && (
          <div className={`shrink-0 border-t border-slate-200 p-4 ${isPending ? 'max-h-[42vh] overflow-y-auto overscroll-contain' : ''}`}>
            {isPending ? (
              canManageIncidents ? (
                <div className="space-y-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                        <Bot className="h-3.5 w-3.5" />
                        AI Suggest
                      </p>
                      <p className="mt-2 text-sm text-slate-600">{suggestionSubtitle}</p>
                      <p className="mt-1 text-xs text-slate-500">Distance uses Haversine math from the incident coordinates to each responder&apos;s barangay centroid estimate.</p>
                    </div>
                    <span className="rounded-xl bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Top {Math.min(3, responderSuggestions.length || 3)}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {suggestionsLoading ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="h-20 animate-pulse rounded-2xl border border-blue-100 bg-white/90" />
                      ))
                    ) : responderSuggestions.length ? (
                      responderSuggestions.map((suggestion, index) => {
                        const specialtyLabel = suggestion.specialtyType ? getIncidentType(suggestion.specialtyType).label : 'General'

                        return (
                          <div key={suggestion.id} className="rounded-2xl border border-blue-100 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                                    #{index + 1}
                                  </span>
                                  <p className="truncate text-sm font-semibold text-navy">{suggestion.full_name}</p>
                                  <span className={`h-2.5 w-2.5 rounded-full ${suggestion.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">
                                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                                    {suggestion.currentAssignmentCount} active
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">
                                    <MapPinned className="h-3.5 w-3.5 text-slate-400" />
                                    ~{suggestion.distanceKm.toFixed(1)} km
                                  </span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                    suggestion.specializationMatch ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                                  }`}>
                                    <Sparkles className="h-3.5 w-3.5" />
                                    {suggestion.specializationMatch ? `${specialtyLabel} fit` : `${specialtyLabel} history`}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                  {suggestion.barangay || 'Barangay unavailable'}
                                  {suggestion.distanceSource === 'city' ? ' • distance fallback uses city center' : ' • distance uses barangay centroid'}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={async () => {
                                  setAssignedStaffId(suggestion.id)
                                  setSubmitting(true)
                                  await onVerify(incident.id, suggestion.id)
                                  setSubmitting(false)
                                }}
                                className="rounded-xl bg-info px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                Assign
                              </button>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-blue-200 bg-white/80 px-3 py-4 text-sm text-slate-500">
                        No ranking data yet. Use the manual selector below.
                      </div>
                    )}
                  </div>
                </div>

                <select className="form-input" value={selectedStaffId} onChange={(event) => setAssignedStaffId(event.target.value)}>
                  <option value="">Select staff responder</option>
                  {rankedStaff.map((item) => (
                    <option key={item.id} value={item.id}>{item.full_name} - {item.barangay}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedStaffId || submitting}
                  onClick={async () => {
                    setSubmitting(true)
                    await onVerify(incident.id, selectedStaffId)
                    setSubmitting(false)
                  }}
                  className="w-full rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Verify & Assign
                </button>
                <textarea
                  className="form-input min-h-20 resize-none"
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  placeholder="Rejection reason"
                />
                <button
                  type="button"
                  disabled={rejectionReason.trim().length < 10 || submitting}
                  onClick={async () => {
                    setSubmitting(true)
                    await onReject(incident.id, rejectionReason.trim())
                    setSubmitting(false)
                  }}
                  className="w-full rounded-xl border border-danger px-4 py-2.5 text-sm font-semibold text-danger disabled:opacity-60"
                >
                  Reject Report
                </button>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-panel p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Permission Required</p>
                  <p className="mt-1 text-sm text-navy">Incident verification and assignment are hidden for your role.</p>
                </div>
              )
            ) : (
              <div className="rounded-xl border border-slate-200 bg-panel p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Assignee</p>
                <p className="text-sm font-semibold text-navy">{latestAssignment?.staff?.full_name ?? 'Unassigned'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default IncidentDetailDrawer
