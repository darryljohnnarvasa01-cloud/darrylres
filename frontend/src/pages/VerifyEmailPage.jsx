import { ArrowLeft, MailCheck, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { api } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'

function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])
  const presetStatus = useMemo(() => searchParams.get('status') ?? '', [searchParams])
  const [state, setState] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (presetStatus === 'missing' || !token) {
      setState('missing')
      setMessage('This verification link is missing required information.')
      return
    }

    let cancelled = false

    const verifyEmail = async () => {
      setState('loading')
      setMessage('')

      try {
        const response = await api.get('/api/v1/auth/verify-email', {
          params: { token },
        })
        const payload = response.data?.data ?? {}
        const responseMessage = response.data?.message ?? 'Email verified successfully. You can now sign in.'

        if (!cancelled) {
          setState(payload.already_verified ? 'already_verified' : 'success')
          setMessage(responseMessage)
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        const parsed = parseApiError(error)
        setState('error')
        setMessage(parsed.message || 'The verification link is invalid or has expired.')
      }
    }

    verifyEmail()

    return () => {
      cancelled = true
    }
  }, [token, presetStatus])

  const isLoading = state === 'loading'
  const isSuccess = state === 'success' || state === 'already_verified'

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-card">
        <BrandMark />
        <h1 className="mt-6 text-center font-heading text-3xl italic text-navy">Verify Email</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          {isLoading
            ? 'Confirming your RescueLink account email...'
            : isSuccess
              ? 'Your email address has been confirmed.'
              : 'We could not confirm this verification link.'}
        </p>

        {isLoading && (
          <div className="mt-6 flex justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-danger" />
          </div>
        )}

        {!isLoading && message && (
          <div
            className={
              isSuccess
                ? 'mt-4 flex items-start gap-2 rounded-xl border border-info/20 bg-blue-50 px-3 py-2 text-sm text-slate-600'
                : 'mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger'
            }
          >
            {isSuccess ? (
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        {!isLoading && isSuccess && (
          <p className="mt-4 text-center text-sm text-slate-500">
            You can sign in once your account has been approved by an administrator.
          </p>
        )}

        {!isLoading && !isSuccess && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Sign in and use &quot;Resend verification email&quot; to request a new link.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          {!isLoading && !isSuccess && (
            <Link to="/login" className="font-medium text-info hover:underline">
              Resend from sign in
            </Link>
          )}
          <Link
            to="/login"
            className="inline-flex items-center gap-2 font-medium text-info hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {isSuccess ? 'Continue to sign in' : 'Back to sign in'}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default VerifyEmailPage
