import { ArrowUpDown, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Download, FileSearch, Filter, Search, UserCircle2 } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import AdminEmptyState from '../../components/admin/AdminEmptyState'
import AdminSearchField from '../../components/admin/AdminSearchField'
import AdminSkeletonRows from '../../components/admin/AdminSkeletonRows'
import AdminSidebar from '../../components/admin/AdminSidebar'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'

function toDateInputValue(date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function startOfMonth(date) {
  const next = new Date(date)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

function auditFetcher([path, params]) {
  return api.get(path, { params }).then((response) => response.data?.data ?? {})
}

function normalizeValue(value) {
  if (value === undefined) {
    return 'Not set'
  }

  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}

function flattenObject(value, prefix = '') {
  if (Array.isArray(value)) {
    if (!value.length) {
      return prefix ? { [prefix]: [] } : {}
    }

    return value.reduce((accumulator, item, index) => ({
      ...accumulator,
      ...flattenObject(item, prefix ? `${prefix}[${index}]` : `[${index}]`),
    }), {})
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)

    if (!entries.length) {
      return prefix ? { [prefix]: {} } : {}
    }

    return entries.reduce((accumulator, [key, item]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key

      return {
        ...accumulator,
        ...flattenObject(item, nextPrefix),
      }
    }, {})
  }

  return prefix ? { [prefix]: value } : {}
}

function buildDiffRows(beforeState, afterState) {
  const beforeFlat = flattenObject(beforeState ?? {})
  const afterFlat = flattenObject(afterState ?? {})
  const fields = Array.from(new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)])).sort()

  return fields.map((field) => {
    const beforeValue = beforeFlat[field]
    const afterValue = afterFlat[field]

    return {
      field,
      beforeValue,
      afterValue,
      changed: JSON.stringify(beforeValue) !== JSON.stringify(afterValue),
    }
  })
}

function ActionBadge({ action }) {
  const tone = action.startsWith('incident')
    ? 'border-danger/20 bg-danger/10 text-danger'
    : action.startsWith('registration')
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-blue-200 bg-blue-50 text-blue-700'

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {action.replaceAll('.', ' / ').replaceAll('_', ' ')}
    </span>
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
      <ArrowUpDown className={`h-3.5 w-3.5 transition ${active && currentSort.direction === 'asc' ? 'rotate-180' : ''}`} />
    </button>
  )
}

function DiffPanel({ title, rows, side }) {
  const accentClass = side === 'before' ? 'border-red-100 bg-red-50/40' : 'border-emerald-100 bg-emerald-50/40'

  return (
    <div className={`rounded-2xl border p-4 ${accentClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <div key={`${side}-${row.field}`} className="rounded-xl bg-white/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{row.field}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">{normalizeValue(side === 'before' ? row.beforeValue : row.afterValue)}</pre>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-white/80 p-3 text-sm text-slate-500">No values recorded.</p>
        )}
      </div>
    </div>
  )
}

function AuditRow({ log, expanded, onToggle }) {
  const diffRows = useMemo(() => buildDiffRows(log.before_state, log.after_state), [log.after_state, log.before_state])
  const changedRows = diffRows.filter((row) => row.changed)

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-2 py-4">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-2 text-left text-sm font-semibold text-navy"
          >
            <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
            {formatDateTime(log.created_at)}
          </button>
        </td>
        <td className="px-2 py-4 text-sm text-slate-600">
          <p className="font-semibold text-navy">{log.user?.full_name ?? 'System'}</p>
          <p className="text-xs text-slate-500">{log.user?.role ?? 'system'}</p>
        </td>
        <td className="px-2 py-4"><ActionBadge action={log.action_type} /></td>
        <td className="px-2 py-4 text-sm text-slate-600">
          {log.incident?.reference_code || log.incident?.id || 'N/A'}
        </td>
        <td className="px-2 py-4 text-sm text-slate-600">
          <p>{log.entity_type ?? 'N/A'}</p>
          <p className="text-xs text-slate-500">{log.entity_id ?? 'Unknown'}</p>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-slate-100 bg-slate-50/70">
          <td colSpan={5} className="px-4 py-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <DiffPanel title="Before" rows={changedRows.length ? changedRows : diffRows} side="before" />
              <DiffPanel title="After" rows={changedRows.length ? changedRows : diffRows} side="after" />
            </div>
            {log.metadata && Object.keys(log.metadata).length ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Metadata</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">{normalizeValue(log.metadata)}</pre>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  )
}

function AdminAuditPage() {
  const { user, logout } = useAuth()
  const today = useMemo(() => new Date(), [])
  const [filters, setFilters] = useState({
    userId: '',
    actionType: '',
    incidentId: '',
    from: toDateInputValue(startOfMonth(today)),
    to: toDateInputValue(today),
    page: 1,
  })
  const [incidentSearch, setIncidentSearch] = useState('')
  const deferredIncidentSearch = useDeferredValue(incidentSearch)
  const [tableSearchInput, setTableSearchInput] = useState('')
  const deferredTableSearch = useDeferredValue(tableSearchInput)
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' })
  const [expandedLogId, setExpandedLogId] = useState(null)

  const requestParams = useMemo(() => ({
    user_id: filters.userId || undefined,
    action_type: filters.actionType || undefined,
    incident_id: deferredIncidentSearch || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page: filters.page,
    per_page: 12,
  }), [deferredIncidentSearch, filters.actionType, filters.from, filters.page, filters.to, filters.userId])

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ['/api/v1/admin/audit-logs', requestParams],
    auditFetcher,
    {
      revalidateOnFocus: true,
    },
  )

  useEffect(() => {
    if (!error) {
      return
    }

    toast.error(parseApiError(error).message, {
      id: 'audit-log-error',
    })
  }, [error])

  const logs = useMemo(() => data?.logs?.data ?? [], [data])
  const pagination = useMemo(() => data?.logs ?? {}, [data])
  const filterOptions = useMemo(() => data?.filters ?? { users: [], action_types: [] }, [data])

  const filteredLogs = useMemo(() => {
    const keyword = deferredTableSearch.trim().toLowerCase()

    if (!keyword) {
      return logs
    }

    return logs.filter((log) => [
      log.user?.full_name,
      log.user?.role,
      log.action_type,
      log.entity_type,
      log.entity_id,
      log.incident?.reference_code,
      log.incident?.id,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword)))
  }, [deferredTableSearch, logs])

  const sortedLogs = useMemo(() => {
    const nextLogs = [...filteredLogs]
    const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1

    nextLogs.sort((left, right) => {
      if (sortConfig.key === 'created_at') {
        return ((new Date(left.created_at)).getTime() - (new Date(right.created_at)).getTime()) * directionMultiplier
      }

      const leftValue = sortConfig.key === 'user' ? left.user?.full_name : left[sortConfig.key]
      const rightValue = sortConfig.key === 'user' ? right.user?.full_name : right[sortConfig.key]

      return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * directionMultiplier
    })

    return nextLogs
  }, [filteredLogs, sortConfig.direction, sortConfig.key])

  const visibleExpandedLogId = useMemo(
    () => (sortedLogs.some((log) => log.id === expandedLogId) ? expandedLogId : null),
    [expandedLogId, sortedLogs],
  )

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' ? value : 1,
    }))
  }

  const handleSort = (sortKey) => {
    setSortConfig((current) => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const exportCsv = async () => {
    try {
      const response = await api.get('/api/v1/admin/audit-logs', {
        params: {
          ...requestParams,
          format: 'csv',
        },
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'rescuelink-audit-logs.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      toast.success('CSV export generated.')
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    }
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />

      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">System Oversight</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Audit log viewer</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Review admin and staff actions, compare before-and-after state changes, and export a filtered activity trail for incident governance.
              </p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <NotificationBell />
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
                <UserCircle2 className="h-5 w-5 text-slate-500" />
                <span className="text-xs font-semibold text-navy">{user?.full_name?.split(' ')[0]}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 pb-6 lg:px-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="grid gap-3 lg:grid-cols-[1.1fr_1.1fr_1fr_1fr_auto]">
              <label className="space-y-2 text-sm">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Filter className="h-4 w-4" />
                  User
                </span>
                <select
                  value={filters.userId}
                  onChange={(event) => updateFilter('userId', event.target.value)}
                  className="form-input h-11 w-full text-sm"
                >
                  <option value="">All admins and staff</option>
                  {filterOptions.users.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} ({person.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <FileSearch className="h-4 w-4" />
                  Action Type
                </span>
                <select
                  value={filters.actionType}
                  onChange={(event) => updateFilter('actionType', event.target.value)}
                  className="form-input h-11 w-full text-sm"
                >
                  <option value="">All actions</option>
                  {filterOptions.action_types.map((actionType) => (
                    <option key={actionType} value={actionType}>
                      {actionType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Search className="h-4 w-4" />
                  Incident ID
                </span>
                <input
                  value={incidentSearch}
                  onChange={(event) => {
                    setIncidentSearch(event.target.value)
                    setFilters((current) => ({ ...current, page: 1 }))
                  }}
                  className="form-input h-11 w-full text-sm"
                  placeholder="Filter by incident UUID"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <CalendarRange className="h-4 w-4" />
                    From
                  </span>
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(event) => updateFilter('from', event.target.value)}
                    className="form-input h-11 w-full text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <CalendarRange className="h-4 w-4" />
                    To
                  </span>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(event) => updateFilter('to', event.target.value)}
                    className="form-input h-11 w-full text-sm"
                  />
                </label>
              </div>

              <div className="flex items-end gap-3">
                <button
                  type="button"
                  onClick={() => mutate()}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-navy"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>
          </section>

          <section className="admin-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Audit Trail</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Filtered activity log</h2>
                <p className="mt-1 text-sm text-slate-500">Expand any row to inspect a side-by-side diff of the captured before-and-after state.</p>
              </div>
              <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                {isValidating ? 'Refreshing audit feed...' : `${pagination.total ?? logs.length ?? 0} total logs`}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AdminSearchField
                value={tableSearchInput}
                onChange={(event) => setTableSearchInput(event.target.value)}
                placeholder="Search user, action, entity, incident..."
                className="w-full sm:w-[380px]"
              />
              <div className="rounded-2xl bg-panel px-3 py-2 text-xs text-slate-500">
                {sortedLogs.length} visible rows
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              {error ? (
                <AdminEmptyState
                  title="Unable to load audit logs"
                  description="The backend did not return the audit feed successfully. Retry once the admin API is available."
                />
              ) : isLoading ? (
                <AdminSkeletonRows rows={6} className="h-16" />
              ) : sortedLogs.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortableHeader label="Timestamp" sortKey="created_at" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="User" sortKey="user" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Action" sortKey="action_type" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th>Incident</th>
                      <th><SortableHeader label="Entity" sortKey="entity_type" currentSort={sortConfig} onToggle={handleSort} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLogs.map((log) => (
                        <AuditRow
                          key={log.id}
                          log={log}
                          expanded={visibleExpandedLogId === log.id}
                          onToggle={() => setExpandedLogId((current) => (current === log.id ? null : log.id))}
                        />
                    ))}
                  </tbody>
                </table>
              ) : (
                <AdminEmptyState
                  title="No audit entries match the current filters"
                  description="Change the server-side filters or the local search to widen the activity trail again."
                />
              )}
            </div>

            {logs.length ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Page {pagination.current_page ?? 1} of {pagination.last_page ?? 1}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!pagination.prev_page_url}
                    onClick={() => updateFilter('page', Math.max(1, (pagination.current_page ?? 1) - 1))}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-navy disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!pagination.next_page_url}
                    onClick={() => updateFilter('page', (pagination.current_page ?? 1) + 1)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-navy disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  )
}

export default AdminAuditPage
