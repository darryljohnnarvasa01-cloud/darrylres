import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function DashboardPlaceholderPage() {
  const { user } = useAuth()

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
