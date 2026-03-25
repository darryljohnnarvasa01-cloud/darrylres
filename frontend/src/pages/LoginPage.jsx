import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import BrandMark from '../components/BrandMark'
import { useAuth } from '../context/AuthContext'
import { api, ensureCsrfCookie } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'
import { getDefaultRouteForUser } from '../lib/permissions'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [statusMessage, setStatusMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrors({})
    setStatusMessage('')
    setIsSubmitting(true)

    try {
      await ensureCsrfCookie()
      const response = await api.post('/api/v1/auth/login', { email, password })
      const payload = response.data?.data

      login({
        user: payload.user,
        token: payload.token,
        role: payload.role,
      })

      toast.success('Signed in successfully.')
      navigate(getDefaultRouteForUser(payload.user, payload.role))
    } catch (error) {
      const parsed = parseApiError(error)
      setErrors(parsed.fields)
      setStatusMessage(parsed.message)
      toast.error(parsed.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-card">
        <BrandMark />
        <h1 className="mt-6 text-center font-heading text-3xl italic text-navy">Welcome Back</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Sign in to continue to RescueLink.</p>

        {statusMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@email.com"
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
            {errors.password && <p className="error-text">{errors.password}</p>}
          </div>

          <div className="text-right">
            <button type="button" className="text-xs font-medium text-info hover:underline">
              Forgot password
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          No account yet?{' '}
          <Link to="/register" className="font-medium text-danger">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}

export default LoginPage
