import { Download, Eye, EyeOff, Loader2, Printer, QrCode, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { parseApiError } from '../lib/errorUtils'
import { createQrCode, qrPath } from '../lib/qrCode'

const EMPTY_PROFILE = {
  blood_type: '',
  allergies: '',
  medical_conditions: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  is_public: true,
}

function QrSvg({ value }) {
  const qr = useMemo(() => {
    if (!value) {
      return null
    }

    try {
      return createQrCode(value)
    } catch {
      return null
    }
  }, [value])

  if (!qr) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-panel p-4 text-center text-xs font-semibold text-slate-500">
        QR unavailable
      </div>
    )
  }

  const border = 4
  const viewBoxSize = qr.size + (border * 2)

  return (
    <svg
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      role="img"
      aria-label="Emergency profile QR code"
      className="aspect-square w-full rounded-xl bg-white"
      shapeRendering="crispEdges"
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
      <path d={qrPath(qr.modules, border)} fill="#0b1120" />
    </svg>
  )
}

function EmergencyProfileCard() {
  const { user } = useAuth()
  const cardRef = useRef(null)
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [qr, setQr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let active = true

    const loadProfile = async () => {
      setLoading(true)

      try {
        const response = await api.get('/api/v1/profile/qr', { cache: false })
        const data = response.data?.data ?? {}

        if (!active) {
          return
        }

        setProfile({
          ...EMPTY_PROFILE,
          ...data.profile,
          blood_type: data.profile?.blood_type ?? '',
          allergies: data.profile?.allergies ?? '',
          medical_conditions: data.profile?.medical_conditions ?? '',
          emergency_contact_name: data.profile?.emergency_contact_name ?? '',
          emergency_contact_phone: data.profile?.emergency_contact_phone ?? '',
          is_public: Boolean(data.profile?.is_public ?? true),
        })
        setQr(data.qr ?? null)
      } catch (error) {
        if (active) {
          toast.error(parseApiError(error).message)
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
  }, [])

  const qrValue = qr?.public_profile_url ?? qr?.public_api_url ?? ''

  const updateField = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const saveProfile = async (event) => {
    event.preventDefault()

    if (navigator.onLine === false) {
      toast.error('Connect to the internet to update your emergency profile.')
      return
    }

    setSaving(true)

    try {
      const response = await api.patch('/api/v1/profile/emergency', {
        blood_type: profile.blood_type.trim() || null,
        allergies: profile.allergies.trim() || null,
        medical_conditions: profile.medical_conditions.trim() || null,
        emergency_contact_name: profile.emergency_contact_name.trim() || null,
        emergency_contact_phone: profile.emergency_contact_phone.trim() || null,
        is_public: profile.is_public,
      })
      const data = response.data?.data ?? {}

      setProfile({
        ...EMPTY_PROFILE,
        ...data.profile,
        blood_type: data.profile?.blood_type ?? '',
        allergies: data.profile?.allergies ?? '',
        medical_conditions: data.profile?.medical_conditions ?? '',
        emergency_contact_name: data.profile?.emergency_contact_name ?? '',
        emergency_contact_phone: data.profile?.emergency_contact_phone ?? '',
        is_public: Boolean(data.profile?.is_public),
      })
      setQr(data.qr ?? null)
      toast.success(response.data?.message ?? 'Emergency profile saved.')
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setSaving(false)
    }
  }

  const captureCard = async () => {
    if (!cardRef.current) {
      return null
    }

    setExporting(true)

    try {
      const { default: html2canvas } = await import('html2canvas')

      return await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      })
    } finally {
      setExporting(false)
    }
  }

  const downloadQr = async () => {
    try {
      const canvas = await captureCard()

      if (!canvas) {
        return
      }

      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `rescuelink-emergency-profile-${profile.qr_uuid ?? 'qr'}.png`
      link.click()
    } catch {
      toast.error('Unable to export the emergency profile QR.')
    }
  }

  const printQr = async () => {
    try {
      const canvas = await captureCard()

      if (!canvas) {
        return
      }

      const printWindow = window.open('', '_blank', 'noopener,noreferrer')

      if (!printWindow) {
        toast.error('Allow pop-ups to print the emergency profile QR.')
        return
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>RescueLink Emergency Profile</title>
            <style>
              body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, sans-serif; }
              img { width: min(92vw, 420px); height: auto; }
            </style>
          </head>
          <body>
            <img src="${canvas.toDataURL('image/png')}" alt="RescueLink Emergency Profile QR" />
            <script>
              window.onload = () => {
                window.print();
                window.close();
              };
            </script>
          </body>
        </html>
      `)
      printWindow.document.close()
    } catch {
      toast.error('Unable to print the emergency profile QR.')
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-danger" />
        <p className="mt-2 text-sm text-slate-500">Loading emergency profile...</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Emergency Profile</p>
          <h2 className="mt-1 text-2xl font-semibold text-navy">QR medical card</h2>
          <p className="mt-1 text-sm text-slate-500">
            Keep critical medical details ready for responders during an emergency.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
          profile.is_public ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-500'
        }`}>
          {profile.is_public ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {profile.is_public ? 'Public QR enabled' : 'Private'}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <form className="space-y-4" onSubmit={saveProfile}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-navy">Blood type</span>
              <input
                value={profile.blood_type}
                onChange={(event) => updateField('blood_type', event.target.value)}
                maxLength={10}
                className="form-input mt-2"
                placeholder="O+"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-navy">Emergency contact phone</span>
              <input
                value={profile.emergency_contact_phone}
                onChange={(event) => updateField('emergency_contact_phone', event.target.value)}
                maxLength={30}
                className="form-input mt-2"
                placeholder="+63 900 000 0000"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-navy">Emergency contact name</span>
            <input
              value={profile.emergency_contact_name}
              onChange={(event) => updateField('emergency_contact_name', event.target.value)}
              maxLength={255}
              className="form-input mt-2"
              placeholder="Name of trusted contact"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-navy">Allergies</span>
            <textarea
              value={profile.allergies}
              onChange={(event) => updateField('allergies', event.target.value)}
              rows={3}
              maxLength={1000}
              className="form-input mt-2 resize-none"
              placeholder="Medication, food, or environmental allergies"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-navy">Medical conditions</span>
            <textarea
              value={profile.medical_conditions}
              onChange={(event) => updateField('medical_conditions', event.target.value)}
              rows={3}
              maxLength={1500}
              className="form-input mt-2 resize-none"
              placeholder="Asthma, diabetes, heart condition, maintenance medication"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-panel px-3 py-3">
            <span>
              <span className="block text-sm font-semibold text-navy">Allow QR scan access</span>
              <span className="text-xs text-slate-500">Only medical and emergency contact fields are exposed.</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-danger"
              checked={profile.is_public}
              onChange={(event) => updateField('is_public', event.target.checked)}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-[#bc1f34] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Emergency Profile
          </button>
        </form>

        <aside className="space-y-3">
          <div ref={cardRef} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <QrCode className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-navy">RescueLink Emergency Profile</p>
            <p className="mt-1 text-xs text-slate-500">{user?.full_name}</p>
            <div className="mx-auto mt-4 w-full max-w-[220px]">
              <QrSvg value={qrValue} />
            </div>
            <p className="mt-3 break-all text-[11px] leading-4 text-slate-500">{qrValue}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={downloadQr}
              disabled={exporting || !qrValue}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-navy hover:border-danger hover:text-danger disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download
            </button>
            <button
              type="button"
              onClick={printQr}
              disabled={exporting || !qrValue}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-navy hover:border-danger hover:text-danger disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default EmergencyProfileCard
