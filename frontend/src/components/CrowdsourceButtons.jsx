import { useState } from 'react'
import { ThumbsUp, ThumbsDown, ShieldCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { guestHeaders } from '../lib/guestReporting'
import { distanceMeters } from '../lib/hazardGeometry'
import { parseApiError } from '../lib/errorUtils'

const MAX_DISTANCE_METERS = 1000

function getCredibilityBadge(confirmations, disputes) {
  if (confirmations >= 10) {
    return { label: 'Highly Credible', color: 'text-emerald-700 bg-emerald-100' }
  }

  if (confirmations >= 5) {
    return { label: 'Credible', color: 'text-emerald-700 bg-emerald-100' }
  }

  if (confirmations >= 3) {
    return { label: 'Likely Credible', color: 'text-sky-700 bg-sky-100' }
  }

  if (disputes >= 3 && confirmations === 0) {
    return { label: 'Disputed', color: 'text-rose-700 bg-rose-100' }
  }

  if (disputes >= 1 && confirmations === 0) {
    return { label: 'Under Review', color: 'text-amber-700 bg-amber-100' }
  }

  return null
}

function CrowdsourceButtons({ incident, currentLocation, onUpdate }) {
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState({
    confirmations: incident?.confirmations_count ?? 0,
    disputes: incident?.disputes_count ?? 0,
  })

  const isNearby = currentLocation && incident?.latitude && incident?.longitude
    ? distanceMeters(
      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      { latitude: incident.latitude, longitude: incident.longitude },
    ) <= MAX_DISTANCE_METERS
    : false

  const badge = getCredibilityBadge(counts.confirmations, counts.disputes)

  async function submit(type) {
    if (!currentLocation) {
      toast.error('Location access is required to confirm or dispute incidents.')
      return
    }

    if (!isNearby) {
      toast.error('You must be within 1 km of the incident to confirm or dispute it.')
      return
    }

    setLoading(true)

    try {
      const response = await api.post(
        `/api/v1/incidents/${incident.id}/${type}`,
        {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        { headers: guestHeaders() },
      )

      const data = response.data?.data ?? {}
      setCounts({
        confirmations: data.confirmations_count ?? counts.confirmations,
        disputes: data.disputes_count ?? counts.disputes,
      })

      toast.success(response.data?.message ?? `Incident ${type}ed.`)

      if (onUpdate) {
        onUpdate({
          confirmations_count: data.confirmations_count ?? counts.confirmations,
          disputes_count: data.disputes_count ?? counts.disputes,
        })
      }
    } catch (error) {
      const parsed = parseApiError(error)
      toast.error(parsed.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {badge && (
        <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.color}`}>
          <ShieldCheck className="h-3 w-3" />
          {badge.label}
          {counts.confirmations > 0 && ` (${counts.confirmations} confirmations)`}
        </div>
      )}

      {!badge && counts.confirmations === 0 && counts.disputes === 0 && (
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          <AlertTriangle className="h-3 w-3" />
          Awaiting community confirmation
        </div>
      )}

      {isNearby && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => submit('confirm')}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Confirm ({counts.confirmations})
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => submit('dispute')}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Dispute ({counts.disputes})
          </button>
        </div>
      )}
    </div>
  )
}

export default CrowdsourceButtons
