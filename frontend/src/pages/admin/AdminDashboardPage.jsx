import { LayoutDashboard, ListFilter, Map, Search, UserCircle2, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bot, Link2, MapPinned, ShieldCheck, Sparkles } from 'lucide-react'
import { ArrowUpDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import useSWR from 'swr'
import AdminCommandCenter from '../../components/admin/AdminCommandCenter'
import AdminEmptyState from '../../components/admin/AdminEmptyState'
import AdminSkeletonRows from '../../components/admin/AdminSkeletonRows'
import AdminSidebar from '../../components/admin/AdminSidebar'
import StatusPill from '../../components/incident/StatusPill'
import NotificationBell from '../../components/notifications/NotificationBell'
import AdminResponderTrackingMap from '../../components/tracking/AdminResponderTrackingMap'
import HazardLayer from '../../components/maps/HazardLayer'
import { useAuth } from '../../context/AuthContext'
import { INCIDENT_TYPES, getIncidentType } from '../../data/incidentTypes'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { api } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import { buildResponderSuggestions } from '../../lib/responderOptimizer'

const MAP_CENTER = [7.9062, 125.0936]

// Valencia City, Bukidnon boundary coordinates (approximate)
  

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending_verification', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'under_assessment', label: 'Assessment' },
  { value: 'responding', label: 'Responding' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
]

const TYPE_COLORS = {
  fire: '#D7263D',
  medical: '#1570EF',
  crime: '#7A5AF8',
  flood: '#0BA5EC',
  accident: '#F79009',
  other: '#98A2B3',
}

const commandCenterFetcher = (path) => api.get(path, { cacheTtl: 8000 }).then((response) => response.data?.data ?? {})

const SortableHeader = memo(function SortableHeader({ label, sortKey, currentSort, onToggle }) {
  const active = currentSort.key === sortKey

  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] ${
        active ? 'text-navy' : 'text-slate-500'
      }`}
    >
      {label}
      <ArrowUpDown className={`h-3.5 w-3.5 transition ${active && currentSort.direction === 'asc' ? 'rotate-180' : ''}`} />
    </button>
  )
})

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

const TypeBadge = memo(function TypeBadge({ type }) {
  const typeData = getIncidentType(type)
  const Icon = typeData.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${typeData.chipClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {typeData.label}
    </span>
  )
})

const Drawer = memo(function Drawer({ incident, loading, staff, relatedIncidents = [], onOpenIncident, onClose, onVerify, onReject }) {
  const [assignedStaffId, setAssignedStaffId] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isPending = incident?.status === 'pending_verification'
  const latestAssignment = incident?.assignments?.[0]
  const {
    data: responderMetricsPayload,
    isLoading: responderMetricsLoading,
    error: responderMetricsError,
  } = useSWR(
    isPending ? '/api/v1/admin/dashboard/command-center' : null,
    commandCenterFetcher,
    {
      revalidateOnFocus: false,
    },
  )
  const {
    data: incidentHistoryPayload,
    isLoading: incidentHistoryLoading,
    error: incidentHistoryError,
  } = useSWR(
    isPending ? '/api/v1/admin/incidents?per_page=100&lite=1' : null,
    commandCenterFetcher,
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
            <h2 className="mt-1 text-lg font-semibold text-navy">{loading ? 'Loading...' : `Incident #${incident.id.slice(0, 8)}`}</h2>
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
                  {incident.logs?.map((log) => (
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Assignee</p>
                <p className="text-sm font-semibold text-navy">{latestAssignment?.staff?.full_name ?? 'Unassigned'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

function AdminDashboardPage({ mode = 'dashboard' }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearchInput = useDebouncedValue(searchInput, 350)
  const [tableFilters, setTableFilters] = useState({ status: '', type: '', from_date: '', to_date: '', search: '' })
  const [tablePage, setTablePage] = useState(1)
  const [tableData, setTableData] = useState({ data: [], current_page: 1, last_page: 1 })
  const [tableSort, setTableSort] = useState({ key: 'created_at', direction: 'desc' })
  const [mapFilters, setMapFilters] = useState({ status: '', types: INCIDENT_TYPES.map((item) => item.value), date: '', today_only: false })
  const [mapIncidents, setMapIncidents] = useState([])
  const [hazardZones, setHazardZones] = useState([])
  const [kpis, setKpis] = useState({})
  const [staff, setStaff] = useState([])
  const [tableLoading, setTableLoading] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [drawerIncident, setDrawerIncident] = useState(null)
  const [drawerRelatedIncidents, setDrawerRelatedIncidents] = useState([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  const isDashboardView = mode === 'dashboard'
  const isIncidentsView = mode === 'incidents'
  const isMapView = mode === 'map'
  const viewTitle = isIncidentsView ? 'Incident queue' : isMapView ? 'Live incident map' : 'Command center'
  const viewDescription = isIncidentsView
    ? 'Focus on verification, assignment, and rejection workflows without the map taking over the page.'
    : isMapView
      ? 'Track geotagged reports and inspect marker activity directly from the map.'
      : 'Monitor live operations with a unified map, feed, and responder readiness view.'
  const {
    data: commandCenterData,
    error: commandCenterError,
    isLoading: commandCenterLoading,
    isValidating: commandCenterValidating,
    mutate: mutateCommandCenter,
  } = useSWR(
    isDashboardView ? '/api/v1/admin/dashboard/command-center' : null,
    commandCenterFetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    },
  )

  const fetchTable = useCallback(async () => {
    setTableLoading(true)
    try {
      const response = await api.get('/api/v1/admin/incidents', {
        params: { ...tableFilters, page: tablePage, lite: 1 },
        cacheTtl: 8000,
      })
      setTableData(response.data?.data?.incidents ?? { data: [], current_page: 1, last_page: 1 })
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setTableLoading(false)
    }
  }, [tableFilters, tablePage])

  const fetchMap = useCallback(async () => {
    setMapLoading(true)
    try {
      const [incidentResponse, hazardResponse] = await Promise.all([
        api.get('/api/v1/admin/incidents/map', {
          params: {
            status: mapFilters.status || undefined,
            date: mapFilters.date || undefined,
            today_only: mapFilters.today_only ? 1 : undefined,
            types: mapFilters.types,
          },
          cacheTtl: 10000,
        }),
        api.get('/api/v1/admin/hazard-zones', { cacheTtl: 30000 }),
      ])
      setMapIncidents(incidentResponse.data?.data?.incidents ?? [])
      setHazardZones(hazardResponse.data?.data?.hazard_zones ?? [])
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setMapLoading(false)
    }
  }, [mapFilters])

  const fetchKpis = useCallback(async () => {
    try {
      const response = await api.get('/api/v1/admin/kpis', { cacheTtl: 15000 })
      setKpis(response.data?.data ?? {})
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }, [])

  const fetchStaff = useCallback(async () => {
    try {
      const response = await api.get('/api/v1/admin/staff', { cacheTtl: 60000 })
      setStaff(response.data?.data?.staff ?? [])
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }, [])

  const openIncident = useCallback(async (incidentId) => {
    setDrawerLoading(true)
    setDrawerIncident(null)
    setDrawerRelatedIncidents([])
    try {
      const response = await api.get(`/api/v1/admin/incidents/${incidentId}`, { cacheTtl: 5000 })
      const incident = response.data?.data?.incident ?? null
      setDrawerIncident(incident)
      setDrawerRelatedIncidents(response.data?.data?.related_incidents ?? [])

      if (incident?.status === 'pending_verification' && !staff.length) {
        fetchStaff()
      }
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setDrawerLoading(false)
    }
  }, [fetchStaff, staff.length])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const incidentId = params.get('incident')

    if (!incidentId) {
      return
    }

    openIncident(incidentId)
    params.delete('incident')
    const nextSearch = params.toString()

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    )
  }, [location.pathname, location.search, navigate, openIncident])

  const refreshCoreData = async () => {
    const tasks = []

    if (isDashboardView) {
      tasks.push(mutateCommandCenter())
    } else {
      if (isMapView) {
        tasks.push(fetchKpis())
      }

      if (!isMapView) {
        tasks.push(fetchTable())
      }

      if (!isIncidentsView) {
        tasks.push(fetchMap())
      }
    }

    await Promise.all(tasks)
  }

  useEffect(() => {
    if (isIncidentsView) {
      fetchTable()
    }
  }, [fetchTable, isIncidentsView])

  useEffect(() => {
    if (!isIncidentsView) {
      return
    }

    const nextSearch = debouncedSearchInput.trim()

    setTableFilters((current) => {
      if (current.search === nextSearch) {
        return current
      }

      setTablePage(1)
      return { ...current, search: nextSearch }
    })
  }, [debouncedSearchInput, isIncidentsView])

  useEffect(() => {
    if (isMapView) {
      fetchMap()
    }
  }, [fetchMap, isMapView])

  useEffect(() => {
    if (isMapView) {
      fetchKpis()
    }
  }, [fetchKpis, isMapView])

  useEffect(() => {
    const timer = setInterval(() => {
      if (isMapView) {
        fetchMap()
        fetchKpis()
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [fetchKpis, fetchMap, isMapView])

  useEffect(() => {
    if (!commandCenterError) {
      return
    }

    toast.error(parseApiError(commandCenterError).message, {
      id: 'command-center-error',
    })
  }, [commandCenterError])

  useEffect(() => {
    const echo = window?.Echo
    if (!echo) {
      return undefined
    }
    const channel = echo.private('admin.alerts')
    channel.listen('.NewIncidentSubmitted', (event) => {
      toast.success(`New ${event.type ?? 'incident'} submitted.`, {
        position: 'bottom-right',
        duration: 5000,
      })
      if (isDashboardView) {
        mutateCommandCenter()
      }
      if (isMapView) {
        fetchMap()
      }
      if (isIncidentsView) {
        fetchTable()
      }
      if (isMapView) {
        fetchKpis()
      }
    })
    channel.listen('.IotSmokeAlert', (event) => {
      toast.error(`SMOKE ALERT: ${event.location_name ?? 'Unknown location'} (${event.smoke_level ?? '-'} ppm)`, {
        position: 'bottom-right',
        duration: 5000,
      })
      if (isDashboardView) {
        mutateCommandCenter()
      }
      if (isMapView) {
        fetchMap()
      }
      if (isIncidentsView) {
        fetchTable()
      }
      if (isMapView) {
        fetchKpis()
      }
    })
    return () => echo.leave('private-admin.alerts')
  }, [fetchKpis, fetchMap, fetchTable, isDashboardView, isIncidentsView, isMapView, mutateCommandCenter])

  const kpiCards = useMemo(
    () => [
      { label: 'Total Today', value: kpis.total_today ?? 0 },
      { label: 'Pending', value: kpis.pending_verification ?? 0 },
      { label: 'Active', value: kpis.active_responding ?? 0 },
      { label: 'Resolved', value: kpis.resolved_this_month ?? 0 },
      { label: 'Avg Hr', value: kpis.avg_response_hours ?? 0 },
    ],
    [kpis],
  )

  const visibleMapIncidents = useMemo(() => mapIncidents.slice(0, 6), [mapIncidents])
  const sortedTableRows = useMemo(() => {
    const rows = [...(tableData.data ?? [])]
    const directionMultiplier = tableSort.direction === 'asc' ? 1 : -1

    rows.sort((left, right) => {
      if (tableSort.key === 'created_at') {
        return ((new Date(left.created_at ?? 0)).getTime() - (new Date(right.created_at ?? 0)).getTime()) * directionMultiplier
      }

      const leftValue = tableSort.key === 'reporter_name'
        ? left.reporter?.full_name
        : tableSort.key === 'address_label'
          ? left.address_label ?? left.barangay
          : left[tableSort.key]
      const rightValue = tableSort.key === 'reporter_name'
        ? right.reporter?.full_name
        : tableSort.key === 'address_label'
          ? right.address_label ?? right.barangay
          : right[tableSort.key]

      return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * directionMultiplier
    })

    return rows
  }, [tableData.data, tableSort.direction, tableSort.key])

  const mapStatusSummary = useMemo(
    () => mapIncidents.reduce((summary, incident) => {
      const key = incident.status || 'unknown'
      summary[key] = (summary[key] ?? 0) + 1
      return summary
    }, {}),
    [mapIncidents],
  )

  const handleTableSort = (sortKey) => {
    setTableSort((current) => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />
      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center lg:justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">
                {isIncidentsView ? 'Incident Management' : isMapView ? 'Map Operations' : 'Admin Dashboard'}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">{viewTitle}</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">{viewDescription}</p>
            </div>
            {isDashboardView ? (
              <div className="w-full rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500 lg:max-w-xl">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-danger" />
                  <span>Command center refreshes every 30 seconds and instantly revalidates when new admin alerts arrive.</span>
                </div>
              </div>
            ) : !isMapView ? (
              <form
                className="w-full rounded-xl border border-slate-200 bg-panel px-3 py-2 lg:max-w-xl"
                onSubmit={(event) => {
                  event.preventDefault()
                  setTablePage(1)
                  setTableFilters((prev) => ({ ...prev, search: searchInput.trim() }))
                }}
              >
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    className="w-full border-none bg-transparent text-sm outline-none"
                    placeholder="Search reporter name or incident ID..."
                  />
                </div>
              </form>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500 lg:max-w-xl">
                Marker feeds refresh every 30 seconds.
              </div>
            )}
            <div className="flex items-center gap-3">
              <NotificationBell />
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
                <UserCircle2 className="h-5 w-5 text-slate-500" />
                <span className="text-xs font-semibold text-navy">{user?.full_name?.split(' ')[0]}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="space-y-5 px-4 pb-6 pt-5 lg:px-6">
          {isDashboardView ? (
            <AdminCommandCenter
              data={commandCenterData}
              isLoading={commandCenterLoading}
              isValidating={commandCenterValidating}
              error={commandCenterError}
              onOpenIncident={openIncident}
            />
          ) : (
            <>
              {isIncidentsView && (
                <>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
                    <ListFilter className="h-4 w-4 text-danger" />
                    This route is table-first so admins can process incident records without map distractions.
                  </div>
                </>
              )}
              {isMapView && (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
              <Map className="h-4 w-4 text-danger" />
              This route is map-first and optimized for live geospatial monitoring.
            </div>
              )}
              {isMapView && <AdminResponderTrackingMap />}
              {!isIncidentsView && (
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
              <div className={isMapView ? 'h-[78vh] min-h-[620px]' : 'h-[70vh] min-h-[520px]'}>
              <MapContainer center={MAP_CENTER} zoom={13} className="h-full w-full">
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <HazardLayer zones={hazardZones} />
                {mapIncidents.map((item) => (
                  <Marker key={item.id} position={[item.latitude, item.longitude]} icon={pinIcon(item.type, item.status, item.is_iot_generated)}>
                    <Popup>
                      <div className="w-60 space-y-2">
                        <div className="flex items-center gap-2">
                          <TypeBadge type={item.type} />
                          <StatusPill status={item.status} />
                        </div>
                        <p className="text-sm text-slate-700">
                          {(item.description ?? 'No description provided.').length > 90 ? `${(item.description ?? 'No description provided.').slice(0, 87)}...` : (item.description ?? 'No description provided.')}
                        </p>
                        <p className="text-xs text-slate-500">{item.reporter?.full_name ?? 'Anonymous'}</p>
                        <p className="text-xs text-slate-500">{timeAgo(item.created_at)}</p>
                        <button type="button" onClick={() => openIncident(item.id)} className="text-xs font-semibold text-info hover:underline">
                          View Full Report
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            <div className="pointer-events-none absolute left-3 top-3 z-20 w-[295px] rounded-xl bg-white/95 p-3 shadow-lg">
              <div className="pointer-events-auto">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Map Filters</p>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {INCIDENT_TYPES.map((type) => {
                    const Icon = type.icon
                    const checked = mapFilters.types.includes(type.value)

                    return (
                      <label
                        key={type.value}
                        className={`inline-flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs font-semibold transition ${type.chipClass} ${
                          checked ? 'shadow-sm ring-1 ring-white/90' : 'opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-info focus:ring-info/20"
                          checked={checked}
                          onChange={(event) =>
                            setMapFilters((prev) => ({
                              ...prev,
                              types: event.target.checked
                                ? Array.from(new Set([...prev.types, type.value]))
                                : prev.types.filter((value) => value !== type.value),
                            }))
                          }
                        />
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{type.label}</span>
                      </label>
                    )
                  })}
                </div>
                <select
                  className="form-input mt-2 h-9 py-1 text-xs"
                  value={mapFilters.status}
                  onChange={(event) => setMapFilters((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="">All non-resolved</option>
                  {STATUS_TABS.filter((tab) => tab.value).map((tab) => (
                    <option key={tab.value} value={tab.value}>{tab.label}</option>
                  ))}
                </select>
                <label className="mt-2 block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Date</span>
                  <input
                    type="date"
                    className="form-input h-9 py-1 text-xs"
                    value={mapFilters.date}
                    onChange={(event) => {
                      const nextDate = event.target.value
                      setMapFilters((prev) => ({
                        ...prev,
                        date: nextDate,
                        today_only: nextDate ? false : prev.today_only,
                      }))
                    }}
                  />
                </label>
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={mapFilters.today_only}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setMapFilters((prev) => ({
                        ...prev,
                        today_only: checked,
                        date: checked ? '' : prev.date,
                      }))
                    }}
                  />
                  Today only
                </label>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 grid grid-cols-2 gap-2 lg:grid-cols-5">
              {kpiCards.map((card) => (
                <div key={card.label} className="pointer-events-auto rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow transition duration-200 hover:-translate-y-1 hover:border-info/20 hover:bg-white hover:shadow-lg">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-1 text-lg font-semibold text-navy">{card.value}</p>
                </div>
              ))}
            </div>
            {mapLoading && <div className="absolute right-3 top-3 rounded-lg bg-white/90 px-2 py-1 text-xs text-slate-500">Refreshing map...</div>}
            </section>
          )}
          {isMapView && (
            <section className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr]">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Marker Activity</p>
                    <h2 className="mt-1 text-xl font-semibold text-navy">Recent map incidents</h2>
                    <p className="mt-1 text-sm text-slate-500">Open an incident directly from the live marker feed.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500">
                    {visibleMapIncidents.length} visible items
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {visibleMapIncidents.length ? (
                    visibleMapIncidents.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openIncident(item.id)}
                        className="rounded-2xl border border-slate-200 bg-panel px-4 py-3 text-left transition hover:border-info hover:bg-white"
                      >
                        <div className="flex items-center gap-2">
                          <TypeBadge type={item.type} />
                          <StatusPill status={item.status} />
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm font-semibold text-navy">{item.description ?? 'No description provided.'}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.address_label}</p>
                        <p className="mt-1 text-xs text-slate-500">{timeAgo(item.created_at)}</p>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 md:col-span-2">
                      No incidents match the current map filters.
                    </div>
                  )}
                </div>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status Breakdown</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Visible marker summary</h2>
                <div className="mt-4 space-y-3">
                  {Object.entries(mapStatusSummary).length ? (
                    Object.entries(mapStatusSummary).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between rounded-xl border border-slate-200 bg-panel px-3 py-3">
                        <StatusPill status={status} />
                        <span className="text-sm font-semibold text-navy">{count}</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500">
                      No visible markers to summarize.
                    </div>
                  )}
                </div>
              </article>
            </section>
          )}
          {!isMapView && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Queue</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">{isDashboardView ? 'Incident queue' : 'All incidents'}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  {isDashboardView
                    ? 'Review active reports, open the drawer, and assign responders without leaving the dashboard.'
                    : 'Filter, search, and manage incidents in a table-first workflow.'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500">
                {tableData.data?.length ?? 0} rows on this page
              </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  onClick={() => {
                    setTablePage(1)
                    setTableFilters((prev) => ({ ...prev, status: tab.value }))
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    tableFilters.status === tab.value ? 'bg-danger text-white' : 'border border-slate-200 text-slate-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="mb-3 grid gap-2 md:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor="incident-type" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Type</label>
                <select
                  id="incident-type"
                  className="form-input h-10 py-2 text-sm"
                  value={tableFilters.type}
                  onChange={(event) => {
                    setTablePage(1)
                    setTableFilters((prev) => ({ ...prev, type: event.target.value }))
                  }}
                >
                  <option value="">All types</option>
                  {INCIDENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="incident-from-date" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Date From</label>
                <input
                  id="incident-from-date"
                  type="date"
                  className="form-input h-10 py-2 text-sm"
                  value={tableFilters.from_date}
                  onChange={(event) => {
                    setTablePage(1)
                    setTableFilters((prev) => ({ ...prev, from_date: event.target.value }))
                  }}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="incident-to-date" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Date To</label>
                <input
                  id="incident-to-date"
                  type="date"
                  className="form-input h-10 py-2 text-sm"
                  value={tableFilters.to_date}
                  onChange={(event) => {
                    setTablePage(1)
                    setTableFilters((prev) => ({ ...prev, to_date: event.target.value }))
                  }}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
                  onClick={() => {
                    setTablePage(1)
                    setSearchInput('')
                    setTableFilters({ status: '', type: '', from_date: '', to_date: '', search: '' })
                  }}
                >
                  Reset Filters
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {tableLoading ? (
                <AdminSkeletonRows rows={6} className="h-14" />
              ) : sortedTableRows.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortableHeader label="ID" sortKey="id" currentSort={tableSort} onToggle={handleTableSort} /></th>
                      <th><SortableHeader label="Type" sortKey="type" currentSort={tableSort} onToggle={handleTableSort} /></th>
                      <th><SortableHeader label="Location" sortKey="address_label" currentSort={tableSort} onToggle={handleTableSort} /></th>
                      <th><SortableHeader label="Reporter" sortKey="reporter_name" currentSort={tableSort} onToggle={handleTableSort} /></th>
                      <th><SortableHeader label="Submitted" sortKey="created_at" currentSort={tableSort} onToggle={handleTableSort} /></th>
                      <th><SortableHeader label="Status" sortKey="status" currentSort={tableSort} onToggle={handleTableSort} /></th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTableRows.map((item) => (
                      <tr key={item.id}>
                        <td className="px-2 py-3 text-xs text-slate-500">#{item.id.slice(0, 8)}</td>
                        <td className="px-2 py-3"><TypeBadge type={item.type} /></td>
                        <td className="max-w-[220px] truncate px-2 py-3 text-xs text-slate-600">{item.address_label}</td>
                        <td className="px-2 py-3 text-xs text-slate-600">{item.reporter?.full_name ?? 'Anonymous'}</td>
                        <td className="px-2 py-3 text-xs text-slate-500">{timeAgo(item.created_at)}</td>
                        <td className="px-2 py-3"><StatusPill status={item.status} /></td>
                        <td className="px-2 py-3">
                          <button type="button" onClick={() => openIncident(item.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy">
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <AdminEmptyState
                  title="No incidents matched the filters"
                  description="Adjust the current status, type, date, or search filters to bring incident rows back into the queue."
                />
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">Page {tableData.current_page ?? 1} of {tableData.last_page ?? 1}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={(tableData.current_page ?? 1) <= 1}
                  onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={(tableData.current_page ?? 1) >= (tableData.last_page ?? 1)}
                  onClick={() => setTablePage((prev) => prev + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
            </section>
              )}
            </>
          )}
        </main>
      </div>
      <Drawer
        key={drawerIncident?.id ?? 'drawer-empty'}
        incident={drawerIncident}
        loading={drawerLoading}
        staff={staff}
        relatedIncidents={drawerRelatedIncidents}
        onOpenIncident={openIncident}
        onClose={() => {
          setDrawerIncident(null)
          setDrawerLoading(false)
          setDrawerRelatedIncidents([])
        }}
        onVerify={async (incidentId, staffId) => {
          try {
            await api.patch(`/api/v1/admin/incidents/${incidentId}/verify`, { assigned_staff_id: staffId })
            toast.success('Incident verified and assigned.')
            await Promise.all([openIncident(incidentId), refreshCoreData()])
          } catch (error) {
            toast.error(parseApiError(error).message)
          }
        }}
        onReject={async (incidentId, reason) => {
          try {
            await api.patch(`/api/v1/admin/incidents/${incidentId}/reject`, { rejection_reason: reason })
            toast.success('Incident rejected.')
            await Promise.all([openIncident(incidentId), refreshCoreData()])
          } catch (error) {
            toast.error(parseApiError(error).message)
          }
        }}
      />
    </div>
  )
}

export default AdminDashboardPage
