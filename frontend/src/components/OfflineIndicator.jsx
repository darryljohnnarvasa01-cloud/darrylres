/**
 * Offline Indicator - Lazy-loaded banner for offline mode
 * Shows persistent badge near SOS button when offline
 */
import { WifiOff, MessageSquare } from 'lucide-react'

function OfflineIndicator({ pendingCount = 0 }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800 shadow-sm">
      <WifiOff className="h-4 w-4 flex-shrink-0 text-amber-600" />
      <span className="text-xs font-semibold">Offline mode</span>
      <span className="h-3 w-px bg-amber-300" />
      <span className="flex items-center gap-1 text-xs">
        <MessageSquare className="h-3 w-3" />
        SMS fallback available
      </span>
      {pendingCount > 0 && (
        <>
          <span className="h-3 w-px bg-amber-300" />
          <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {pendingCount} queued
          </span>
        </>
      )}
    </div>
  )
}

export default OfflineIndicator
