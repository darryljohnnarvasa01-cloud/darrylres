import { ArrowUpDown, CheckCircle2, UserCircle2, X, XCircle } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import AdminEmptyState from '../../components/admin/AdminEmptyState'
import AdminSearchField from '../../components/admin/AdminSearchField'
import AdminSkeletonRows from '../../components/admin/AdminSkeletonRows'
import AdminSidebar from '../../components/admin/AdminSidebar'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { api, resolveApiUrl } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'

const statusTabs = ['pending', 'verified', 'rejected']

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString()
}

function badgeClasses(status) {
  if (status === 'pending') return 'bg-warning/15 text-warning'
  if (status === 'verified') return 'bg-success/15 text-success'
  return 'bg-danger/15 text-danger'
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

function AdminRegistrationsPage() {
  const [activeStatus, setActiveStatus] = useState('pending')
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1 })
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const deferredSearch = useDeferredValue(searchInput)
  const [sortConfig, setSortConfig] = useState({ key: 'submitted_at', direction: 'desc' })
  const [govIdPreviews, setGovIdPreviews] = useState({})
  const [imageUrl, setImageUrl] = useState('')
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const { user, logout } = useAuth()

  const fetchRegistrations = useCallback(async (status, page = 1) => {
    setLoading(true)

    try {
      const response = await api.get('/api/v1/admin/registrations', {
        params: { status, page },
      })
      const pageData = response.data?.data?.registrations
      setRows(pageData?.data ?? [])
      setPagination({
        current_page: pageData?.current_page ?? 1,
        last_page: pageData?.last_page ?? 1,
      })
    } catch (error) {
      const parsed = parseApiError(error)
      toast.error(parsed.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRegistrations(activeStatus, 1)
  }, [activeStatus, fetchRegistrations])

  useEffect(() => {
    let active = true
    const createdUrls = []

    setGovIdPreviews({})

    const loadGovIdPreviews = async () => {
      const registrationsWithGovId = rows.filter((row) => row.gov_id_url)

      if (!registrationsWithGovId.length) {
        return
      }

      const previews = await Promise.all(
        registrationsWithGovId.map(async (row) => {
          try {
            const response = await api.get(resolveApiUrl(row.gov_id_url), {
              responseType: 'blob',
            })
            const objectUrl = URL.createObjectURL(response.data)
            createdUrls.push(objectUrl)

            return [row.id, objectUrl]
          } catch {
            return [row.id, '']
          }
        }),
      )

      if (!active) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url))
        return
      }

      setGovIdPreviews(
        Object.fromEntries(previews.filter(([, objectUrl]) => objectUrl)),
      )
    }

    loadGovIdPreviews()

    return () => {
      active = false
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()
    if (!keyword) {
      return rows
    }

    return rows.filter((row) =>
      [row.full_name, row.email, row.barangay, row.phone]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(keyword)),
    )
  }, [deferredSearch, rows])

  const sortedRows = useMemo(() => {
    const nextRows = [...filteredRows]
    const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1

    nextRows.sort((left, right) => {
      const leftValue = left[sortConfig.key]
      const rightValue = right[sortConfig.key]

      if (sortConfig.key === 'submitted_at') {
        return ((new Date(leftValue ?? 0)).getTime() - (new Date(rightValue ?? 0)).getTime()) * directionMultiplier
      }

      return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * directionMultiplier
    })

    return nextRows
  }, [filteredRows, sortConfig.direction, sortConfig.key])

  const handleSort = (sortKey) => {
    setSortConfig((current) => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const approveRegistration = async (id) => {
    try {
      await api.patch(`/api/v1/admin/registrations/${id}/approve`)
      toast.success('Registration approved.')
      fetchRegistrations(activeStatus, pagination.current_page)
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }

  const rejectRegistration = async () => {
    if (!rejectTarget) {
      return
    }

    try {
      await api.patch(`/api/v1/admin/registrations/${rejectTarget.id}/reject`, {
        rejection_reason: rejectReason,
      })
      toast.success('Registration rejected.')
      setRejectTarget(null)
      setRejectReason('')
      fetchRegistrations(activeStatus, pagination.current_page)
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }

  const openGovIdPreview = (rowId) => {
    const previewUrl = govIdPreviews[rowId]

    if (!previewUrl) {
      toast.error('Government ID preview is still loading.')
      return
    }

    setImageUrl(previewUrl)
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />

      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">User Management</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Registrations</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Review and approve new user registrations.</p>
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
          <section className="admin-surface p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <AdminSearchField
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search name, email, barangay, phone..."
                  className="w-full sm:w-[340px]"
                />
                <div className="rounded-2xl bg-panel px-3 py-2 text-xs text-slate-500">
                  {sortedRows.length} registrations on this page
                </div>
              </div>
              <div className="inline-flex rounded-xl bg-panel p-1">
                {statusTabs.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setSearchInput('')
                      setActiveStatus(status)
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                      activeStatus === status ? 'bg-white text-danger shadow' : 'text-slate-500 hover:text-navy'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <AdminSkeletonRows rows={6} className="h-16" />
              ) : sortedRows.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortableHeader label="Name" sortKey="full_name" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Email" sortKey="email" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Barangay" sortKey="barangay" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Phone" sortKey="phone" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Submitted" sortKey="submitted_at" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th>Gov ID</th>
                      <th><SortableHeader label="Status" sortKey="status" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-medium">{row.full_name}</td>
                        <td className="px-3 py-3">{row.email}</td>
                        <td className="px-3 py-3">{row.barangay}</td>
                        <td className="px-3 py-3">{row.phone}</td>
                        <td className="px-3 py-3">{formatDateTime(row.submitted_at)}</td>
                        <td className="px-3 py-3">
                          {row.gov_id_url ? (
                            govIdPreviews[row.id] ? (
                              <button type="button" onClick={() => openGovIdPreview(row.id)} className="group">
                                <img
                                  src={govIdPreviews[row.id]}
                                  alt={`${row.full_name} government ID`}
                                  className="h-10 w-14 rounded-md border border-slate-200 object-cover transition group-hover:border-info"
                                />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openGovIdPreview(row.id)}
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500"
                              >
                                Loading...
                              </button>
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {row.status === 'pending' ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => approveRegistration(row.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-success px-2.5 py-1.5 text-xs font-semibold text-white"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectTarget(row)}
                                className="inline-flex items-center gap-1 rounded-lg border border-danger px-2.5 py-1.5 text-xs font-semibold text-danger"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No action</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <AdminEmptyState
                  title="No registrations match the current filters"
                  description="Switch status tabs or widen the search to review more pending and historical registration requests."
                />
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Page {pagination.current_page} of {pagination.last_page}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagination.current_page <= 1}
                  onClick={() => fetchRegistrations(activeStatus, pagination.current_page - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.current_page >= pagination.last_page}
                  onClick={() => fetchRegistrations(activeStatus, pagination.current_page + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 px-4">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white p-4">
            <button
              type="button"
              onClick={() => setImageUrl('')}
              className="absolute right-4 top-4 rounded-full bg-slate-200 p-2 text-slate-600"
              aria-label="Close image"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={imageUrl} alt="Government ID" className="h-full max-h-[80vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold text-navy">Reject Registration</h2>
            <p className="mt-1 text-sm text-slate-500">
              Provide a rejection reason for <span className="font-medium">{rejectTarget.full_name}</span>.
            </p>
            <textarea
              className="form-input mt-3 min-h-28 resize-none"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Explain why this registration cannot be approved."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null)
                  setRejectReason('')
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={rejectRegistration}
                className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminRegistrationsPage
