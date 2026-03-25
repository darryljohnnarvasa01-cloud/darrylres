import { format, formatDistanceToNow } from 'date-fns'

export function timeAgo(value) {
  if (!value) {
    return 'Unknown time'
  }

  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

export function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  return format(new Date(value), 'PPP p')
}

export function nowForDateTimeLocal() {
  const now = new Date()
  const timezoneAdjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return timezoneAdjusted.toISOString().slice(0, 16)
}

export function serializeDateTimeLocal(value) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toISOString()
}
