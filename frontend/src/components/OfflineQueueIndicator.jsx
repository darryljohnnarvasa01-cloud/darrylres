import { CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../lib/i18n'

const OFFLINE_REPORT_QUEUE_CHANGED = 'rescuelink:offline-report-queue-changed'

function OfflineQueueIndicator() {
  const { t } = useI18n()
  const [summary, setSummary] = useState({ pending: 0, syncing: 0, failed: 0, synced: 0 })
  const [loading, setLoading] = useState(true)

  const refreshSummary = useCallback(async () => {
    try {
      const module = await import('../offline/offlineReports')
      const nextSummary = await module.getOfflineQueueSummary()
      setSummary(nextSummary)
    } catch {
      setSummary({ pending: 0, syncing: 0, failed: 0, synced: 0 })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshSummary()

    const interval = window.setInterval(refreshSummary, 10000)
    window.addEventListener('online', refreshSummary)
    window.addEventListener(OFFLINE_REPORT_QUEUE_CHANGED, refreshSummary)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', refreshSummary)
      window.removeEventListener(OFFLINE_REPORT_QUEUE_CHANGED, refreshSummary)
    }
  }, [refreshSummary])

  const activeCount = useMemo(
    () => Number(summary.pending ?? 0) + Number(summary.syncing ?? 0) + Number(summary.failed ?? 0),
    [summary],
  )

  if (!loading && activeCount === 0) {
    return null
  }

  return (
    <div className="rounded-2xl border border-info/20 bg-blue-50 px-4 py-3 text-sm text-slate-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-info">
            {loading || summary.syncing > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CloudOff className="h-4 w-4" />
            )}
          </span>
          <div>
            <p className="font-semibold text-navy">{t('Pending')} offline {t('Report')}: {loading ? '...' : activeCount}</p>
            <p className="text-xs text-slate-500">
              {summary.failed > 0
                ? `${summary.failed} need retry. They will sync automatically when connection is stable.`
                : 'Saved reports will sync automatically when connection is stable.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshSummary}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-info hover:text-info"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
    </div>
  )
}

export default OfflineQueueIndicator
