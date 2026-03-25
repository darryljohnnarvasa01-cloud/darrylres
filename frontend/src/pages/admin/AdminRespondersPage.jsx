import { ArrowUpDown, BarChart3, Clock3, Search, UserCircle2, X } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import AdminSidebar from '../../components/admin/AdminSidebar'
import StatusPill from '../../components/incident/StatusPill'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { getIncidentType } from '../../data/incidentTypes'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import { VALENCIA_BARANGAYS } from '../../data/barangays'

const PERFORMANCE_VARIANTS = {
  Excellent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Good: 'border-blue-200 bg-blue-50 text-blue-700',
  'Needs Improvement': 'border-amber-200 bg-amber-50 text-amber-700',
}

function swrFetcher(path) {
  return api.get(path).then((response) => response.data?.data ?? {})
}

function formatMinutes(value) {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${Number(value).toFixed(1)} min`
}

function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(1)}%`
}

function titleCase(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function assessPerformance(staff) {
  const handled = Number(staff?.total_assignments ?? 0)
  const completion = Number(staff?.completion_rate ?? 0)
  const onTime = Number(staff?.on_time_rate ?? 0)
  const avgResponse = staff?.avg_response_minutes

  if (handled >= 5 && completion >= 90 && onTime >= 85 && avgResponse !== null && avgResponse <= 15) {
    return {
      label: 'Excellent',
      description: 'Consistently closes assigned incidents quickly and within the response SLA.',
    }
  }

  if (handled >= 2 && completion >= 70 && onTime >= 60 && (avgResponse === null || avgResponse <= 25)) {
    return {
      label: 'Good',
      description: 'Maintains solid throughput with only occasional late responses.',
    }
  }

  return {
    label: 'Needs Improvement',
    description: handled
      ? 'Completion rate or first-response timing is falling below the expected command-center standard.'
      : 'No handled incidents have been recorded for this responder yet.',
  }
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <p className="text-base font-semibold text-navy">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function LoadingTable() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  )
}

function SortableHeader({ label, sortKey, currentSort, onToggle }) {
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
      <ArrowUpDown className={`h-3.5 w-3.5 ${active && currentSort.direction === 'asc' ? 'rotate-180' : ''}`} />
    </button>
  )
}

function SummaryCard({ label, value, helper }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-navy">{value}</p>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    </article>
  )
}

function DetailMetric({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-panel p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-navy">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  )
}

function ResponderDetailDrawer({ staff, meta, onClose }) {
  const performance = assessPerformance(staff)
  const monthlyCounts = useMemo(() => staff?.monthly_incident_counts ?? [], [staff])
  const timeline = useMemo(() => staff?.recent_incidents ?? [], [staff])

  if (!staff) {
    return null
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close responder drawer"
        className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Responder Detail</p>
              <h2 className="mt-1 text-2xl font-semibold text-navy">{staff.full_name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                  {titleCase(staff.role)}
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${PERFORMANCE_VARIANTS[performance.label]}`}>
                  {performance.label}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${staff.account_status === 'verified' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  {titleCase(staff.account_status)}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-500">{performance.description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 p-2 text-slate-500 hover:border-danger hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <DetailMetric label="Handled This Month" value={staff.incidents_handled_this_month ?? 0} helper="Distinct incidents touched in the current month." />
            <DetailMetric label="Open Assignments" value={staff.current_open_assignments ?? 0} helper="Incidents still active on the board." />
            <DetailMetric label="Avg Response Time" value={formatMinutes(staff.avg_response_minutes)} helper={`On-time means the first response lands within ${meta?.response_sla_minutes ?? 15} minutes after assignment.`} />
            <DetailMetric label="Avg Resolution Time" value={formatMinutes(staff.avg_resolution_minutes)} helper="Measured from assignment to resolved status." />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Six-Month Volume</p>
                <h3 className="mt-1 text-xl font-semibold text-navy">Handled incidents by month</h3>
              </div>
              <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                {staff.total_assignments ?? 0} total assignments
              </div>
            </div>

            <div className="mt-4">
              {monthlyCounts.some((row) => row.count > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyCounts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value) => [`${value} incidents`, 'Handled']} labelFormatter={(value, payload) => `${value} ${payload?.[0]?.payload?.year ?? ''}`.trim()} />
                    <Bar dataKey="count" fill="#2563EB" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No monthly activity yet"
                  description="This responder has not been assigned any incidents in the last six months."
                />
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent Timeline</p>
                <h3 className="mt-1 text-xl font-semibold text-navy">Last 10 handled incidents</h3>
              </div>
              <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                {timeline.length} entries
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {timeline.length ? (
                timeline.map((incident) => {
                  const typeData = getIncidentType(incident.type)
                  const TypeIcon = typeData.icon

                  return (
                    <article key={incident.incident_id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold text-slate-700">
                              <TypeIcon className="h-3.5 w-3.5" />
                              {typeData.label}
                            </span>
                            <span className="text-sm font-semibold text-navy">{incident.reference_code}</span>
                            <span className="text-xs text-slate-500">{incident.barangay}</span>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                            <p>Assigned: {formatDateTime(incident.assigned_at)}</p>
                            <p>Last Activity: {formatDateTime(incident.last_activity_at)}</p>
                            <p>Response: {formatMinutes(incident.response_minutes)}</p>
                            <p>Resolution: {formatMinutes(incident.resolution_minutes)}</p>
                          </div>
                        </div>
                        <StatusPill status={incident.status} />
                      </div>
                    </article>
                  )
                })
              ) : (
                <EmptyState
                  title="No handled incidents yet"
                  description="Timeline entries will appear here as soon as this responder is assigned to incidents."
                />
              )}
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}

function AdminRespondersPage() {
  const { user, logout } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const deferredSearch = useDeferredValue(searchInput)
  const [sortConfig, setSortConfig] = useState({
    key: 'incidents_handled_this_month',
    direction: 'desc',
  })
  const [selectedStaffId, setSelectedStaffId] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    barangay: '',
    password: '',
    confirm_password: '',
  })
  const [createErrors, setCreateErrors] = useState({})
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const { data, error, isLoading, isValidating, mutate } = useSWR('/api/v1/admin/staff/performance', swrFetcher, {
    revalidateOnFocus: true,
  })

  useEffect(() => {
    if (!error) {
      return
    }

    toast.error(parseApiError(error).message, {
      id: 'staff-performance-error',
    })
  }, [error])

  const staffRows = useMemo(() => data?.staff ?? [], [data])
  const meta = useMemo(() => data?.meta ?? {}, [data])

  const filteredRows = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()

    return staffRows.filter((row) => {
      if (!keyword) {
        return true
      }

      return [
        row.full_name,
        row.role,
        row.barangay,
        row.email,
        row.phone,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    })
  }, [deferredSearch, staffRows])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1

    rows.sort((left, right) => {
      const leftValue = left[sortConfig.key]
      const rightValue = right[sortConfig.key]

      if (typeof leftValue === 'string' || typeof rightValue === 'string') {
        return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * directionMultiplier
      }

      return (Number(leftValue ?? 0) - Number(rightValue ?? 0)) * directionMultiplier
    })

    return rows
  }, [filteredRows, sortConfig.direction, sortConfig.key])

  const selectedStaff = useMemo(
    () => staffRows.find((row) => row.id === selectedStaffId) ?? null,
    [selectedStaffId, staffRows],
  )

  const summary = useMemo(() => {
    const responderCount = staffRows.length
    const avgCompletion = responderCount
      ? staffRows.reduce((total, row) => total + Number(row.completion_rate ?? 0), 0) / responderCount
      : 0
    const avgOnTime = responderCount
      ? staffRows.reduce((total, row) => total + Number(row.on_time_rate ?? 0), 0) / responderCount
      : 0
    const openAssignments = staffRows.reduce((total, row) => total + Number(row.current_open_assignments ?? 0), 0)
    const topResponder = [...staffRows]
      .sort((left, right) => Number(right.incidents_handled_this_month ?? 0) - Number(left.incidents_handled_this_month ?? 0))[0]

    return {
      responderCount,
      avgCompletion,
      avgOnTime,
      openAssignments,
      topResponder,
    }
  }, [staffRows])

  const handleSort = (sortKey) => {
    setSortConfig((current) => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const updateCreateField = (field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }))
  }

  const validateCreateForm = () => {
    const nextErrors = {}

    if (!createForm.full_name.trim()) nextErrors.full_name = 'Full name is required.'
    if (!createForm.email.trim()) nextErrors.email = 'Email is required.'
    if (!createForm.phone.trim()) nextErrors.phone = 'Phone is required.'
    if (!createForm.address.trim()) nextErrors.address = 'Address is required.'
    if (!createForm.barangay.trim()) nextErrors.barangay = 'Barangay is required.'
    if (!createForm.password) nextErrors.password = 'Password is required.'
    if (createForm.password && createForm.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.'
    if (createForm.confirm_password !== createForm.password) nextErrors.confirm_password = 'Passwords do not match.'

    return nextErrors
  }

  const submitCreateStaff = async (event) => {
    event.preventDefault()
    const nextErrors = validateCreateForm()

    if (Object.keys(nextErrors).length > 0) {
      setCreateErrors(nextErrors)
      return
    }

    setCreateSubmitting(true)
    setCreateErrors({})

    try {
      await api.post('/api/v1/admin/staff', {
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        phone: createForm.phone.trim(),
        address: createForm.address.trim(),
        barangay: createForm.barangay.trim(),
        password: createForm.password,
      })
      toast.success('Staff account created.')
      setShowCreateModal(false)
      setCreateForm({
        full_name: '',
        email: '',
        phone: '',
        address: '',
        barangay: '',
        password: '',
        confirm_password: '',
      })
      mutate()
    } catch (error) {
      const parsed = parseApiError(error)
      setCreateErrors(parsed.fields ?? {})
      toast.error(parsed.message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />

      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Responder Operations</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Performance tracker</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Compare responder throughput, response discipline, and current assignment pressure without leaving the admin workspace.
              </p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white hover:bg-[#bc1f34]"
              >
                Add Responder
              </button>
              <NotificationBell />
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
                <UserCircle2 className="h-5 w-5 text-slate-500" />
                <span className="text-xs font-semibold text-navy">{user?.full_name?.split(' ')[0]}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 pb-6 lg:px-6">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Responders" value={summary.responderCount} helper="Verified staff accounts visible to command center admins." />
            <SummaryCard label="Avg Completion Rate" value={formatPercent(summary.avgCompletion)} helper="Resolved incidents divided by total assigned incidents." />
            <SummaryCard label="Avg On-Time Rate" value={formatPercent(summary.avgOnTime)} helper={`Measured against the ${meta.response_sla_minutes ?? 15}-minute first-response SLA.`} />
            <SummaryCard
              label="Open Assignments"
              value={summary.openAssignments}
              helper={summary.topResponder ? `${summary.topResponder.full_name} leads this month with ${summary.topResponder.incidents_handled_this_month} handled incidents.` : 'No responder activity yet.'}
            />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="w-64 border-none bg-transparent outline-none"
                  placeholder="Search responder, barangay, contact..."
                />
              </div>
              <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                {sortedRows.length} responders
              </div>
              <div className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                <Clock3 className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                {isValidating ? 'Refreshing...' : 'Live snapshot'}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Responder Table</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Staff performance overview</h2>
                <p className="mt-1 text-sm text-slate-500">Click any row to open its detailed incident timeline and six-month workload chart.</p>
              </div>
              <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                <BarChart3 className="mr-2 inline h-4 w-4" />
                {meta.generated_at ? `Updated ${formatDateTime(meta.generated_at)}` : 'Waiting for data'}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              {error ? (
                <EmptyState
                  title="Unable to load responder performance"
                  description="The admin performance endpoint did not return successfully. Refresh the page once the backend is available."
                />
              ) : isLoading ? (
                <LoadingTable />
              ) : sortedRows.length ? (
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-2 py-3"><SortableHeader label="Name" sortKey="full_name" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th className="px-2 py-3"><SortableHeader label="Role" sortKey="role" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th className="px-2 py-3"><SortableHeader label="Handled" sortKey="incidents_handled_this_month" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th className="px-2 py-3"><SortableHeader label="Avg Response" sortKey="avg_response_minutes" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th className="px-2 py-3"><SortableHeader label="Avg Resolution" sortKey="avg_resolution_minutes" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th className="px-2 py-3"><SortableHeader label="Completion Rate" sortKey="completion_rate" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th className="px-2 py-3"><SortableHeader label="On-Time Rate" sortKey="on_time_rate" currentSort={sortConfig} onToggle={handleSort} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => {
                      const performance = assessPerformance(row)

                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedStaffId(row.id)}
                          className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${
                            selectedStaffId === row.id ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <td className="px-2 py-4">
                            <div>
                              <p className="font-semibold text-navy">{row.full_name}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>{row.barangay || 'Barangay unavailable'}</span>
                                <span className={`rounded-full border px-2 py-0.5 font-semibold ${PERFORMANCE_VARIANTS[performance.label]}`}>
                                  {performance.label}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-4 text-slate-600">{titleCase(row.role)}</td>
                          <td className="px-2 py-4 font-semibold text-navy">{row.incidents_handled_this_month ?? 0}</td>
                          <td className="px-2 py-4 text-slate-600">{formatMinutes(row.avg_response_minutes)}</td>
                          <td className="px-2 py-4 text-slate-600">{formatMinutes(row.avg_resolution_minutes)}</td>
                          <td className="px-2 py-4 text-slate-600">{formatPercent(row.completion_rate)}</td>
                          <td className="px-2 py-4 text-slate-600">{formatPercent(row.on_time_rate)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  title="No responders match the current search"
                  description="Change the search term to widen the performance table again."
                />
              )}
            </div>
          </section>
        </main>
      </div>

      <ResponderDetailDrawer staff={selectedStaff} meta={meta} onClose={() => setSelectedStaffId(null)} />

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Responder Access</p>
                <h2 className="mt-1 text-lg font-semibold text-navy">Create staff account</h2>
                <p className="mt-1 text-sm text-slate-500">The new responder can log in immediately after creation.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="mt-4 grid gap-3" onSubmit={submitCreateStaff}>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Full name</label>
                <input
                  type="text"
                  className="form-input mt-1 h-10 text-sm"
                  value={createForm.full_name}
                  onChange={(event) => updateCreateField('full_name', event.target.value)}
                />
                {createErrors.full_name && <p className="mt-1 text-xs text-danger">{createErrors.full_name}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</label>
                  <input
                    type="email"
                    className="form-input mt-1 h-10 text-sm"
                    value={createForm.email}
                    onChange={(event) => updateCreateField('email', event.target.value)}
                  />
                  {createErrors.email && <p className="mt-1 text-xs text-danger">{createErrors.email}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Phone</label>
                  <input
                    type="text"
                    className="form-input mt-1 h-10 text-sm"
                    value={createForm.phone}
                    onChange={(event) => updateCreateField('phone', event.target.value)}
                  />
                  {createErrors.phone && <p className="mt-1 text-xs text-danger">{createErrors.phone}</p>}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Barangay</label>
                  <select
                    className="form-input mt-1 h-10 text-sm"
                    value={createForm.barangay}
                    onChange={(event) => updateCreateField('barangay', event.target.value)}
                  >
                    <option value="">Select barangay</option>
                    {VALENCIA_BARANGAYS.map((barangay) => (
                      <option key={barangay} value={barangay}>
                        {barangay}
                      </option>
                    ))}
                  </select>
                  {createErrors.barangay && <p className="mt-1 text-xs text-danger">{createErrors.barangay}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Address</label>
                  <input
                    type="text"
                    className="form-input mt-1 h-10 text-sm"
                    value={createForm.address}
                    onChange={(event) => updateCreateField('address', event.target.value)}
                  />
                  {createErrors.address && <p className="mt-1 text-xs text-danger">{createErrors.address}</p>}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password</label>
                  <input
                    type="password"
                    className="form-input mt-1 h-10 text-sm"
                    value={createForm.password}
                    onChange={(event) => updateCreateField('password', event.target.value)}
                  />
                  {createErrors.password && <p className="mt-1 text-xs text-danger">{createErrors.password}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm password</label>
                  <input
                    type="password"
                    className="form-input mt-1 h-10 text-sm"
                    value={createForm.confirm_password}
                    onChange={(event) => updateCreateField('confirm_password', event.target.value)}
                  />
                  {createErrors.confirm_password && (
                    <p className="mt-1 text-xs text-danger">{createErrors.confirm_password}</p>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {createSubmitting ? 'Creating...' : 'Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminRespondersPage
