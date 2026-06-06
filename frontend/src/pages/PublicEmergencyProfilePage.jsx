import { AlertTriangle, HeartPulse, Loader2, Phone, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'

function DetailBlock({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-panel px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-navy">{value || 'Not provided'}</p>
    </div>
  )
}

function PublicEmergencyProfilePage() {
  const { qrUuid } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const loadProfile = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await api.get(`/api/v1/public/qr/${qrUuid}`, { cache: false })

        if (active) {
          setProfile(response.data?.data?.profile ?? null)
        }
      } catch (requestError) {
        if (active) {
          setError(parseApiError(requestError).message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [qrUuid])

  return (
    <div className="min-h-screen bg-panel px-4 py-8">
      <main className="mx-auto w-full max-w-2xl">
        <Link to="/" className="mb-5 inline-flex max-w-[190px]">
          <BrandMark />
        </Link>

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-danger" />
            <p className="mt-2 text-sm text-slate-500">Loading emergency profile...</p>
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
            <AlertTriangle className="mx-auto h-9 w-9 text-danger" />
            <h1 className="mt-3 text-2xl font-semibold text-navy">Profile unavailable</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <div className="bg-danger px-5 py-5 text-white">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <HeartPulse className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Emergency Profile</p>
                  <h1 className="mt-1 text-2xl font-semibold">{profile?.full_name ?? 'RescueLink Citizen'}</h1>
                  <p className="mt-1 text-sm text-white/80">
                    {profile?.barangay ? `Barangay ${profile.barangay}` : 'Public-safe medical details'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailBlock label="Blood Type" value={profile?.blood_type} />
                <DetailBlock label="Phone" value={profile?.phone} />
              </div>

              <DetailBlock label="Allergies" value={profile?.allergies} />
              <DetailBlock label="Medical Conditions" value={profile?.medical_conditions} />

              <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-danger">Emergency Contact</p>
                <p className="mt-1 text-sm font-semibold text-navy">
                  {profile?.emergency_contact_name || 'Not provided'}
                </p>
                {profile?.emergency_contact_phone && (
                  <a
                    href={`tel:${profile.emergency_contact_phone}`}
                    className="mt-2 inline-flex items-center gap-2 rounded-xl bg-danger px-3 py-2 text-xs font-semibold text-white"
                  >
                    <Phone className="h-4 w-4" />
                    Call contact
                  </a>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-success" />
                Public-safe RescueLink profile
                {profile?.updated_at ? ` | Updated ${formatDateTime(profile.updated_at)}` : ''}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default PublicEmergencyProfilePage
