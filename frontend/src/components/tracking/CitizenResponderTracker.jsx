import { Loader2, Radio, UserCircle2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import ResponderMap from '../maps/ResponderMap'
import StatusPill from '../incident/StatusPill'
import { api } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'
import { mergeLocationRows, responderActionLabel } from '../../lib/responderTracking'
import { subscribeToResponderLocations, subscribeToResponderStatusLogs } from '../../lib/supabaseRealtime'

function CitizenResponderTracker({ incidentId }) {
  const [tracking, setTracking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [latestLog, setLatestLog] = useState(null)

  useEffect(() => {
    let active = true

    const loadTracking = async () => {
      setLoading(true)
      try {
        const response = await api.get(`/api/v1/incidents/${incidentId}/responder-tracking`, { cacheTtl: 5000 })
        if (active) {
          const payload = response.data?.data ?? {}
          setTracking(payload)
          setLatestLog(payload.status_logs?.[0] ?? null)
        }
      } catch (error) {
        toast.error(parseApiError(error).message, { id: 'citizen-responder-tracking-error' })
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadTracking()

    return () => {
      active = false
    }
  }, [incidentId])

  useEffect(() => {
    const responderId = tracking?.assigned_responder_id

    if (!responderId) {
      return undefined
    }

    let cleanup = () => {}
    let active = true

    subscribeToResponderLocations({
      filter: `responder_id=eq.${responderId}`,
      onChange: (payload) => {
        const row = payload.new ?? payload.old
        if (!row || !active) {
          return
        }

        setTracking((current) => ({
          ...current,
          location: mergeLocationRows(current?.location ? [current.location] : [], row)[0] ?? current?.location,
        }))
      },
      onError: (error) => {
        toast.error(error?.message ?? 'Responder realtime updates failed.', { id: 'citizen-responder-realtime-error' })
      },
    }).then((unsubscribe) => {
      cleanup = unsubscribe
    })

    return () => {
      active = false
      cleanup()
    }
  }, [tracking?.assigned_responder_id])

  useEffect(() => {
    if (!incidentId) {
      return undefined
    }

    let cleanup = () => {}
    let active = true

    subscribeToResponderStatusLogs({
      filter: `incident_id=eq.${incidentId}`,
      onChange: (payload) => {
        if (active && payload.new) {
          setLatestLog(payload.new)
        }
      },
    }).then((unsubscribe) => {
      cleanup = unsubscribe
    })

    return () => {
      active = false
      cleanup()
    }
  }, [incidentId])

  const location = tracking?.location
  const incident = tracking?.incident
  const responder = location?.responder ?? incident?.assignments?.[0]?.staff
  const locations = useMemo(() => (location ? [location] : []), [location])
  const actionStatus = latestLog?.action_status ?? location?.action_status

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Radio className="h-4 w-4 text-danger" />
          Assigned responder
        </h3>
        {incident?.status ? <StatusPill status={incident.status} size="sm" /> : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-panel p-4 text-sm text-slate-500">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Loading responder tracking...
        </div>
      ) : responder ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid gap-0 md:grid-cols-[1fr_260px]">
            <div className="h-72">
              <ResponderMap locations={locations} incident={incident} height={288} />
            </div>
            <aside className="border-t border-slate-200 bg-panel p-4 md:border-l md:border-t-0">
              <div className="flex items-start gap-2">
                <UserCircle2 className="mt-0.5 h-5 w-5 text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">{responder.full_name}</p>
                  {responder.phone ? (
                    <a href={`tel:${responder.phone}`} className="mt-1 inline-flex text-xs font-semibold text-info hover:underline">
                      {responder.phone}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current action</p>
                <p className="mt-1 text-sm font-semibold text-navy">{responderActionLabel(actionStatus)}</p>
                {latestLog?.notes ? <p className="mt-2 text-xs text-slate-600">{latestLog.notes}</p> : null}
              </div>
              <div className="mt-3 rounded-xl bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last location</p>
                <p className="mt-1 text-xs text-slate-600">
                  {location?.recorded_at ? new Date(location.recorded_at).toLocaleString() : 'Waiting for responder location'}
                </p>
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-panel p-4 text-sm text-slate-500">
          A responder has not been assigned yet. This section will update automatically after dispatch.
        </div>
      )}
    </section>
  )
}

export default CitizenResponderTracker
