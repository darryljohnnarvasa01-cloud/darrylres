import { AlertTriangle, BadgeCheck, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getIncidentType } from '../data/incidentTypes'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'

const STATUS_STYLES = {
  pending_verification: 'bg-amber-100 text-amber-700',
  verified: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  under_assessment: 'bg-sky-100 text-sky-700',
  responding: 'bg-red-100 text-red-700',
  resolved: 'bg-emerald-100 text-emerald-700',
}

function VerifyIncidentPage() {
  const { incidentCode = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [incident, setIncident] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function fetchVerification() {
      setLoading(true)
      setErrorMessage('')

      try {
        const response = await api.get(`/api/v1/public/incidents/verify/${encodeURIComponent(incidentCode)}`)
        if (!isMounted) {
          return
        }
        setIncident(response.data?.data?.incident ?? null)
      } catch (error) {
        if (!isMounted) {
          return
        }
        setIncident(null)
        setErrorMessage(parseApiError(error).message || 'Unable to verify this incident code.')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchVerification()

    return () => {
      isMounted = false
    }
  }, [incidentCode])

  const incidentType = useMemo(() => getIncidentType(incident?.type ?? 'other'), [incident?.type])
  const statusClass = STATUS_STYLES[incident?.status] ?? 'bg-slate-100 text-slate-700'

  return (
    <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 text-[#003366] dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="text-sm font-semibold text-[#CC0000] hover:underline">
            RescueLink
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm dark:bg-slate-900">
            <ShieldCheck className="h-4 w-4 text-[#003366]" />
            CDRRMO Verification Portal
          </div>
        </header>

        <main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-700 dark:bg-slate-900 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700">
            <div>
              <h1 className="font-heading text-4xl italic text-[#003366] dark:text-white">Incident Verification</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Official CDRRMO Valencia City validation record</p>
            </div>
            <img src="/cdrrmo-seal.svg" alt="Official CDRRMO seal" className="h-20 w-20 rounded-full border border-slate-200 dark:border-slate-700" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Validating incident code...
            </div>
          ) : errorMessage ? (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Verification Failed
              </div>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">{errorMessage}</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-[1.4fr,1fr]">
              <section className="space-y-4">
                <article className="rounded-xl bg-[#F8FAFC] p-4 dark:bg-slate-800/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference Code</p>
                  <p className="mt-1 text-lg font-semibold text-[#003366] dark:text-white">{incident?.reference_code}</p>
                </article>

                <article className="rounded-xl bg-[#F8FAFC] p-4 dark:bg-slate-800/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incident Status</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                    {incident?.status?.replaceAll('_', ' ')}
                  </span>
                </article>

                <article className="rounded-xl bg-[#F8FAFC] p-4 dark:bg-slate-800/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incident Details</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                    <p><span className="font-semibold">Type:</span> {incidentType.label}</p>
                    <p><span className="font-semibold">Barangay:</span> {incident?.barangay ?? 'Unknown'}</p>
                    <p><span className="font-semibold">Date Filed:</span> {formatDateTime(incident?.date_filed)}</p>
                  </div>
                </article>
              </section>

              <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <BadgeCheck className="h-4 w-4" />
                  Verified via Official CDRRMO Channel
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                  {incident?.qr_code_svg ? (
                    <img src={incident.qr_code_svg} alt={`QR code for ${incident.reference_code}`} className="mx-auto h-56 w-56" />
                  ) : (
                    <p className="py-10 text-center text-xs text-slate-500">QR code unavailable.</p>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Scan this code or visit <span className="font-semibold">{incident?.verification_path}</span> to validate this incident record.
                </p>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default VerifyIncidentPage
