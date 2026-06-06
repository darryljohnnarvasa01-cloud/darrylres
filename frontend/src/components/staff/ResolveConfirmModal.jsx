import { memo } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

const ResolveConfirmModal = memo(function ResolveConfirmModal({
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-modal-title"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/10">
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
          </span>
          <h3 id="resolve-modal-title" className="text-lg font-semibold text-navy">
            Confirm Resolution
          </h3>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Marking this incident as resolved will lock further updates. This action cannot be undone.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-danger px-4 text-sm font-semibold text-white transition hover:bg-[#bc1f34] disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resolving...
              </>
            ) : (
              'Confirm Resolution'
            )}
          </button>
        </div>
      </div>
    </div>
  )
})

export default ResolveConfirmModal
