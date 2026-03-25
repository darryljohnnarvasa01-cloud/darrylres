import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children, roles = [], ability = null, abilities = [] }) {
  const { isAuthenticated, role, can, defaultRoute } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (roles.length > 0 && !roles.includes(role)) {
    return <Navigate to="/login" replace />
  }

  const requiredAbilities = [...abilities, ...(ability ? [ability] : [])]

  if (requiredAbilities.length > 0 && !requiredAbilities.every((item) => can(item))) {
    return <Navigate to={role === 'admin' ? defaultRoute : '/login'} replace />
  }

  return children
}

export default ProtectedRoute
