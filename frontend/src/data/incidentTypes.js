import { ActivitySquare, CarFront, Droplets, Flame, HeartPulse, ShieldAlert } from 'lucide-react'

export const INCIDENT_TYPES = [
  {
    value: 'fire',
    label: 'Fire',
    icon: Flame,
    chipClass: 'bg-danger/15 text-danger border-danger/30',
  },
  {
    value: 'medical',
    label: 'Medical',
    icon: HeartPulse,
    chipClass: 'bg-info/15 text-info border-info/30',
  },
  {
    value: 'crime',
    label: 'Crime',
    icon: ShieldAlert,
    chipClass: 'bg-violet-100 text-violet-700 border-violet-300',
  },
  {
    value: 'flood',
    label: 'Flood',
    icon: Droplets,
    chipClass: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  },
  {
    value: 'accident',
    label: 'Accident',
    icon: CarFront,
    chipClass: 'bg-orange-100 text-orange-700 border-orange-300',
  },
  {
    value: 'other',
    label: 'Other',
    icon: ActivitySquare,
    chipClass: 'bg-slate-200 text-slate-700 border-slate-300',
  },
]

export function getIncidentType(type) {
  return INCIDENT_TYPES.find((item) => item.value === type) ?? INCIDENT_TYPES[5]
}
