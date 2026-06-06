import { Bell, CheckCheck, ExternalLink, MapPin, RefreshCw, Send, Settings2, UserCircle2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import AdminSidebar from '../../components/admin/AdminSidebar'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { VALENCIA_BARANGAYS } from '../../data/barangays'
import { api } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import {
  browserNotificationPermission,
  loadNotificationHistory,
  loadNotificationPreferences,
  markAllHistoryEntriesRead,
  markHistoryEntryRead,
  notificationHistoryStorageKey,
  notificationTypeMeta,
  NOTIFICATION_PREFERENCE_OPTIONS,
  requestBrowserNotificationPermission,
  saveNotificationPreferences,
  syncNotificationHistory,
} from '../../lib/notificationCenter'

function swrFetcher(path) {
  return api.get(path).then((response) => response.data?.data ?? {})
}

function SummaryCard({ label, value, helper, icon, accentClass = 'text-navy' }) {
  const IconComponent = icon

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-navy">{value}</p>
          {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
        </div>
        <IconComponent className={`h-5 w-5 ${accentClass}`} />
      </div>
    </article>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <p className="text-base font-semibold text-navy">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function permissionLabel(permission) {
  switch (permission) {
    case 'granted':
      return 'Enabled'
    case 'denied':
      return 'Blocked'
    case 'unsupported':
      return 'Unsupported'
    default:
      return 'Not requested'
  }
}

function AdminNotificationsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState(() => loadNotificationPreferences(user))
  const [history, setHistory] = useState(() => loadNotificationHistory(user))
  const [permission, setPermission] = useState(browserNotificationPermission())
  const [historyView, setHistoryView] = useState('all')
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    target_type: 'staff',
    target_barangay: '',
    target_polygon: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [lastBroadcast, setLastBroadcast] = useState(null)

  const {
    data: notificationsPayload,
    error: notificationsError,
    isLoading: notificationsLoading,
    mutate: mutateNotifications,
  } = useSWR('/api/v1/notifications', swrFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  })
  const { data: recipientsPayload, error: recipientsError, mutate: mutateRecipients } = useSWR(
    '/api/v1/admin/broadcast/recipients',
    swrFetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    },
  )

  useEffect(() => {
    setPreferences(loadNotificationPreferences(user))
    setHistory(loadNotificationHistory(user))
    setPermission(browserNotificationPermission())
  }, [user])

  useEffect(() => {
    if (!notificationsError) {
      return
    }

    toast.error(parseApiError(notificationsError).message, {
      id: 'admin-notifications-error',
    })
  }, [notificationsError])

  useEffect(() => {
    if (!recipientsError) {
      return
    }

    toast.error(parseApiError(recipientsError).message, {
      id: 'admin-notifications-responders-error',
    })
  }, [recipientsError])

  const notifications = useMemo(
    () => notificationsPayload?.notifications ?? [],
    [notificationsPayload],
  )
  const onlineResponders = useMemo(
    () => recipientsPayload?.recipients ?? [],
    [recipientsPayload],
  )

  useEffect(() => {
    if (!notifications.length) {
      return
    }

    setHistory(syncNotificationHistory(user, notifications))
  }, [notifications, user])

  useEffect(() => {
    const storageKey = notificationHistoryStorageKey(user)

    const handleStorage = (event) => {
      if (event.key === storageKey) {
        setHistory(loadNotificationHistory(user))
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [user])

  useEffect(() => {
    const echo = window?.Echo

    if (!echo) {
      return undefined
    }

    const channel = echo.private('admin.notifications')
    channel.listen('.NotificationCreated', () => {
      mutateNotifications()
    })

    return () => echo.leave('private-admin.notifications')
  }, [mutateNotifications])

  const enabledTriggersCount = useMemo(
    () => Object.values(preferences).filter(Boolean).length,
    [preferences],
  )
  const unreadServerCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  )
  const visibleHistory = useMemo(
    () => (historyView === 'unread' ? history.filter((item) => !item.is_read) : history),
    [history, historyView],
  )

  const handlePreferenceToggle = (key) => {
    setPreferences((current) => {
      const nextPreferences = {
        ...current,
        [key]: !current[key],
      }

      saveNotificationPreferences(user, nextPreferences)
      return nextPreferences
    })
  }

  const handlePermissionRequest = async () => {
    const result = await requestBrowserNotificationPermission()
    setPermission(result)

    if (result === 'granted') {
      toast.success('Browser notifications enabled.')
      return
    }

    if (result === 'denied') {
      toast.error('Browser notifications were blocked by the browser.')
      return
    }

    toast.error('Browser notifications are not supported in this environment.')
  }

  const handleBroadcast = async (event) => {
    event.preventDefault()

    let targetPolygon = null

    if (broadcastForm.target_type === 'polygon') {
      try {
        targetPolygon = JSON.parse(broadcastForm.target_polygon)
      } catch {
        toast.error('Enter a valid polygon JSON array before sending.')
        return
      }
    }

    setSubmitting(true)

    try {
      const requestPayload = {
        title: broadcastForm.title.trim(),
        message: broadcastForm.message.trim(),
        target_type: broadcastForm.target_type,
      }

      if (broadcastForm.target_type === 'barangay') {
        requestPayload.target_barangay = broadcastForm.target_barangay
      }

      if (broadcastForm.target_type === 'polygon') {
        requestPayload.target_polygon = targetPolygon
      }

      const response = await api.post('/api/v1/admin/broadcast', requestPayload)

      const responsePayload = response.data?.data ?? null
      setLastBroadcast(responsePayload)
      setBroadcastForm({
        title: '',
        message: '',
        target_type: 'staff',
        target_barangay: '',
        target_polygon: '',
      })
      toast.success(responsePayload?.recipients_count ? 'Broadcast sent successfully.' : 'No matching recipients received the broadcast.')
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    } finally {
      setSubmitting(false)
    }
  }

  const markAllRead = async () => {
    try {
      await api.patch('/api/v1/notifications/read-all')
      setHistory(markAllHistoryEntriesRead(user))
      await mutateNotifications()
      toast.success('Notification history marked as read.')
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    }
  }

  const openHistoryItem = async (item) => {
    try {
      if (item.id && !item.is_read) {
        await api.patch(`/api/v1/notifications/${item.id}/read`)
      }

      setHistory(markHistoryEntryRead(user, item.id ?? item.local_id))
      await mutateNotifications()

      if (item.link) {
        if (item.link.startsWith('http://') || item.link.startsWith('https://')) {
          window.location.assign(item.link)
        } else {
          navigate(item.link)
        }
      }
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    }
  }

  const broadcastTargetReady = useMemo(() => {
    if (broadcastForm.target_type === 'barangay') {
      return Boolean(broadcastForm.target_barangay)
    }

    if (broadcastForm.target_type === 'polygon') {
      return broadcastForm.target_polygon.trim().length > 0
    }

    return true
  }, [broadcastForm.target_barangay, broadcastForm.target_polygon, broadcastForm.target_type])

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />
      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Notification Control</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Admin notification center</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Manage browser alert rules, broadcast announcements to online staff, and review the last 50 notification events stored on this workstation.
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <NotificationBell />
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
                <UserCircle2 className="h-5 w-5 text-slate-500" />
                <span className="text-xs font-semibold text-navy">{user?.full_name?.split(' ')[0]}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 pb-6 lg:px-6">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Browser Alerts"
              value={permissionLabel(permission)}
              helper="Permission state for native browser notifications."
              icon={Bell}
              accentClass={permission === 'granted' ? 'text-emerald-600' : 'text-amber-500'}
            />
            <SummaryCard
              label="Enabled Triggers"
              value={`${enabledTriggersCount}/${NOTIFICATION_PREFERENCE_OPTIONS.length}`}
              helper="Realtime browser alert categories currently allowed."
              icon={Settings2}
              accentClass="text-info"
            />
            <SummaryCard
              label="Unread Server Items"
              value={unreadServerCount}
              helper="Unread notifications still pending on the backend feed."
              icon={CheckCheck}
              accentClass="text-danger"
            />
            <SummaryCard
              label="Online Staff"
              value={onlineResponders.length}
              helper="Responders currently active based on recent token activity."
              icon={Users}
              accentClass="text-emerald-600"
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Preferences</p>
                  <h2 className="mt-1 text-xl font-semibold text-navy">Browser notification triggers</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Preferences are stored locally per admin session on this browser.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePermissionRequest}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-navy"
                >
                  {permission === 'granted' ? 'Refresh Permission' : 'Enable Browser Alerts'}
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-panel p-4">
                <p className="text-sm font-semibold text-navy">Browser status: {permissionLabel(permission)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Native alerts will only fire when permission is granted and the matching event type is enabled below.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {NOTIFICATION_PREFERENCE_OPTIONS.map((option) => (
                  <div
                    key={option.key}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-navy">{option.label}</p>
                      <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePreferenceToggle(option.key)}
                      className={`inline-flex min-w-[84px] items-center justify-center rounded-full px-3 py-2 text-xs font-semibold ${
                        preferences[option.key]
                          ? 'bg-info text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {preferences[option.key] ? 'Enabled' : 'Muted'}
                    </button>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Broadcast Tool</p>
                  <h2 className="mt-1 text-xl font-semibold text-navy">Send a targeted broadcast alert</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Messages can go to online staff or verified citizens filtered by barangay or geofence.
                  </p>
                </div>
                <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">
                  {onlineResponders.length} online recipients
                </div>
              </div>

              <form onSubmit={handleBroadcast} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy">Announcement Title</label>
                  <input
                    type="text"
                    value={broadcastForm.title}
                    onChange={(event) =>
                      setBroadcastForm((current) => ({ ...current, title: event.target.value }))
                    }
                    className="form-input"
                    maxLength={120}
                    placeholder="Road closure advisory"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy">Message</label>
                  <textarea
                    value={broadcastForm.message}
                    onChange={(event) =>
                      setBroadcastForm((current) => ({ ...current, message: event.target.value }))
                    }
                    className="form-input min-h-32 resize-none"
                    maxLength={500}
                    placeholder="Proceed to your assigned staging area and await dispatch confirmation."
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-navy">Target</label>
                    <select
                      value={broadcastForm.target_type}
                      onChange={(event) =>
                        setBroadcastForm((current) => ({
                          ...current,
                          target_type: event.target.value,
                          target_barangay: '',
                          target_polygon: '',
                        }))
                      }
                      className="form-input"
                    >
                      <option value="staff">Online staff</option>
                      <option value="all">All verified citizens</option>
                      <option value="barangay">Citizens by barangay</option>
                      <option value="polygon">Citizens in geofence</option>
                    </select>
                  </div>

                  {broadcastForm.target_type === 'barangay' ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-navy">Barangay</label>
                      <select
                        value={broadcastForm.target_barangay}
                        onChange={(event) =>
                          setBroadcastForm((current) => ({ ...current, target_barangay: event.target.value }))
                        }
                        className="form-input"
                      >
                        <option value="">Select barangay</option>
                        {VALENCIA_BARANGAYS.map((barangay) => (
                          <option key={barangay} value={barangay}>{barangay}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                {broadcastForm.target_type === 'polygon' ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-navy">Geofence Polygon JSON</label>
                    <textarea
                      value={broadcastForm.target_polygon}
                      onChange={(event) =>
                        setBroadcastForm((current) => ({ ...current, target_polygon: event.target.value }))
                      }
                      className="form-input min-h-28 resize-none font-mono text-xs"
                      placeholder='[{"lat":7.9042,"lng":125.0929},{"lat":7.9098,"lng":125.1012},{"lat":7.8991,"lng":125.1044}]'
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      Citizens are matched by the latest incident location they reported inside this polygon.
                    </p>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-navy">Recipient preview</p>
                    <button
                      type="button"
                      onClick={() => {
                        mutateNotifications()
                        mutateRecipients()
                      }}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-info"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh feeds
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {broadcastForm.target_type === 'staff' && onlineResponders.length ? (
                      onlineResponders.slice(0, 8).map((responder) => (
                        <span
                          key={responder.id}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          {responder.full_name}
                        </span>
                      ))
                    ) : broadcastForm.target_type === 'staff' ? (
                      <p className="text-sm text-slate-500">
                        No staff are currently marked online, so a staff broadcast would not be delivered right now.
                      </p>
                    ) : (
                      <div className="flex items-start gap-2 text-sm text-slate-500">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                        <p>
                          Matching citizens are calculated on send using the selected target.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={
                      submitting
                      || broadcastForm.title.trim().length < 4
                      || broadcastForm.message.trim().length < 10
                      || !broadcastTargetReady
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? 'Sending...' : 'Send Broadcast'}
                  </button>
                </div>
              </form>

              {lastBroadcast ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-navy">{lastBroadcast.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{lastBroadcast.message}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Sent {timeAgo(lastBroadcast.sent_at)} to {lastBroadcast.recipients_count} matching recipients.
                  </p>
                </div>
              ) : null}
            </article>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">History Log</p>
                <h2 className="mt-1 text-xl font-semibold text-navy">Last 50 local notifications</h2>
                <p className="mt-1 text-sm text-slate-500">
                  This log is stored in localStorage so browser reads persist on this workstation.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 p-1">
                  {['all', 'unread'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setHistoryView(option)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        historyView === option ? 'bg-navy text-white' : 'text-slate-600'
                      }`}
                    >
                      {option === 'all' ? 'All' : 'Unread'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-navy"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              </div>
            </div>

            <div className="mt-4">
              {notificationsLoading && history.length === 0 ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-3xl bg-slate-100" />
                  ))}
                </div>
              ) : visibleHistory.length ? (
                <div className="space-y-3">
                  {visibleHistory.map((item) => {
                    const typeMeta = notificationTypeMeta(item.type)

                    return (
                      <article
                        key={item.id ?? item.local_id}
                        className={`rounded-3xl border px-4 py-4 ${
                          item.is_read
                            ? 'border-slate-200 bg-white'
                            : 'border-danger/20 bg-danger/5'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${typeMeta.badgeClass}`}>
                                {typeMeta.label}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                item.is_read ? 'bg-slate-100 text-slate-600' : 'bg-info/10 text-info'
                              }`}>
                                {item.is_read ? 'Read' : 'Unread'}
                              </span>
                            </div>
                            <p className="mt-3 text-base font-semibold text-navy">{item.title}</p>
                            <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                            <p className="mt-3 text-xs text-slate-500">
                              {formatDateTime(item.created_at)} | {timeAgo(item.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openHistoryItem(item)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-navy"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {item.link ? 'Open' : 'Mark read'}
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No notifications in local history"
                  description="Incoming notifications will appear here once the admin session receives realtime or fetched updates."
                />
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default AdminNotificationsPage
