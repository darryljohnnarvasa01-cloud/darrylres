import { CheckCheck, ExternalLink, Loader2, Megaphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import NotificationBell from '../components/notifications/NotificationBell'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { formatDateTime, timeAgo } from '../lib/datetime'
import { parseApiError } from '../lib/errorUtils'

function targetLabel(broadcast) {
  switch (broadcast.target_type) {
    case 'barangay':
      return broadcast.target_barangay ? `Barangay ${broadcast.target_barangay}` : 'Barangay alert'
    case 'polygon':
      return 'Geofenced alert'
    case 'all':
      return 'Citywide citizen alert'
    default:
      return 'Broadcast alert'
  }
}

function BroadcastsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true)

    try {
      const response = await api.get('/api/v1/broadcasts')
      setBroadcasts(response.data?.data?.broadcasts ?? [])
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBroadcasts()
  }, [fetchBroadcasts])

  const unreadCount = useMemo(
    () => broadcasts.filter((broadcast) => !broadcast.is_read).length,
    [broadcasts],
  )

  const markRead = async (broadcast) => {
    try {
      if (!broadcast.is_read) {
        await api.patch(`/api/v1/broadcasts/${broadcast.id}/read`)
        setBroadcasts((current) =>
          current.map((item) => (item.id === broadcast.id ? { ...item, is_read: true } : item)),
        )
      }

      if (broadcast.link) {
        if (broadcast.link.startsWith('http://') || broadcast.link.startsWith('https://')) {
          window.location.assign(broadcast.link)
        } else if (broadcast.link !== '/broadcasts') {
          navigate(broadcast.link)
        }
      }
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }

  return (
    <div className="min-h-screen bg-panel px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Citizen Alerts</p>
            <h1 className="mt-1 font-heading text-4xl italic text-navy">Broadcasts</h1>
            <p className="mt-1 text-sm text-slate-500">
              Emergency advisories sent to {user?.barangay ? `${user.barangay} residents` : 'your account'}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link
              to="/my-reports"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy"
            >
              My Reports
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Unread</p>
            <p className="mt-2 text-3xl font-semibold text-navy">{unreadCount}</p>
            <p className="mt-1 text-sm text-slate-500">Broadcasts awaiting acknowledgement.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Received</p>
            <p className="mt-2 text-3xl font-semibold text-navy">{broadcasts.length}</p>
            <p className="mt-1 text-sm text-slate-500">Latest 50 targeted alerts for your account.</p>
          </article>
        </section>

        <section className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-card">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-danger" />
              <p className="mt-2 text-sm text-slate-500">Loading broadcasts...</p>
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-card">
              <Megaphone className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-navy">No broadcasts yet</p>
              <p className="mt-1 text-sm text-slate-500">Targeted emergency advisories will appear here.</p>
            </div>
          ) : (
            broadcasts.map((broadcast) => (
              <article
                key={broadcast.id}
                className={`rounded-2xl border bg-white px-4 py-4 shadow-sm ${
                  broadcast.is_read ? 'border-slate-200' : 'border-danger/30'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        <Megaphone className="h-3.5 w-3.5" />
                        {targetLabel(broadcast)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        broadcast.is_read ? 'bg-slate-100 text-slate-600' : 'bg-danger/10 text-danger'
                      }`}>
                        {broadcast.is_read ? 'Read' : 'Unread'}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-navy">{broadcast.title}</h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{broadcast.message}</p>
                    <p className="mt-3 text-xs text-slate-500">
                      {formatDateTime(broadcast.created_at)} | {timeAgo(broadcast.created_at)}
                      {broadcast.sender_name ? ` | Sent by ${broadcast.sender_name}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => markRead(broadcast)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-navy"
                  >
                    {broadcast.is_read ? <ExternalLink className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />}
                    {broadcast.is_read ? 'Open' : 'Acknowledge'}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}

export default BroadcastsPage
