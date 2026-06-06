import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import EmergencyProfileCard from '../components/EmergencyProfileCard'
import LanguageSwitcher from '../components/LanguageSwitcher'
import CitizenHazardMap from '../components/maps/CitizenHazardMap'
import NotificationBell from '../components/notifications/NotificationBell'
import { useAuth } from '../context/AuthContext'

function DashboardPlaceholderPage() {
  const { user, logout } = useAuth()

  if (user?.role === 'citizen') {
    return (
      <div className="min-h-screen bg-panel">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <Link to="/" className="max-w-[180px]">
              <BrandMark />
            </Link>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <LanguageSwitcher />
              <NotificationBell size="sm" align="right" />
              <Link
                to="/report"
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-danger px-4 text-xs font-semibold text-white hover:bg-[#bc1f34]"
              >
                Report
              </Link>
              <Link
                to="/my-reports"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy hover:border-danger hover:text-danger"
              >
                My Reports
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-semibold text-navy hover:border-danger hover:text-danger"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-info">Citizen Dashboard</p>
            <h1 className="mt-1 font-heading text-4xl italic text-navy">Welcome to RescueLink</h1>
            <p className="mt-2 text-sm text-slate-500">
              Signed in as <span className="font-semibold text-navy">{user?.full_name}</span>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/broadcasts"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy hover:border-danger hover:text-danger"
              >
                Broadcasts
              </Link>
              <Link
                to="/volunteer"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy hover:border-danger hover:text-danger"
              >
                Volunteer
              </Link>
              <Link
                to="/evacuation"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy hover:border-danger hover:text-danger"
              >
                Evacuation
              </Link>
              <Link
                to="/sos"
                className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc1f34]"
              >
                SOS
              </Link>
            </div>
          </section>

          <CitizenHazardMap />

          <EmergencyProfileCard />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-card">
        <h1 className="font-heading text-4xl italic text-navy">Welcome to RescueLink</h1>
        <p className="mt-3 text-sm text-slate-500">
          Signed in as <span className="font-semibold text-navy">{user?.full_name}</span> ({user?.role}).
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Module 01 is complete. Incident submission and role dashboards are next.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-navy hover:border-danger hover:text-danger"
        >
          Back to Login
        </Link>
      </div>
    </div>
  )
}

export default DashboardPlaceholderPage
