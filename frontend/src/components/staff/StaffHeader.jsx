import { memo } from 'react'
import { LogOut, UserCircle2 } from 'lucide-react'
import BrandMark from '../BrandMark'
import NotificationBell from '../notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'

const StaffHeader = memo(function StaffHeader({ showBackLink = false }) {
  const { user, logout } = useAuth()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="max-w-[180px]">
          <BrandMark />
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell size="sm" />
          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:inline-flex">
            <UserCircle2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="text-sm font-semibold text-navy">{user?.full_name}</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-navy transition hover:border-danger hover:text-danger sm:min-h-12 sm:px-4 sm:text-sm"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  )
})

export default StaffHeader
