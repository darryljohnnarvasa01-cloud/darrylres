import { closestCorners, DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { AlertTriangle, ArrowRight, Clock3, Filter, GripVertical, RefreshCw, UserCircle2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import AdminSearchField from '../../components/admin/AdminSearchField'
import AdminIncidentDetailDrawer from '../../components/admin/IncidentDetailDrawer'
import AdminSidebar from '../../components/admin/AdminSidebar'
import StatusPill from '../../components/incident/StatusPill'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { VALENCIA_BARANGAYS } from '../../data/barangays'
import { getIncidentType } from '../../data/incidentTypes'
import { timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import { api } from '../../lib/api'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

const BOARD_COLUMNS = [
  {
    id: 'unverified',
    label: 'Unverified',
    description: 'Needs admin validation and responder assignment.',
    statuses: ['pending_verification'],
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    id: 'verified',
    label: 'Verified / Pending',
    description: 'Verified reports waiting to move into field operations.',
    statuses: ['verified'],
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'dispatched',
    label: 'Dispatched',
    description: 'Assessment and active response are both tracked here.',
    statuses: ['under_assessment', 'responding'],
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    id: 'resolved',
    label: 'Resolved',
    description: 'Closed incidents with a completed field response.',
    statuses: ['resolved'],
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
]

const STATUS_NOTES = {
  under_assessment: 'Moved into field assessment from the triage board.',
  responding: 'Marked as actively responding from the triage board.',
  resolved: 'Marked as resolved from the triage board after command review.',
}

const STATUS_TO_COLUMN = BOARD_COLUMNS.reduce((map, column) => {
  column.statuses.forEach((status) => {
    map[status] = column.id
  })

  return map
}, {})

const swrFetcher = (path) => api.get(path, { cacheTtl: 30000 }).then((response) => response.data?.data ?? {})

async function triageBoardFetcher() {
  try {
    const response = await api.get('/api/v1/admin/incidents/triage-board', { cacheTtl: 10000 })

    return response.data?.data ?? {}
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error
    }

    const response = await api.get('/api/v1/admin/incidents?per_page=100&lite=1', { cacheTtl: 10000 })

    return response.data?.data ?? {}
  }
}

function getIncidentCode(incident) {
  return incident.reference_code ?? incident.id.slice(0, 8).toUpperCase()
}

function getBarangayLabel(incident) {
  if (incident.reporter?.barangay) {
    return incident.reporter.barangay
  }

  if (!incident.address_label) {
    return 'Unknown'
  }

  return incident.address_label.split(',')[0]?.trim() || 'Unknown'
}

function minutesSince(value) {
  if (!value) {
    return 0
  }

  const diffMs = Date.now() - new Date(value).getTime()
  return Math.max(0, Math.floor(diffMs / 60000))
}

function isUrgentIncident(incident) {
  const ageMinutes = minutesSince(incident.created_at)

  if (incident.status === 'pending_verification') {
    return ageMinutes > 15
  }

  if (['under_assessment', 'responding'].includes(incident.status)) {
    return ageMinutes > 45
  }

  return false
}

function resolveDropAction(incident, destinationColumnId) {
  const currentColumnId = STATUS_TO_COLUMN[incident.status]

  if (!destinationColumnId || destinationColumnId === currentColumnId) {
    return { type: 'noop' }
  }

  if (incident.status === 'pending_verification') {
    if (destinationColumnId === 'verified') {
      return { type: 'open_drawer' }
    }

    return {
      type: 'invalid',
      message: 'Verify and assign the incident before moving it further in the board.',
    }
  }

  if (destinationColumnId === 'unverified') {
    return {
      type: 'invalid',
      message: 'Incidents cannot move back to Unverified from their current state.',
    }
  }

  if (destinationColumnId === 'verified') {
    return {
      type: 'invalid',
      message: 'Verified incidents must continue forward through dispatch and resolution.',
    }
  }

  if (destinationColumnId === 'dispatched') {
    if (incident.status === 'verified') {
      return {
        type: 'progress',
        status: 'under_assessment',
        successMessage: 'Incident moved into the dispatched lane and marked under assessment.',
      }
    }

    if (incident.status === 'under_assessment') {
      return {
        type: 'progress',
        status: 'responding',
        successMessage: 'Incident advanced to active responding.',
      }
    }

    return { type: 'noop' }
  }

  if (destinationColumnId === 'resolved') {
    if (incident.status === 'under_assessment') {
      return {
        type: 'progress',
        status: 'responding',
        successMessage: 'Incident advanced to responding. Drag it again to Resolved once field work is complete.',
      }
    }

    if (incident.status === 'responding') {
      return {
        type: 'progress',
        status: 'resolved',
        successMessage: 'Incident marked as resolved.',
      }
    }

    return {
      type: 'invalid',
      message: 'The incident must be dispatched before it can be resolved.',
    }
  }

  return { type: 'noop' }
}

function ColumnSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  )
}

const BoardColumn = memo(function BoardColumn({ column, count, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
  })

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[520px] flex-col rounded-3xl border bg-white p-4 shadow-card transition lg:max-h-[calc(100vh-360px)] ${
        isOver ? 'border-info shadow-[0_0_0_3px_rgba(21,112,239,0.15)]' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${column.badgeClass}`}>
            {column.label}
          </div>
          <p className="mt-2 text-sm text-slate-500">{column.description}</p>
        </div>
        <div className="rounded-full bg-panel px-3 py-1 text-sm font-semibold text-navy">{count}</div>
      </div>
      <div className="mt-4 flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">{children}</div>
    </section>
  )
})

const IncidentCard = memo(function IncidentCard({ incident, isDragging, disabled, onOpenDetail, dragHandleProps }) {
  const type = getIncidentType(incident.type)
  const Icon = type.icon
  const urgent = isUrgentIncident(incident)
  const assignedResponder = incident.assignments?.[0]?.staff?.full_name ?? 'Unassigned'
  const incidentCode = getIncidentCode(incident)
  const barangay = getBarangayLabel(incident)

  return (
    <article
      className={`rounded-2xl border bg-white p-3 shadow-sm transition ${
        urgent
          ? 'border-danger shadow-[0_0_0_2px_rgba(215,38,61,0.16)]'
          : 'border-slate-200 hover:border-info/40 hover:shadow-card'
      } ${isDragging ? 'opacity-55' : ''} ${disabled ? 'cursor-wait' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500" title={incidentCode}>
            {incidentCode}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${type.chipClass}`}>
              <Icon className="h-3.5 w-3.5" />
              {type.label}
            </span>
            <StatusPill status={incident.status} />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(incident.id)}
            title="Open detail"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-slate-500 transition hover:border-info/40 hover:text-info"
            aria-label="Open detail"
          >
            <span className="hidden text-xs font-semibold sm:inline">Detail</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <div
            className={`rounded-xl border p-2 ${urgent ? 'border-danger/40 bg-danger/10 text-danger' : 'border-slate-200 text-slate-400'} ${
              disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
            }`}
            title="Drag to move status"
            aria-label="Drag incident"
            {...(dragHandleProps ?? {})}
          >
            <GripVertical className="h-4 w-4" />
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <div className="flex min-w-0 items-center gap-2">
          <UserCircle2 className="h-4 w-4 text-slate-400" />
          <span className="truncate">{incident.reporter?.full_name ?? 'Anonymous reporter'}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <span className="truncate">{barangay}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <div className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5 text-slate-400" />
            <span>{timeAgo(incident.created_at)}</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="min-w-0 flex-1 truncate" title={assignedResponder}>
            <span className="font-semibold text-slate-600">Responder:</span> {assignedResponder}
          </div>
        </div>
      </div>
      {urgent && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs font-semibold text-danger">
          <AlertTriangle className="h-4 w-4" />
          SLA threshold exceeded
        </div>
      )}
    </article>
  )
})

const DraggableIncidentCard = memo(function DraggableIncidentCard({ incident, disabled, onOpenDetail }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: incident.id,
    disabled,
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <div ref={setNodeRef} style={style}>
      <IncidentCard
        incident={incident}
        isDragging={isDragging}
        disabled={disabled}
        onOpenDetail={onOpenDetail}
        dragHandleProps={disabled ? null : { ...attributes, ...listeners }}
      />
    </div>
  )
})

function AdminTriagePage() {
  const { user, logout } = useAuth()
  const [filters, setFilters] = useState({
    type: '',
    barangay: '',
    fromDate: '',
    toDate: '',
    search: '',
  })
  const [, setClockTick] = useState(0)
  const [activeIncidentId, setActiveIncidentId] = useState(null)
  const [selectedIncidentId, setSelectedIncidentId] = useState(null)
  const [transitioningIncidentId, setTransitioningIncidentId] = useState(null)
  const debouncedSearch = useDebouncedValue(filters.search, 250)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const {
    data: incidentsPayload,
    error: incidentsError,
    isLoading: incidentsLoading,
    isValidating: incidentsValidating,
    mutate: mutateIncidents,
  } = useSWR('triage-board-incidents', triageBoardFetcher, {
    dedupingInterval: 10000,
    refreshInterval: 30000,
    revalidateOnFocus: false,
  })
  const { data: staffPayload } = useSWR(selectedIncidentId ? '/api/v1/admin/staff' : null, swrFetcher)
  const {
    data: incidentDetailPayload,
    error: incidentDetailError,
    isLoading: incidentDetailLoading,
    mutate: mutateIncidentDetail,
  } = useSWR(selectedIncidentId ? `/api/v1/admin/incidents/${selectedIncidentId}` : null, swrFetcher)

  const incidents = useMemo(() => incidentsPayload?.incidents?.data ?? [], [incidentsPayload])
  const staff = useMemo(() => staffPayload?.staff ?? [], [staffPayload])
  const selectedIncident = useMemo(() => incidentDetailPayload?.incident ?? null, [incidentDetailPayload])
  const relatedIncidents = useMemo(() => incidentDetailPayload?.related_incidents ?? [], [incidentDetailPayload])

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick((value) => value + 1)
    }, 30000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!incidentsError) {
      return
    }

    toast.error(parseApiError(incidentsError).message, {
      id: 'triage-board-error',
    })
  }, [incidentsError])

  useEffect(() => {
    if (!incidentDetailError) {
      return
    }

    toast.error(parseApiError(incidentDetailError).message, {
      id: 'triage-detail-error',
    })
  }, [incidentDetailError])

  useEffect(() => {
    const echo = window?.Echo

    if (!echo) {
      return undefined
    }

    const channel = echo.private('admin.alerts')
    const revalidate = () => {
      mutateIncidents()
    }

    channel.listen('.NewIncidentSubmitted', revalidate)
    channel.listen('.IotSmokeAlert', revalidate)
    channel.listen('.IncidentStatusUpdated', revalidate)

    return () => echo.leave('private-admin.alerts')
  }, [mutateIncidents])

  const barangayOptions = useMemo(
    () => {
      const knownBarangays = new Set(VALENCIA_BARANGAYS.map((barangay) => barangay.toLowerCase()))
      const extraBarangays = Array.from(
        new Set(
          incidents
            .map((incident) => getBarangayLabel(incident))
            .filter((barangay) => barangay && !knownBarangays.has(barangay.toLowerCase())),
        ),
      ).sort((left, right) => left.localeCompare(right))

      return [...VALENCIA_BARANGAYS, ...extraBarangays]
    },
    [incidents],
  )

  const triageIncidents = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim().toLowerCase()
    const matchesDateRange = (incident) => {
      const incidentDate = new Date(incident.created_at)

      if (filters.fromDate && incidentDate < new Date(`${filters.fromDate}T00:00:00`)) {
        return false
      }

      if (filters.toDate && incidentDate > new Date(`${filters.toDate}T23:59:59`)) {
        return false
      }

      return true
    }

    return incidents
      .filter((incident) => STATUS_TO_COLUMN[incident.status])
      .filter((incident) => (filters.type ? incident.type === filters.type : true))
      .filter((incident) => (filters.barangay ? getBarangayLabel(incident) === filters.barangay : true))
      .filter((incident) => {
        if (!normalizedSearch) {
          return true
        }

        const incidentCode = getIncidentCode(incident)
        const reporterName = incident.reporter?.full_name ?? ''
        const assignedResponder = incident.assignments?.[0]?.staff?.full_name ?? ''
        const searchHaystack = [
          incidentCode,
          incident.id,
          reporterName,
          assignedResponder,
          getBarangayLabel(incident),
          incident.address_label,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchHaystack.includes(normalizedSearch)
      })
      .filter(matchesDateRange)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  }, [debouncedSearch, filters.barangay, filters.fromDate, filters.toDate, filters.type, incidents])

  const groupedIncidents = useMemo(
    () => BOARD_COLUMNS.reduce((groups, column) => {
      groups[column.id] = triageIncidents.filter((incident) => STATUS_TO_COLUMN[incident.status] === column.id)
      return groups
    }, {}),
    [triageIncidents],
  )

  const activeIncident = useMemo(
    () => triageIncidents.find((incident) => incident.id === activeIncidentId) ?? null,
    [activeIncidentId, triageIncidents],
  )

  const openIncident = useCallback((incidentId) => {
    setSelectedIncidentId(incidentId)
  }, [])

  const refreshBoard = useCallback(async () => {
    await Promise.all([
      mutateIncidents(),
      selectedIncidentId ? mutateIncidentDetail() : Promise.resolve(),
    ])
  }, [mutateIncidentDetail, mutateIncidents, selectedIncidentId])

  const verifyIncident = useCallback(async (incidentId, staffId) => {
    try {
      await api.patch(`/api/v1/admin/incidents/${incidentId}/verify`, {
        assigned_staff_id: staffId,
      })
      toast.success('Incident verified and assigned.')
      await refreshBoard()
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }, [refreshBoard])

  const rejectIncident = useCallback(async (incidentId, reason) => {
    try {
      await api.patch(`/api/v1/admin/incidents/${incidentId}/reject`, {
        rejection_reason: reason,
      })
      toast.success('Incident rejected.')
      await refreshBoard()
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }, [refreshBoard])

  const progressIncident = useCallback(async (incident, nextStatus, successMessage) => {
    setTransitioningIncidentId(incident.id)

    try {
      await api.patch(`/api/v1/admin/incidents/${incident.id}/status`, {
        status: nextStatus,
        notes: STATUS_NOTES[nextStatus] ?? 'Updated from the triage board.',
        units_coordinated: [],
      })
      toast.success(successMessage)
      await refreshBoard()
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setTransitioningIncidentId(null)
    }
  }, [refreshBoard])

  const handleDragEnd = useCallback(async (event) => {
    setActiveIncidentId(null)

    const incident = triageIncidents.find((item) => item.id === event.active?.id)
    const destinationColumnId = event.over?.id

    if (!incident || !destinationColumnId) {
      return
    }

    const action = resolveDropAction(incident, destinationColumnId)

    if (action.type === 'noop') {
      return
    }

    if (action.type === 'invalid') {
      toast.error(action.message)
      return
    }

    if (action.type === 'open_drawer') {
      toast('Assign a responder in the incident drawer to verify this report.')
      openIncident(incident.id)
      return
    }

    await progressIncident(incident, action.status, action.successMessage)
  }, [openIncident, progressIncident, triageIncidents])

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />
      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center lg:justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Incident Triage</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Operational board</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Drag incidents across the board to progress field operations. Pending reports still require verify-and-assign in the detail drawer before they can leave Unverified.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500 lg:block">
                Assessment and active response share the Dispatched lane to keep the board compact.
              </div>
              <NotificationBell />
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
                <UserCircle2 className="h-5 w-5 text-slate-500" />
                <span className="text-xs font-semibold text-navy">{user?.full_name?.split(' ')[0]}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="space-y-5 px-4 pb-6 pt-5 lg:px-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Board Controls</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Filters &amp; search</h2>
                <p className="mt-1 text-sm text-slate-500">Type, barangay, date range, and keyword search narrow the already-loaded board.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500">
                <RefreshCw className={`h-4 w-4 ${incidentsValidating ? 'animate-spin' : ''}`} />
                Refreshes every 30 seconds
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <label className="space-y-2 text-sm">
                <span className="inline-flex items-center gap-2 font-semibold text-navy">
                  <Filter className="h-4 w-4 text-slate-400" />
                  Incident type
                </span>
                <select
                  className="form-input h-11 py-2"
                  value={filters.type}
                  onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
                >
                  <option value="">All incident types</option>
                  {['fire', 'medical', 'crime', 'flood', 'accident', 'other'].map((type) => (
                    <option key={type} value={type}>{getIncidentType(type).label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-navy">Barangay</span>
                <select
                  className="form-input h-11 py-2"
                  value={filters.barangay}
                  onChange={(event) => setFilters((current) => ({ ...current, barangay: event.target.value }))}
                >
                  <option value="">All barangays</option>
                  {barangayOptions.map((barangay) => (
                    <option key={barangay} value={barangay}>{barangay}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-navy">From date</span>
                <input
                  type="date"
                  className="form-input h-11 py-2"
                  value={filters.fromDate}
                  onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-navy">To date</span>
                <input
                  type="date"
                  className="form-input h-11 py-2"
                  value={filters.toDate}
                  onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <AdminSearchField
                  className="w-full sm:w-[320px]"
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Search code, reporter, responder..."
                />
                <button
                  type="button"
                  onClick={() => setFilters({ type: '', barangay: '', fromDate: '', toDate: '', search: '' })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300"
                >
                  Reset filters
                </button>
              </div>
            </div>
          </section>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(event) => setActiveIncidentId(event.active.id)}
            onDragCancel={() => setActiveIncidentId(null)}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-4 xl:grid-cols-4">
              {BOARD_COLUMNS.map((column) => (
                <BoardColumn key={column.id} column={column} count={groupedIncidents[column.id]?.length ?? 0}>
                  {incidentsLoading ? (
                    <ColumnSkeleton />
                  ) : groupedIncidents[column.id]?.length ? (
                    groupedIncidents[column.id].map((incident) => (
                      <DraggableIncidentCard
                        key={incident.id}
                        incident={incident}
                        disabled={transitioningIncidentId === incident.id}
                        onOpenDetail={openIncident}
                      />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-panel px-4 py-8 text-center text-sm text-slate-500">
                      No incidents match this lane right now.
                    </div>
                  )}
                </BoardColumn>
              ))}
            </section>
            <DragOverlay>
              {activeIncident ? (
                <div className="w-[320px]">
                  <IncidentCard incident={activeIncident} isDragging={false} disabled={false} onOpenDetail={openIncident} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
      </div>
      <AdminIncidentDetailDrawer
        key={selectedIncident?.id ?? selectedIncidentId ?? 'triage-drawer'}
        incident={selectedIncident}
        loading={Boolean(selectedIncidentId) && incidentDetailLoading}
        staff={staff}
        relatedIncidents={relatedIncidents}
        onOpenIncident={openIncident}
        onClose={() => {
          setSelectedIncidentId(null)
        }}
        onVerify={verifyIncident}
        onReject={rejectIncident}
      />
    </div>
  )
}

export default AdminTriagePage
