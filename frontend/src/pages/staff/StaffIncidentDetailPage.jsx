import { ArrowLeft, MessageCircle, Phone } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import StatusPill from '../../components/incident/StatusPill'
import IncidentDetailSkeleton from '../../components/staff/IncidentDetailSkeleton'
import IncidentMap from '../../components/staff/IncidentMap'
import IncidentMediaGallery from '../../components/staff/IncidentMediaGallery'
import IncidentStatusForm from '../../components/staff/IncidentStatusForm'
import IncidentTimeline from '../../components/staff/IncidentTimeline'
import ResolveConfirmModal from '../../components/staff/ResolveConfirmModal'
import ResponderTrackingPanel from '../../components/tracking/ResponderTrackingPanel'
import StaffHeader from '../../components/staff/StaffHeader'
import { useAuth } from '../../context/AuthContext'
import { getIncidentType } from '../../data/incidentTypes'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import { staffQueryKeys } from '../../lib/queryClient'
import { useStaffLocation } from '../../hooks/useStaffLocation'
import { useStaffRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

function normalizeTelHref(phone) {
  const value = String(phone ?? '').trim()

  if (!value) {
    return ''
  }

  if (value.startsWith('+')) {
    return `+${value.slice(1).replace(/\D/g, '')}`
  }

  return value.replace(/\D/g, '')
}

function buildCitizenSmsHref(phoneHref, incident) {
  if (!phoneHref) {
    return ''
  }

  const location = incident?.address_label || 'your reported location'
  const message = `RescueLink: We are responding to your incident at ${location}. Please reply with your exact location and any urgent updates.`

  return `sms:${phoneHref}?body=${encodeURIComponent(message)}`
}

function StaffIncidentDetailPage() {
  const { incidentId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  useDocumentTitle(incidentId ? `Incident #${incidentId.slice(0, 8)}` : 'Incident Detail')
  const queryClient = useQueryClient()

  const [notes, setNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [unitsCoordinated, setUnitsCoordinated] = useState([])
  const [formError, setFormError] = useState('')
  const [showResolveModal, setShowResolveModal] = useState(false)

  const { location: staffLocation } = useStaffLocation()

  const {
    data: incident = null,
    error: incidentError,
    isLoading: loading,
    refetch: refetchIncident,
  } = useQuery({
    queryKey: staffQueryKeys.incidentDetail(incidentId),
    queryFn: () =>
      api
        .get(`/api/v1/staff/incidents/${incidentId}`, { cacheTtl: 10000 })
        .then((response) => response.data?.data?.incident ?? null),
    enabled: Boolean(incidentId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && status !== 'resolved' ? 30000 : false
    },
  })

  useEffect(() => {
    if (incidentError) {
      const parsed = parseApiError(incidentError)
      toast.error(parsed.message, { id: 'staff-incident-detail-error' })
      if (parsed.status === 404) {
        navigate('/staff', { replace: true })
      }
    }
  }, [incidentError, navigate])

  const updateStatusMutation = useMutation({
    mutationFn: ({ status, fieldNotes, coordinatedUnits }) =>
      api.patch(`/api/v1/staff/incidents/${incidentId}/status`, {
        status,
        notes: fieldNotes,
        units_coordinated: coordinatedUnits,
      }),
    onSuccess: async (response) => {
      const updatedIncident = response.data?.data?.incident

      if (updatedIncident) {
        queryClient.setQueryData(staffQueryKeys.incidentDetail(incidentId), updatedIncident)
      }

      queryClient.invalidateQueries({ queryKey: ['staff', 'incidents'] })
      toast.success('Incident status updated.')
      setNotes('')
      setUnitsCoordinated([])
      await refetchIncident()
    },
    onError: (error) => {
      const parsed = parseApiError(error)
      setFormError(parsed.message)
      toast.error(parsed.message)
    },
    onSettled: () => {
      setShowResolveModal(false)
    },
  })

  const nextStatus = useMemo(() => {
    const STATUS_FLOW = {
      verified: 'under_assessment',
      under_assessment: 'responding',
      responding: 'resolved',
    }
    return STATUS_FLOW[incident?.status] ?? ''
  }, [incident?.status])

  useEffect(() => {
    setSelectedStatus(nextStatus)
  }, [nextStatus])

  useStaffRealtimeUpdates({
    userId: user?.id,
    onIncidentChange: useCallback(
      (eventName, payload) => {
        if (!payload?.incident_id || payload.incident_id === incidentId) {
          queryClient.invalidateQueries({ queryKey: staffQueryKeys.incidentDetail(incidentId) })
        }
        queryClient.invalidateQueries({ queryKey: ['staff', 'incidents'] })
      },
      [incidentId, queryClient]
    ),
    enabled: Boolean(user?.id),
  })

  const toggleUnit = useCallback((unit) => {
    setUnitsCoordinated((current) =>
      current.includes(unit) ? current.filter((item) => item !== unit) : [...current, unit],
    )
  }, [])

  const submitUpdate = useCallback(async () => {
    if (!selectedStatus) {
      setFormError('Select the next status before saving.')
      return
    }

    if (notes.trim().length < 10) {
      setFormError('Field notes must be at least 10 characters.')
      return
    }

    setFormError('')
    await updateStatusMutation.mutateAsync({
      status: selectedStatus,
      fieldNotes: notes.trim(),
      coordinatedUnits: unitsCoordinated,
    })
  }, [notes, selectedStatus, unitsCoordinated, updateStatusMutation])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()

      if (selectedStatus === 'resolved') {
        setShowResolveModal(true)
        return
      }

      await submitUpdate()
    },
    [selectedStatus, submitUpdate]
  )

  const type = getIncidentType(incident?.type)
  const TypeIcon = type.icon
  const submitting = updateStatusMutation.isPending
  const citizenPhone = incident?.reporter?.phone
    ?? incident?.reporter?.emergency_profile?.phone_number
    ?? incident?.reporter?.emergency_profile?.emergency_contact_phone
    ?? ''
  const telHref = normalizeTelHref(citizenPhone)
  const smsHref = buildCitizenSmsHref(telHref, incident)

  return (
    <div className="min-h-screen bg-panel">
      <StaffHeader />

      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 pb-8 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/staff"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-navy transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Incidents
          </Link>
          {incident && <p className="text-xs text-slate-500">Incident #{incident.id.slice(0, 8)}</p>}
        </div>

        {loading ? (
          <IncidentDetailSkeleton />
        ) : incident ? (
          <>
            <IncidentMap
              latitude={incident.latitude}
              longitude={incident.longitude}
              type={incident.type}
              status={incident.status}
              staffLocation={staffLocation}
            />

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${type.chipClass}`}
                >
                  <TypeIcon className="h-4 w-4" />
                  {type.label}
                </span>
                <StatusPill status={incident.status} />
                <span className="text-xs text-slate-500">
                  {timeAgo(incident.incident_datetime ?? incident.created_at)}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-navy">{incident.address_label}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{incident.description}</p>
              <div className="mt-4 rounded-xl bg-panel p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reporter</p>
                <p className="mt-1 text-sm font-semibold text-navy">
                  {incident.reporter?.full_name ?? 'Anonymous/IoT'}
                </p>
                {telHref ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={`tel:${telHref}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-[#bc1f34]"
                    >
                      <Phone className="h-4 w-4" />
                      Call Citizen
                    </a>
                    <a
                      href={smsHref}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-navy hover:border-info hover:text-info"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Message Citizen
                    </a>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No phone number available.</p>
                )}
                {citizenPhone && <p className="mt-2 text-xs text-slate-500">{citizenPhone}</p>}
              </div>
            </section>

            <IncidentMediaGallery media={incident.media} />
            <IncidentTimeline logs={incident.logs} />
            <ResponderTrackingPanel incident={incident} onIncidentRefresh={refetchIncident} />

            <IncidentStatusForm
              incident={incident}
              notes={notes}
              selectedStatus={selectedStatus}
              unitsCoordinated={unitsCoordinated}
              formError={formError}
              isSubmitting={submitting}
              onNotesChange={setNotes}
              onStatusChange={setSelectedStatus}
              onToggleUnit={toggleUnit}
              onSubmit={handleSubmit}
              onResolveModalOpen={() => setShowResolveModal(true)}
            />
          </>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Incident not found.
          </section>
        )}
      </main>

      <ResolveConfirmModal
        isOpen={showResolveModal}
        isSubmitting={submitting}
        onCancel={() => setShowResolveModal(false)}
        onConfirm={submitUpdate}
      />
    </div>
  )
}

export default StaffIncidentDetailPage
