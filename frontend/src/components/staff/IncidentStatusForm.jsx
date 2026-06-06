import { memo } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

const STATUS_FLOW = {
  verified: 'under_assessment',
  under_assessment: 'responding',
  responding: 'resolved',
}

const STATUS_LABELS = {
  under_assessment: 'Under Assessment',
  responding: 'Responding',
  resolved: 'Resolved',
}

const UNIT_OPTIONS = ['BFP Fire Bureau', 'PNP Police', 'CDRRMO Team', 'Medical/EMS', 'LGU Officials']

const IncidentStatusForm = memo(function IncidentStatusForm({
  incident,
  notes,
  selectedStatus,
  unitsCoordinated,
  formError,
  isSubmitting,
  onNotesChange,
  onStatusChange,
  onToggleUnit,
  onSubmit,
  onResolveModalOpen,
}) {
  const nextStatus = STATUS_FLOW[incident?.status] ?? ''
  const isResolved = incident?.status === 'resolved' || Boolean(incident?.resolved_at)

  if (isResolved) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card md:sticky md:bottom-0 md:z-20 md:shadow-[0_-10px_24px_rgba(12,35,64,0.08)]">
        <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-xs text-success sm:text-sm">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-semibold">Resolved - further edits are locked.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card md:sticky md:bottom-0 md:z-20 md:shadow-[0_-10px_24px_rgba(12,35,64,0.08)]">
      <form className="space-y-2" onSubmit={onSubmit}>
        <p className="text-sm font-semibold text-navy">Update Incident Status</p>
        <select
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="form-input min-h-10 text-sm"
          aria-label="Select next status"
        >
          <option value="">Select next status</option>
          {nextStatus && <option value={nextStatus}>{STATUS_LABELS[nextStatus]}</option>}
        </select>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="form-input min-h-20 resize-none text-sm"
          placeholder="Describe what you found on scene..."
          aria-label="Field notes"
          rows={4}
        />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {UNIT_OPTIONS.map((unit) => (
            <label
              key={unit}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50 sm:text-sm"
            >
              <input
                type="checkbox"
                checked={unitsCoordinated.includes(unit)}
                onChange={() => onToggleUnit(unit)}
                className="h-4 w-4 rounded border-slate-300 text-danger focus:ring-danger"
              />
              {unit}
            </label>
          ))}
        </div>
        {formError && (
          <p className="rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !nextStatus}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-danger px-4 text-sm font-semibold text-white transition hover:bg-[#bc1f34] disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Update'
          )}
        </button>
      </form>
    </section>
  )
})

export default IncidentStatusForm
