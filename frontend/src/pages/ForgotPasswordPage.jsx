import { ArrowLeft, MailCheck, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import BrandMark from '../components/BrandMark'
import { api, ensureCsrfCookie } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'

function ForgotPasswordPage() {
  const location = useLocation()
  const [email, setEmail] = useState(typeof location.state?.email === 'string' ? location.state.email : '')
  const [errors, setErrors] = useState({})
  const [statusMessage, setStatusMessage] = useState('')
  const [statusTone, setStatusTone] = useState('info')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrors({})
    setStatusMessage('')
    setStatusTone('info')
    setIsSubmitting(true)

    try {
      await ensureCsrfCookie()
      const response = await api.post('/api/v1/auth/forgot-password', { email })
      const message = response.data?.message ?? 'If that email exists, a password reset link has been sent.'

      setStatusMessage(message)
      setStatusTone('info')
      toast.success(message)
    } catch (error) {
      const parsed = parseApiError(error)
      setErrors(parsed.fields)
      setStatusMessage(parsed.message)
      setStatusTone('danger')
      toast.error(parsed.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-card">
        <BrandMark />
        <h1 className="mt-6 text-center font-heading text-3xl italic text-navy">Reset Password</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Enter your account email and RescueLink will send a secure reset link.
        </p>

        {statusMessage && (
          <div
            className={
              statusTone === 'danger'
                ? 'mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger'
                : 'mt-4 flex items-start gap-2 rounded-xl border border-info/20 bg-blue-50 px-3 py-2 text-sm text-slate-600'
            }
          >
            {statusTone === 'danger' ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            )}
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
              onChange={(event) => {
                setEmail(event.target.value)
                setErrors((prev) => ({ ...prev, email: undefined }))
                setStatusMessage('')
              }}
              placeholder="name@email.com"
              autoComplete="email"
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Sending link...' : 'Send Reset Link'}
          </button>
        </form>

        <Link
          to="/login"
          className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-info hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
