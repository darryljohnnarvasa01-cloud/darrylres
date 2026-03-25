const statusClassMap = {
  pending_verification: 'bg-warning/15 text-warning',
  verified: 'bg-info/15 text-info',
  rejected: 'bg-danger/15 text-danger',
  under_assessment: 'bg-indigo-100 text-indigo-700',
  responding: 'bg-cyan-100 text-cyan-700',
  resolved: 'bg-success/15 text-success',
}

const sizeClassMap = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-xs',
}

function prettifyStatus(status) {
  return status.replaceAll('_', ' ')
}

function StatusPill({ status, size = 'md' }) {
  return (
    <span
      className={`inline-flex rounded-full font-semibold capitalize ${
        sizeClassMap[size] ?? sizeClassMap.md
      } ${
        statusClassMap[status] ?? 'bg-slate-200 text-slate-700'
      }`}
    >
      {prettifyStatus(status)}
    </span>
  )
}

export default StatusPill
