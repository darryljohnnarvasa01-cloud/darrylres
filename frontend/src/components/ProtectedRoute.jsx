import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children, roles = [], ability = null, abilities = [] }) {
  const { isAuthenticated, isHydrating, role, can, defaultRoute } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="admin-surface w-full max-w-md px-6 py-10 text-center">
          <div className="admin-skeleton-block mx-auto h-14 w-14 rounded-2xl" />
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-info">RescueLink</p>
          <p className="mt-2 text-base font-semibold text-navy">Loading workspace</p>
          <p className="mt-2 text-sm text-slate-500">Preparing the latest command center view.</p>
        </div>
      </div>
    )
  }

  if (roles.length > 0 && !roles.includes(role)) {
    return <Navigate to={defaultRoute} replace />
  }

  const requiredAbilities = [...abilities, ...(ability ? [ability] : [])]

  if (requiredAbilities.length > 0 && !requiredAbilities.every((item) => can(item))) {
    return <Navigate to={defaultRoute} replace />
  }

  return children
}

export default ProtectedRoute
