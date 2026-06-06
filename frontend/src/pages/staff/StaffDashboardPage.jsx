import { ArrowRight, Clock3, MapPin, RefreshCw, WifiOff } from 'lucide-react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { memo, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import StatusPill from '../../components/incident/StatusPill'
import StaffHeader from '../../components/staff/StaffHeader'
import { useAuth } from '../../context/AuthContext'
import { getIncidentType } from '../../data/incidentTypes'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import { staffQueryKeys } from '../../lib/queryClient'
import { useStaffOperationsStore } from '../../stores/staffOperationsStore'
import { usePullToRefresh } from '../../hooks/useSwipeGestures'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'under_assessment', label: 'Under Assessment' },
  { value: 'responding', label: 'Responding' },
  { value: 'resolved', label: 'Resolved' },
]

function fetchStaffIncidents({ status, page }) {
  return api
    .get('/api/v1/staff/incidents', {
      params: {
        status: status || undefined,
        page,
        per_page: 12,
      },
      cacheTtl: 15000,
    })
    .then((response) => response.data?.data?.incidents ?? { data: [], current_page: 1, last_page: 1 })
}

const DashboardSkeleton = memo(function DashboardSkeleton() {
  return (
    <div className="col-span-full grid gap-2 sm:gap-3 lg:grid-cols-2" aria-label="Loading assigned incidents">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-[92px] animate-pulse rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-slate-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 rounded bg-slate-100" />
              <div className="h-3 w-3/4 rounded bg-slate-100" />
            </div>
            <div className="h-9 w-20 rounded-lg bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  )
})

const IncidentCard = memo(function IncidentCard({ incident }) {
  const type = getIncidentType(incident.type)
  const Icon = type.icon
  const incidentCode = incident.reference_code ?? incident.id.slice(0, 8).toUpperCase()

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card transition hover:border-info/40 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${type.chipClass}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{incidentCode}</p>
              <StatusPill status={incident.status} size="sm" />
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-navy">{type.label}</p>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs text-slate-600">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">{incident.address_label}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Clock3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              {timeAgo(incident.incident_datetime ?? incident.created_at)} - Reporter: {incident.reporter?.full_name ?? 'Anonymous'}
            </p>
          </div>
        </div>
        <Link
          to={`/staff/incidents/${incident.id}`}
          aria-label={`Open incident ${incidentCode}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger text-white transition hover:bg-[#bc1f34] focus:outline-none focus:ring-4 focus:ring-danger/20"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
})

function StaffDashboardPage() {
  useDocumentTitle('My Incidents')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const activeTab = useStaffOperationsStore((state) => state.activeStatus)
  const page = useStaffOperationsStore((state) => state.page)
  const setActiveTab = useStaffOperationsStore((state) => state.setActiveStatus)
  const setPage = useStaffOperationsStore((state) => state.setPage)

  const queryKey = staffQueryKeys.incidents({ status: activeTab, page })
  const {
    data: incidents = { data: [], current_page: 1, last_page: 1 },
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchStaffIncidents({ status: activeTab, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (error) {
      toast.error(parseApiError(error).message, { id: 'staff-incidents-error' })
    }
  }, [error])

  useEffect(() => {
    const echo = window?.Echo

    if (!echo || !user?.id) {
      return undefined
    }

    const channelName = `incidents.${user.id}`
    const channel = echo.private(channelName)
    const revalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['staff', 'incidents'] })
    }

    channel.listen('.IncidentAssigned', revalidate)
    channel.listen('.IncidentStatusUpdated', revalidate)

    return () => echo.leave(`private-${channelName}`)
  }, [queryClient, user?.id])

  const activeCount = useMemo(
    () => incidents.data.filter((item) => item.status !== 'resolved').length,
    [incidents.data],
  )
  const currentPage = incidents.current_page ?? 1
  const lastPage = incidents.last_page ?? 1

  const { isPulling, pullDistance, pullHandlers } = usePullToRefresh({
    onRefresh: async () => {
      await refetch()
    },
  })

  return (
    <div className="min-h-screen bg-panel">
      <StaffHeader />

      {isPulling && (
        <div
          className="fixed left-0 right-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-sm transition-all"
          style={{ top: 0, height: `${Math.min(pullDistance, 80)}px` }}
        >
          <RefreshCw
            className={`h-5 w-5 text-info ${pullDistance >= 80 ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span className="ml-2 text-xs font-semibold text-info">
            {pullDistance >= 80 ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      <main
        className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 pb-8 md:px-6"
        {...pullHandlers}
      >
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-lg font-semibold text-navy">My Assigned Incidents</h1>
              <span className="inline-flex rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-semibold text-danger">
                Active: {activeCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-navy hover:border-info hover:text-info"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => {
                  setActiveTab(tab.value)
                }}
                aria-pressed={activeTab === tab.value}
                className={`min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold sm:min-h-10 sm:px-4 sm:text-xs ${
                  activeTab === tab.value ? 'bg-danger text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-2 sm:gap-3 lg:grid-cols-2">
          {isLoading ? (
            <DashboardSkeleton />
          ) : incidents.data.length > 0 ? (
            incidents.data.map((incident) => <IncidentCard key={incident.id} incident={incident} />)
          ) : (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              <WifiOff className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
              No assigned incidents found for this filter.
            </div>
          )}
        </section>

        <section className="flex flex-col items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500">
            Page {currentPage} of {lastPage}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1 || isFetching}
              className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy disabled:opacity-40 sm:min-h-12 sm:text-sm"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={currentPage >= lastPage || isFetching}
              className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy disabled:opacity-40 sm:min-h-12 sm:text-sm"
            >
              Next
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default StaffDashboardPage



