import { ArrowRight, LogOut, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import BrandMark from '../../components/BrandMark'
import StatusPill from '../../components/incident/StatusPill'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { getIncidentType } from '../../data/incidentTypes'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'under_assessment', label: 'Under Assessment' },
  { value: 'responding', label: 'Responding' },
  { value: 'resolved', label: 'Resolved' },
]

function StaffDashboardPage() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [incidents, setIncidents] = useState({
    data: [],
    current_page: 1,
    last_page: 1,
  })

  const fetchIncidents = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/v1/staff/incidents', {
        params: {
          status: activeTab || undefined,
          page,
          per_page: 10,
        },
      })
      setIncidents(response.data?.data?.incidents ?? { data: [], current_page: 1, last_page: 1 })
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, page])

  useEffect(() => {
    fetchIncidents()
  }, [fetchIncidents])

  const activeCount = useMemo(
    () => incidents.data.filter((item) => item.status !== 'resolved').length,
    [incidents.data],
  )

  return (
    <div className="min-h-screen bg-panel">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="max-w-[180px]">
            <BrandMark />
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:justify-start">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 md:inline-flex">
              <UserCircle2 className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold text-navy">{user?.full_name}</span>
            </div>
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

      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 pb-8 md:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold text-navy">My Assigned Incidents</h1>
            <span className="inline-flex rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-semibold text-danger">
              Active: {activeCount}
            </span>
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => {
                  setPage(1)
                  setActiveTab(tab.value)
                }}
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
          {loading ? (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading assigned incidents...
            </div>
          ) : incidents.data.length > 0 ? (
            incidents.data.map((incident) => {
              const type = getIncidentType(incident.type)
              const Icon = type.icon

              return (
                <article key={incident.id} className="h-20 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 shadow-card sm:h-auto sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:h-10 sm:w-10 ${type.chipClass}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-navy">{type.label}</p>
                        <p className="hidden truncate text-[11px] text-slate-600 sm:block">{incident.address_label}</p>
                        <p className="mt-0.5 hidden text-[10px] leading-tight text-slate-500 sm:block">
                          {timeAgo(incident.incident_datetime ?? incident.created_at)} - Reporter: {incident.reporter?.full_name ?? 'Anonymous'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={incident.status} size="sm" />
                      <Link
                        to={`/staff/incidents/${incident.id}`}
                        aria-label="Open incident"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-danger text-white hover:bg-[#bc1f34]"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })
          ) : (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No assigned incidents found for this filter.
            </div>
          )}
        </section>

        <section className="flex flex-col items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500">
            Page {incidents.current_page ?? 1} of {incidents.last_page ?? 1}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={(incidents.current_page ?? 1) <= 1}
              className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy disabled:opacity-40 sm:min-h-12 sm:text-sm"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={(incidents.current_page ?? 1) >= (incidents.last_page ?? 1)}
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



