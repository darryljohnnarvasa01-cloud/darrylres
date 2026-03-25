import { ShieldAlert } from 'lucide-react'

function AdminEmptyState({ title, description, icon, action = null }) {
  const IconComponent = icon ?? ShieldAlert

  return (
    <div className="admin-empty">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-info/10 bg-info/10 text-info">
        <IconComponent className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-semibold text-navy">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

export default AdminEmptyState
