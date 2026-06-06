import { TrendingUp } from 'lucide-react'
import { useMemo } from 'react'

function AiRiskStatsPanel({ stats, loading }) {
  if (loading || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="admin-surface animate-pulse space-y-2 p-4">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-8 w-16 rounded bg-slate-200" />
            <div className="h-2 w-32 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    )
  }

  const criticalPct = stats.total > 0 ? Math.round((stats.critical_count / stats.total) * 100) : 0
  const unresolvedCount = (stats.by_status?.under_assessment || 0) + (stats.by_status?.responding || 0)

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="admin-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total</p>
        <p className="mt-2 text-3xl font-semibold text-navy">{stats.total}</p>
        <p className="mt-1 text-xs text-slate-500">High-risk incidents (70+)</p>
      </div>

      <div className="admin-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Critical</p>
        <div className="mt-2 flex items-end gap-2">
          <p className="text-3xl font-semibold text-danger">{stats.critical_count}</p>
          <p className="mb-1 text-xs font-semibold text-danger">{criticalPct}%</p>
        </div>
        <p className="mt-1 text-xs text-slate-500">Score 90+</p>
      </div>

      <div className="admin-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">In Progress</p>
        <p className="mt-2 text-3xl font-semibold text-navy">{unresolvedCount}</p>
        <p className="mt-1 text-xs text-slate-500">Under assessment or responding</p>
      </div>

      <div className="admin-surface p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          <TrendingUp className="h-3.5 w-3.5" />
          By Type
        </p>
        <div className="mt-3 space-y-1 text-sm">
          {Object.entries(stats.by_type || {}).map(([type, count]) => (
            <div key={type} className="flex items-center justify-between">
              <span className="capitalize text-slate-600">{type}</span>
              <span className="font-semibold text-navy">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Risk Distribution</p>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-xs text-slate-600">Critical</span>
            </span>
            <span className="text-sm font-semibold">{stats.risk_distribution?.critical || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-xs text-slate-600">High</span>
            </span>
            <span className="text-sm font-semibold">{stats.risk_distribution?.high || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              <span className="text-xs text-slate-600">Moderate</span>
            </span>
            <span className="text-sm font-semibold">{stats.risk_distribution?.moderate || 0}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AiRiskStatsPanel
