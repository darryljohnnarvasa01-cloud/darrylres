import { memo, useMemo } from 'react'
import { formatDateTime } from '../../lib/datetime'

const IncidentTimeline = memo(function IncidentTimeline({ logs = [] }) {
  const sortedLogs = useMemo(() => {
    if (!Array.isArray(logs)) return []

    return [...logs].sort((left, right) => {
      const leftTime = Date.parse(left.created_at ?? '')
      const rightTime = Date.parse(right.created_at ?? '')

      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime
      }

      return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
    })
  }, [logs])

  if (!sortedLogs.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <p className="text-sm font-semibold text-navy">Audit Timeline</p>
        <p className="mt-2 text-sm text-slate-500">No timeline entries yet.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-sm font-semibold text-navy">Audit Timeline</p>
      <div className="relative mt-3 border-l border-slate-200 pl-4">
        {sortedLogs.map((log) => (
          <div key={log.id} className="relative pb-4 last:pb-0">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-danger" />
            <p className="text-sm font-semibold capitalize text-navy">
              {log.new_status.replaceAll('_', ' ')}
            </p>
            <p className="text-xs text-slate-500">
              {log.changed_by_user?.full_name ?? 'System'} - {formatDateTime(log.created_at)}
            </p>
            {log.notes && <p className="mt-1 text-sm text-slate-600">{log.notes}</p>}
            {Array.isArray(log.units_coordinated) && log.units_coordinated.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Units: {log.units_coordinated.join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
})

export default IncidentTimeline
