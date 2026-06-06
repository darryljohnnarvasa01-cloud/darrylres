import { AlertTriangle, Bot, Check, Download, Loader2, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import AdminSidebar from '../../components/admin/AdminSidebar'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'
import AiRiskFilterPanel from '../../components/admin/AiRiskFilterPanel'
import AiRiskIncidentCard from '../../components/admin/AiRiskIncidentCard'
import AiRiskStatsPanel from '../../components/admin/AiRiskStatsPanel'

function AdminAiRiskPage() {
  const { user, logout } = useAuth()
  const [incidents, setIncidents] = useState([])
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1 })
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [filters, setFilters] = useState({
    type: null,
    status: null,
    from_date: null,
    to_date: null,
    search: '',
    sort_by: 'risk_score',
  })

  const fetchRiskBoard = async (page = 1) => {
    setLoading(true)

    try {
      const params = {
        page,
        per_page: 20,
      }

      const response = await api.get('/api/v1/admin/ai-risk-board', {
        params,
        cacheTtl: 8000,
      })

      const pageData = response.data?.data?.incidents
      setIncidents(pageData?.data ?? [])
      setPagination({
        current_page: pageData?.current_page ?? 1,
        last_page: pageData?.last_page ?? 1,
      })

      // Mock stats data based on incidents
      if (pageData?.data?.length > 0) {
        const criticalCount = pageData.data.filter(i => Number(i.ai_risk_score) >= 90).length
        const byType = {}
        pageData.data.forEach(i => {
          byType[i.type] = (byType[i.type] || 0) + 1
        })

        setStats({
          total: pageData.data.length,
          critical_count: criticalCount,
          by_type: byType,
          by_status: {},
          risk_distribution: {
            critical: criticalCount,
            high: pageData.data.filter(i => Number(i.ai_risk_score) >= 80).length - criticalCount,
          }
        })
      }
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedIds(new Set())
    fetchRiskBoard(1)
  }, [filters])

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters)
  }

  const handleResetFilters = () => {
    setFilters({
      type: null,
      status: null,
      from_date: null,
      to_date: null,
      search: '',
      sort_by: 'risk_score',
    })
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(incidents.map(i => i.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectIncident = (id, selected) => {
    const newSelected = new Set(selectedIds)
    if (selected) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedIds(newSelected)
  }

  const handleExport = () => {
    if (incidents.length === 0) {
      toast.error('No incidents to export')
      return
    }

    const headers = ['ID', 'Type', 'Status', 'Risk Score', 'Location', 'Reporter', 'Created Date']
    const rows = incidents.map(inc => [
      inc.reference_code ?? inc.id.slice(0, 8),
      inc.type,
      inc.status,
      inc.ai_risk_score,
      inc.address_label,
      inc.reporter?.full_name || 'Guest',
      new Date(inc.created_at).toLocaleString(),
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-risk-board-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    toast.success(`Exported ${incidents.length} incidents`)
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />
      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">AI Incident Detection</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">AI risk board</h1>
              <p className="mt-1 text-sm text-slate-500">
                Clustered reports within 500 meters and 30 minutes are escalated for review.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <button
                type="button"
                onClick={() => {
                  fetchRiskBoard(pagination.current_page)
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy hover:border-info hover:text-info"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 pb-6 pt-5 lg:px-6">
          {/* Statistics */}
          <AiRiskStatsPanel stats={stats} loading={statsLoading} />

          {/* Filters and Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <AiRiskFilterPanel filters={filters} onFiltersChange={handleFilterChange} onReset={handleResetFilters} />
            {incidents.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy hover:border-info hover:text-info"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </>
            )}
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-3">
              <span className="flex-1 text-sm font-semibold text-info">
                {selectedIds.size} incident{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>
          )}

          {/* Incidents Section */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Bot className="h-3.5 w-3.5" />
                  Risk Queue
                </p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Cluster-detected incidents</h2>
              </div>
              <div className="rounded-xl border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-500">
                Page {pagination.current_page} of {pagination.last_page}
              </div>
            </div>

            {loading ? (
              <div className="flex h-52 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-danger" />
              </div>
            ) : incidents.length ? (
              <div className="space-y-3">
                {/* Select All */}
                <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === incidents.length && incidents.length > 0}
                    onChange={handleSelectAll}
                    className="h-5 w-5 rounded border-slate-300 text-info focus:ring-info"
                  />
                  <span className="text-xs font-semibold text-slate-600">
                    Select all on this page ({incidents.length})
                  </span>
                </div>

                {/* Incidents */}
                {incidents.map((incident) => (
                  <AiRiskIncidentCard
                    key={incident.id}
                    incident={incident}
                    selected={selectedIds.has(incident.id)}
                    onSelect={(selected) => handleSelectIncident(incident.id, selected)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
                <p className="text-sm font-semibold text-navy">No high-risk clusters detected.</p>
                <p className="mt-1 text-sm text-slate-500">The board will fill when AI scores reach 70 or higher.</p>
              </div>
            )}

            {/* Pagination */}
            {incidents.length > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={pagination.current_page <= 1}
                  onClick={() => {
                    setSelectedIds(new Set())
                    fetchRiskBoard(pagination.current_page - 1)
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-600">
                  Page {pagination.current_page} of {pagination.last_page}
                </span>
                <button
                  type="button"
                  disabled={pagination.current_page >= pagination.last_page}
                  onClick={() => {
                    setSelectedIds(new Set())
                    fetchRiskBoard(pagination.current_page + 1)
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

export default AdminAiRiskPage
