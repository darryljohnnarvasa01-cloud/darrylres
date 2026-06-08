import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import BrandMark from '../components/BrandMark'
import { api, ensureCsrfCookie } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'

const initialForm = {
  password: '',
  password_confirmation: '',
}

function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const email = useMemo(() => searchParams.get('email') ?? '', [searchParams])
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [statusMessage, setStatusMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasResetLink = Boolean(email && token)

  const setFieldValue = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setStatusMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!hasResetLink) {
      setStatusMessage('This password reset link is missing required information.')
      return
    }

    setErrors({})
    setStatusMessage('')
    setIsSubmitting(true)

    try {
      await ensureCsrfCookie()
      const response = await api.post('/api/v1/auth/reset-password', {
        email,
        token,
        password: form.password,
        password_confirmation: form.password_confirmation,
      })
      const message = response.data?.message ?? 'Password reset successfully. You can now sign in.'

      toast.success(message)
      navigate('/login', {
        replace: true,
        state: {
          email,
          passwordReset: true,
        },
      })
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
        <h1 className="mt-6 text-center font-heading text-3xl italic text-navy">New Password</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Set a new password for your RescueLink account.
        </p>

        {statusMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {!hasResetLink && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-info/20 bg-blue-50 px-3 py-2 text-sm text-slate-600">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <span>Request a new reset link before changing your password.</span>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">New Password</label>
            <input
              type="password"
              className="form-input"
              value={form.password}
              onChange={(event) => setFieldValue('password', event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={!hasResetLink}
            />
            {errors.password && <p className="error-text">{errors.password}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              value={form.password_confirmation}
              onChange={(event) => setFieldValue('password_confirmation', event.target.value)}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              disabled={!hasResetLink}
            />
            {errors.password_confirmation && (
              <p className="error-text">{errors.password_confirmation}</p>
            )}
            {errors.token && <p className="error-text">{errors.token}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !hasResetLink}
            className="w-full rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving password...' : 'Save New Password'}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link to="/forgot-password" className="font-medium text-info hover:underline">
            Request new link
          </Link>
          <Link to="/login" className="inline-flex items-center gap-2 font-medium text-info hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage
