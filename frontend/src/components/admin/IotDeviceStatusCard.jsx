import { Link2, MapPinned, ShieldAlert } from 'lucide-react'
import { getIncidentType } from '../../data/incidentTypes'
import { formatDateTime, timeAgo } from '../../lib/datetime'
import { formatBattery, statusConfig } from '../../lib/iotMonitoring'

function IotDeviceStatusCard({
  device,
  selected,
  possibleMatch,
  onSelect,
  onOpenIncident,
  canManageIncidents = true,
}) {
  const DeviceIcon = getIncidentType('fire').icon
  const status = statusConfig(device.status)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-3xl border bg-white p-4 text-left shadow-card transition ${
        selected ? 'border-navy ring-2 ring-navy/10' : status.cardClass
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{device.device_id}</p>
          <h3 className="mt-2 text-lg font-semibold text-navy">{device.location_name}</h3>
          <p className="mt-1 text-sm text-slate-500">Threshold {device.smoke_threshold} ppm</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.badgeClass}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-panel p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Last Ping</p>
          <p className="mt-2 text-sm font-semibold text-navy">{device.last_ping_at ? timeAgo(device.last_ping_at) : 'Never'}</p>
          <p className="mt-1 text-xs text-slate-500">{device.last_ping_at ? formatDateTime(device.last_ping_at) : 'No heartbeat recorded yet.'}</p>
        </div>
        <div className="rounded-2xl bg-panel p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Battery</p>
          <p className="mt-2 text-sm font-semibold text-navy">{formatBattery(device.battery_level)}</p>
          <p className="mt-1 text-xs text-slate-500">No battery telemetry is stored in the current firmware payload.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
          {device.recent_alert_count} alerts in 7 days
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          <MapPinned className="h-3.5 w-3.5 text-slate-400" />
          {Number(device.latitude).toFixed(4)}, {Number(device.longitude).toFixed(4)}
        </span>
      </div>

      {device.open_alert_incident ? (
        <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-danger">
                <DeviceIcon className="h-3.5 w-3.5" />
                Active smoke alert
              </p>
              <p className="mt-2 text-sm font-semibold text-navy">
                {device.open_alert_incident.reference_code ?? device.open_alert_incident.id}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Triggered {timeAgo(device.open_alert_incident.created_at)} | {device.open_alert_incident.address_label}
              </p>
            </div>
            {canManageIncidents ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenIncident(device.open_alert_incident.id)
                }}
                className="rounded-xl border border-danger/20 bg-white px-3 py-2 text-xs font-semibold text-danger"
              >
                Open alert
              </button>
            ) : null}
          </div>

          {possibleMatch && canManageIncidents ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    <Link2 className="h-3.5 w-3.5" />
                    Possible Match
                  </p>
                  <p className="mt-2 text-sm font-semibold text-navy">
                    {possibleMatch.reference_code ?? possibleMatch.id}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {possibleMatch.address_label} | {Math.round(possibleMatch.distanceMeters)} m away
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenIncident(possibleMatch.id)
                  }}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700"
                >
                  Open incident
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

export default IotDeviceStatusCard
