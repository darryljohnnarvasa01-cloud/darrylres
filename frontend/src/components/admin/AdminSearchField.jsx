import { Search, X } from 'lucide-react'
import { memo } from 'react'

const AdminSearchField = memo(function AdminSearchField({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  inputClassName = '',
}) {
  return (
    <label className={`admin-search ${className}`.trim()}>
      <Search className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        value={value}
        onChange={onChange}
        className={`min-w-0 flex-1 border-none bg-transparent outline-none ${inputClassName}`.trim()}
        placeholder={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  )
})

export default AdminSearchField
