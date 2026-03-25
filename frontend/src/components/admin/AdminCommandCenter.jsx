import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPinned,
  Radio,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import IncidentHeatLayer from './IncidentHeatLayer'
import StatusPill from '../incident/StatusPill'
import { formatDateTime, timeAgo } from '../../lib/datetime'
import { getIncidentType } from '../../data/incidentTypes'

const MAP_CENTER = [7.9062, 125.0936]

const SEVERITY_STYLES = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-blue-200 bg-blue-50 text-blue-700',
}

const KPI_CARDS = [
  { key: 'active_incidents', label: 'Active Incidents', icon: Activity, tone: 'text-red-600' },
  { key: 'avg_response_minutes', label: 'Avg Response Time', icon: Clock3, tone: 'text-blue-600', suffix: ' min' },
  { key: 'resolved_today', label: 'Resolved Today', icon: CheckCircle2, tone: 'text-emerald-600' },
  { key: 'pending_assignments', label: 'Pending Assignments', icon: ShieldAlert, tone: 'text-amber-600' },
]

const EMPTY_ITEMS = []

function mapPinIcon(severity, status, isIot) {
  const color =
    {
      critical: '#DC2626',
      high: '#F97316',
      medium: '#F59E0B',
      low: '#2563EB',
    }[severity] ?? '#64748B'

  const pulse = status === 'responding' || status === 'under_assessment' || isIot ? 'pin-pulse' : ''

  return L.divIcon({
    className: 'admin-pin-wrap',
    html: `<span class="admin-pin ${pulse}" style="--pin-color:${color};"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function SeverityBadge({ severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low
      }`}
    >
      {severity}
    </span>
  )
}

function CommandCenterSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-4 h-8 w-20 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="h-[560px] animate-pulse rounded-2xl bg-slate-100" />
        </div>
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyPanel({ title, description }) {
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
      <MapPinned className="h-8 w-8 text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-navy">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function AdminCommandCenter({ data, isLoading, isValidating, error, onOpenIncident }) {
  const [mapMode, setMapMode] = useState('markers')

  const kpis = data?.kpis ?? {
    active_incidents: 0,
    avg_response_minutes: 0,
    resolved_today: 0,
    pending_assignments: 0,
    refreshed_at: null,
  }
  const mapIncidents = data?.map_incidents ?? EMPTY_ITEMS
  const liveFeed = data?.live_feed ?? EMPTY_ITEMS
  const responders = data?.responders ?? EMPTY_ITEMS

  const heatPoints = useMemo(
    () => mapIncidents
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item) => [item.latitude, item.longitude, item.severity_weight ?? 0.4]),
    [mapIncidents],
  )

  const severitySummary = useMemo(
    () => liveFeed.reduce((summary, incident) => {
      summary[incident.severity] = (summary[incident.severity] ?? 0) + 1
      return summary
    }, {}),
    [liveFeed],
  )

  if (isLoading && !data) {
    return <CommandCenterSkeleton />
  }

  return (
    <div className="space-y-5">
      {error && (
        <section className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-card">
          Command center is showing the last known state. Refresh the page if this panel does not recover.
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {KPI_CARDS.map((card, index) => {
          const Icon = card.icon
          const rawValue = kpis[card.key] ?? 0
          const displayValue = card.suffix ? `${rawValue}${card.suffix}` : rawValue

          return (
            <article
              key={card.key}
              style={{ '--card-delay': `${index * 180}ms` }}
              className="command-center-kpi-card group rounded-3xl border border-slate-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-danger/35 hover:bg-rose-50/60 hover:shadow-[0_20px_44px_rgba(127,29,29,0.12)]"
            >
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                  <p className="mt-4 text-3xl font-semibold text-navy">{displayValue}</p>
                </div>
                <span className={`command-center-kpi-card__icon rounded-2xl bg-slate-50 p-3 transition-colors duration-200 group-hover:bg-white ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="relative z-10 mt-3 text-xs text-slate-500">
                {card.key === 'pending_assignments'
                  ? 'Open cases that still need a responder.'
                  : card.key === 'active_incidents'
                    ? 'Pending, verified, assessment, and responding incidents.'
                    : card.key === 'resolved_today'
                      ? 'Incidents closed since midnight.'
                      : 'Average time to the first operational response.'}
              </p>
            </article>
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations Map</p>
              <h2 className="mt-1 text-2xl font-semibold text-navy">Command Center Map</h2>
              <p className="mt-1 text-sm text-slate-500">
                Switch between pin markers and density heat to inspect active incident pressure across Valencia City.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                {[
                  { value: 'markers', label: 'Pins' },
                  { value: 'heatmap', label: 'Heatmap' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMapMode(option.value)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      mapMode === option.value ? 'bg-white text-navy shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {isValidating ? 'Refreshing live data...' : `Updated ${timeAgo(kpis.refreshed_at)}`}
              </div>
            </div>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100">
            <div className="h-[560px]">
              <MapContainer center={MAP_CENTER} zoom={13} className="h-full w-full" scrollWheelZoom>
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {mapMode === 'heatmap' ? (
                  <IncidentHeatLayer points={heatPoints} />
                ) : (
                  mapIncidents.map((item) => (
                    <Marker
                      key={item.id}
                      position={[item.latitude, item.longitude]}
                      icon={mapPinIcon(item.severity, item.status, item.is_iot_generated)}
                      eventHandlers={
                        onOpenIncident
                          ? {
                              click: () => {
                                onOpenIncident(item.id)
                              },
                            }
                          : undefined
                      }
                    >
                      <Popup>
                        <div className="w-64 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={item.severity} />
                            <StatusPill status={item.status} />
                          </div>
                          <p className="text-sm font-semibold text-navy">{item.reference_code}</p>
                          <p className="text-sm text-slate-600">{item.barangay}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                          <button
                            type="button"
                            onClick={() => onOpenIncident(item.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
                          >
                            Open detail
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))
                )}
              </MapContainer>
            </div>

            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 grid gap-2 md:grid-cols-4">
              {['critical', 'high', 'medium', 'low'].map((level) => (
                <div key={level} className="pointer-events-auto rounded-2xl bg-white/92 px-3 py-2 shadow-lg backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <SeverityBadge severity={level} />
                    <span className="text-sm font-semibold text-navy">{severitySummary[level] ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>

            {!mapIncidents.length && (
              <div className="pointer-events-none absolute inset-0 z-10 p-6">
                <EmptyPanel title="No active incidents on the map" description="New verified or responding incidents will appear here automatically." />
              </div>
            )}
          </div>
        </article>

        <div className="space-y-5">
          <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Live Incident Feed</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Latest 10 reports</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 landing-live-dot" />
                Live
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>Updates every 30 seconds.</span>
              <a href="/admin/incidents" className="font-semibold text-info hover:underline">
                View all incidents
              </a>
            </div>

            <div className="mt-3 max-h-[356px] space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
              {liveFeed.length ? (
                liveFeed.map((incident) => {
                  const type = getIncidentType(incident.type)
                  const TypeIcon = type.icon

                  return (
                    <article key={incident.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex min-w-0 items-start gap-1.5">
                          <span className={`mt-0.5 rounded-lg p-1 ${type.chipClass}`}>
                            <TypeIcon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="max-w-[160px] truncate text-[11px] font-semibold text-navy sm:max-w-[200px]">
                                {incident.reference_code}
                              </p>
                              <SeverityBadge severity={incident.severity} />
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-600">{incident.barangay}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500">{formatDateTime(incident.created_at)}</p>
                            <p className="mt-1 hidden text-[10px] text-slate-500 sm:block">
                              {incident.assigned_responder ? `Assigned to ${incident.assigned_responder}` : 'Awaiting responder assignment'}
                            </p>
                          </div>
                        </div>
                        <Link
                          to={`/admin/incidents?incident=${incident.id}`}
                          className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-navy transition hover:border-info hover:text-info"
                        >
                          Open
                        </Link>
                      </div>
                    </article>
                  )
                })
              ) : (
                <EmptyPanel title="No incident activity yet" description="New incidents will flow into this feed as soon as they are submitted." />
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Responder Availability</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Staff readiness</h2>
              </div>
              <span className="rounded-2xl bg-slate-50 p-3 text-blue-600">
                <Users className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {responders.length ? (
                responders.map((staff) => (
                  <div key={staff.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-navy">{staff.full_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{staff.barangay || 'Barangay unavailable'}</p>
                      </div>
                      <div className="text-right">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          <span className={`h-2.5 w-2.5 rounded-full ${staff.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          {staff.status}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{staff.current_assignment_count} active assignments</p>
                      </div>
                    </div>
                    <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <Radio className="h-3.5 w-3.5" />
                      {staff.last_seen_at ? `Last activity ${timeAgo(staff.last_seen_at)}` : 'No tracked activity yet'}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyPanel title="No responders available" description="Verified staff will appear here once they have access to the staff portal." />
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}

export default AdminCommandCenter
