import { ArrowLeft, MailCheck, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import AuthLinkPanel from '../components/AuthLinkPanel'
import BrandMark from '../components/BrandMark'
import { api, ensureCsrfCookie } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'

function ForgotPasswordPage() {
  const location = useLocation()
  const [email, setEmail] = useState(typeof location.state?.email === 'string' ? location.state.email : '')
  const [errors, setErrors] = useState({})
  const [statusMessage, setStatusMessage] = useState('')
  const [statusTone, setStatusTone] = useState('info')
  const [mailWarning, setMailWarning] = useState('')
  const [resetUrl, setResetUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadMailStatus = async () => {
      try {
        const response = await api.get('/api/v1/health')
        const email = response.data?.data?.services?.email

        if (!cancelled && email?.expose_links) {
          setMailWarning('Free mode: password reset links appear on this page instead of email.')
        } else if (!cancelled && email && !email.ok) {
          setMailWarning(email.error ?? 'Password reset email is not configured on this server yet.')
        }
      } catch {
        // Health check is best-effort for this banner.
      }
    }

    loadMailStatus()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrors({})
    setStatusMessage('')
    setStatusTone('info')
    setResetUrl('')
    setIsSubmitting(true)

    try {
      await ensureCsrfCookie()
      const response = await api.post('/api/v1/auth/forgot-password', { email })
      const payload = response.data?.data ?? {}
      const message = response.data?.message ?? 'If that email exists, a password reset link has been sent.'

      setStatusMessage(message)
      setStatusTone('info')

      if (payload.auth_link_on_screen && payload.reset_url) {
        setResetUrl(payload.reset_url)
        toast.success('Use the password reset link below.')
      } else if (payload.email_sent === false) {
        toast.error('The reset email could not be sent. Try again later.')
      } else {
        toast.success(message)
      }

      if (typeof payload.reset_url === 'string' && payload.reset_url) {
        setResetUrl(payload.reset_url)
      }
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

        {mailWarning && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{mailWarning}</span>
          </div>
        )}

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

        <AuthLinkPanel
          title="Password reset link"
          url={resetUrl}
          description="Open this link to set a new password."
        />

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
