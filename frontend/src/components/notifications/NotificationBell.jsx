import { Bell, CheckCheck, CheckCircle2, Megaphone, Siren, TriangleAlert, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import {
  appendNotificationHistory,
  classifyNotificationEntry,
  markAllHistoryEntriesRead,
  markHistoryEntryRead,
  maybeShowBrowserNotification,
  syncNotificationHistory,
} from '../../lib/notificationCenter'

function iconForNotification(notification) {
  switch (classifyNotificationEntry(notification)) {
    case 'new_registration':
      return UserPlus
    case 'iot_alert':
      return Siren
    case 'responder_status_change':
      return CheckCircle2
    case 'broadcast_message':
      return Megaphone
    default:
      return TriangleAlert
  }
}

function channelForRole(role, userId) {
  if (!role || !userId) {
    return null
  }

  if (role === 'admin') {
    return 'admin.notifications'
  }

  if (role === 'staff') {
    return `staff.${userId}`
  }

  return `incidents.${userId}`
}

function NotificationBell({ size = 'md', align = 'right' }) {
  const { role, user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await api.get('/api/v1/notifications/unread-count')
      setUnreadCount(response.data?.data?.count ?? 0)
    } catch {
      // Ignore unread-count polling errors and keep current badge value.
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/v1/notifications')
      const nextNotifications = response.data?.data?.notifications ?? []
      setNotifications(nextNotifications)
      syncNotificationHistory(user, nextNotifications)
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchUnreadCount()
    fetchNotifications()
  }, [fetchNotifications, fetchUnreadCount])

  useEffect(() => {
    const echo = window?.Echo
    const channelName = channelForRole(role, user?.id)

    if (!echo || !channelName) {
      return undefined
    }

    const channel = echo.private(channelName)
    channel.listen('.NotificationCreated', (payload) => {
      appendNotificationHistory(user, payload)
      maybeShowBrowserNotification(user, payload)
      fetchUnreadCount()
      fetchNotifications()
    })
    channel.listen('.BroadcastAnnouncement', (payload) => {
      if (role === 'staff') {
        toast.success(payload?.title ?? 'Broadcast announcement received.')
      }

      fetchUnreadCount()
      fetchNotifications()
    })

    return () => {
      echo.leave(`private-${channelName}`)
    }
  }, [fetchNotifications, fetchUnreadCount, role, user, user?.id])

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const markAllAsRead = async () => {
    try {
      await api.patch('/api/v1/notifications/read-all')
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
      markAllHistoryEntriesRead(user)
      toast.success('All notifications marked as read.')
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }

  const openNotification = async (notification) => {
    try {
      if (!notification.is_read) {
        await api.patch(`/api/v1/notifications/${notification.id}/read`)
      }

      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
      )
      setUnreadCount((prev) => Math.max(0, prev - (notification.is_read ? 0 : 1)))
      markHistoryEntryRead(user, notification.id)
      setOpen(false)

      if (notification.link) {
        if (notification.link.startsWith('http://') || notification.link.startsWith('https://')) {
          window.location.assign(notification.link)
        } else {
          navigate(notification.link)
        }
      }
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      ),
    [notifications],
  )

  const buttonPadding = size === 'sm' ? 'p-1.5' : 'p-2'
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const badgeSize = size === 'sm' ? 'h-4 min-w-4 text-[9px]' : 'h-5 min-w-5 text-[10px]'
  const panelTop = size === 'sm' ? 'top-10' : 'top-11'
  const panelWidth = size === 'sm' ? 'w-[300px]' : 'w-[330px]'
  const panelAlign = align === 'left' ? 'left-0' : 'right-0'

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative rounded-xl border border-slate-200 text-slate-600 ${buttonPadding}`}
      >
        <Bell className={iconSize} />
        {unreadCount > 0 && (
          <span className={`absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full bg-danger px-1 font-semibold text-white ${badgeSize}`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card ${panelAlign} ${panelTop} ${panelWidth}`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-navy">Notifications</p>
            <button
              type="button"
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-sm text-slate-500">Loading notifications...</p>
            ) : sortedNotifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">No notifications yet.</div>
            ) : (
              sortedNotifications.map((notification) => {
                const Icon = iconForNotification(notification)

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => openNotification(notification)}
                    className="w-full border-b border-slate-100 px-3 py-3 text-left hover:bg-panel"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-navy">{notification.title}</p>
                          {!notification.is_read && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-info" />
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{notification.message}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{timeAgo(notification.created_at)}</p>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
