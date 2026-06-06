import { useEffect } from 'react'

export function useOfflineSync() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let disposed = false
    let stopSync = null

    const start = () => {
      import('../offline/offlineReports')
        .then((module) => {
          if (disposed) {
            return
          }

          stopSync = module.startOfflineSyncEngine()
        })
        .catch(() => {
          // Offline sync is intentionally isolated from the main UI.
        })
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(start, { timeout: 3000 })

      return () => {
        disposed = true
        window.cancelIdleCallback(idleId)
        stopSync?.()
      }
    }

    const timer = window.setTimeout(start, 0)

    return () => {
      disposed = true
      window.clearTimeout(timer)
      stopSync?.()
    }
  }, [])
}
