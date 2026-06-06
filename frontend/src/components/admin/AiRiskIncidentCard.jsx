import { AlertTriangle, Clock, MapPin, Tag, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatusPill from '../incident/StatusPill'
import { getIncidentType } from '../../data/incidentTypes'
import { timeAgo } from '../../lib/datetime'

function RiskBadge({ score }) {
  const value = Number(score ?? 0)
  const isExtreme = value >= 90
  const isHigh = value >= 80

  const bgColor = isExtreme ? 'bg-red-50' : isHigh ? 'bg-amber-50' : 'bg-orange-50'
  const borderColor = isExtreme ? 'border-red-300' : isHigh ? 'border-amber-300' : 'border-orange-300'
  const textColor = isExtreme ? 'text-red-700' : isHigh ? 'text-amber-700' : 'text-orange-700'
  const badgeColor = isExtreme ? 'bg-red-100 text-red-700' : isHigh ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} px-3 py-2`}>
      <div className={`inline-flex items-center gap-1.5 rounded-full ${badgeColor} px-2.5 py-1 text-xs font-bold`}>
        <TrendingUp className="h-3 w-3" />
        {value}/100
      </div>
      <p className={`mt-1 text-xs font-semibold ${textColor}`}>
        {isExtreme ? 'CRITICAL' : isHigh ? 'HIGH' : 'MODERATE'} RISK
      </p>
    </div>
  )
}

function AiRiskIncidentCard({ incident, selected, onSelect, onReview }) {
  const type = getIncidentType(incident.type)
  const Icon = type.icon

  const reporterName = incident.reporter?.full_name || (incident.is_guest ? 'Guest Report' : 'Unknown')
  const staffName = incident.latestAssignment?.staff?.full_name

  return (
    <article className="rounded-2xl border border-slate-200 bg-white transition-all hover:border-slate-300 hover:shadow-md">
      <div className="p-4">
        <div className="flex gap-3">
          {/* Checkbox */}
          <div className="pt-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-info focus:ring-info"
            />
          </div>

          {/* Main Content */}
          <div className="min-w-0 flex-1">
            {/* Header with Type and Status */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${type.chipClass}`}>
                <Icon className="h-3.5 w-3.5" />
                {type.label}
              </span>
              <StatusPill status={incident.status} />
              <span className="text-xs font-semibold text-slate-500">
                {incident.reference_code ?? `#${incident.id.slice(0, 8)}`}
              </span>
            </div>

            {/* Description */}
            <p className="mt-3 line-clamp-2 text-sm font-semibold text-navy">{incident.description}</p>

            {/* Location and Reporter */}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <MapPin className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                <span className="line-clamp-1">{incident.address_label}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Tag className="h-3.5 w-3.5" />
                <span>Reporter: <span className="font-medium text-slate-900">{reporterName}</span></span>
              </div>
              {staffName && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Assigned: <span className="font-medium text-slate-900">{staffName}</span></span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Clock className="h-3.5 w-3.5" />
                <span>{timeAgo(incident.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Risk Badge and Actions */}
          <div className="flex flex-col gap-3">
            <RiskBadge score={incident.ai_risk_score} />
            <Link
              to={`/admin/incidents?incident=${incident.id}`}
              onClick={(e) => onReview && onReview(e)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#bc1f34]"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Review
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

export default AiRiskIncidentCard
