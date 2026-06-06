import { Activity, CloudUpload, Database, ExternalLink, HardDrive, Phone, Radio, Search, Server, ShieldCheck, UserCircle2 } from 'lucide-react'
import { createElement, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import AdminSidebar from '../../components/admin/AdminSidebar'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'

function StatusBadge({ ok, healthyLabel = 'Healthy', issueLabel = 'Issue' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
      }`}
    >
      {ok ? healthyLabel : issueLabel}
    </span>
  )
}

function MetricCard({ title, value, icon, accent = 'text-navy' }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
        {createElement(icon, { className: `h-4 w-4 ${accent}` })}
      </div>
      <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
    </article>
  )
}

function displayValue(value) {
  return value ?? 'N/A'
}

function displayIotRatio(totals) {
  const active = totals?.active_iot_devices
  const online = totals?.online_iot_devices

  if (active === null || active === undefined || online === null || online === undefined) {
    return 'N/A'
  }

  return `${online} / ${active}`
}

function AdminSystemPage() {
  const { user, logout, can } = useAuth()
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState(null)
  const [hotline, setHotline] = useState(() => localStorage.getItem('rescuelink_hotline') || '0966-123-4567')
  const [hotlineInput, setHotlineInput] = useState('')
  const [isEditingHotline, setIsEditingHotline] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)

  const handleSaveHotline = () => {
    const cleaned = hotlineInput.trim()
    if (cleaned) {
      setHotline(cleaned)
      localStorage.setItem('rescuelink_hotline', cleaned)
      toast.success('Hotline number updated successfully')
    }
    setIsEditingHotline(false)
  }

  const handleCancelEdit = () => {
    setIsEditingHotline(false)
    setHotlineInput('')
  }

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/v1/admin/system/health')
      setHealth(response.data?.data ?? null)
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const runGoogleDriveBackup = async () => {
    setBackupLoading(true)
    try {
      const response = await api.post('/api/v1/admin/system/google-drive/backup')
      const driveFile = response.data?.data?.backup?.drive_file
      toast.success(driveFile?.name ? `Backup uploaded: ${driveFile.name}` : 'Google Drive backup uploaded.')
      fetchHealth()
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setBackupLoading(false)
    }
  }

  const openGoogleDriveAuth = async () => {
    try {
      const response = await api.get('/api/v1/admin/system/google-drive/auth-url')
      const authUrl = response.data?.data?.auth_url

      if (authUrl) {
        window.open(authUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }

  useEffect(() => {
    fetchHealth()

    const timer = setInterval(() => {
      fetchHealth()
    }, 30000)

    return () => clearInterval(timer)
  }, [fetchHealth])

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />

      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
          <form
            className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-slate-200 bg-panel px-3 py-2"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="System health overview"
              readOnly
            />
          </form>

          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
              <UserCircle2 className="h-5 w-5 text-slate-500" />
              <span className="text-xs font-semibold text-navy">{user?.full_name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 pb-6 lg:px-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-4xl italic text-navy">System Health</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Real-time operational status for RescueLink services and workload.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {health?.status && (
                  <StatusBadge
                    ok={health.status === 'healthy'}
                    healthyLabel="Operational"
                    issueLabel="Degraded"
                  />
                )}
                <button
                  type="button"
                  onClick={fetchHealth}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy"
                >
                  Refresh
                </button>
              </div>
            </div>
          </section>

          {health ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-danger" />
                    <p className="text-sm font-semibold text-navy">Emergency Hotline</p>
                  </div>
                  {!isEditingHotline && (
                    <button
                      type="button"
                      onClick={() => {
                        setHotlineInput(hotline)
                        setIsEditingHotline(true)
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-navy hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingHotline ? (
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={hotlineInput}
                      onChange={(e) => setHotlineInput(e.target.value)}
                      className="form-input h-10 w-full py-1 text-sm"
                      placeholder="Enter hotline number"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveHotline}
                        className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#be2136]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-navy">{hotline}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">Displayed on the landing page for emergency calls</p>
              </section>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Total Users" value={displayValue(health.totals?.users)} icon={UserCircle2} />
                <MetricCard title="Total Incidents" value={displayValue(health.totals?.incidents)} icon={Activity} />
                <MetricCard
                  title="Open Incidents"
                  value={displayValue(health.totals?.open_incidents)}
                  icon={ShieldCheck}
                  accent="text-danger"
                />
                <MetricCard
                  title="IoT Devices (Online/Active)"
                  value={displayIotRatio(health.totals)}
                  icon={Radio}
                  accent="text-success"
                />
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy">Database</p>
                    <StatusBadge ok={Boolean(health.services?.database?.ok)} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Driver: {health.services?.database?.driver ?? '-'}</p>
                  {health.services?.database?.error && (
                    <p className="mt-2 text-xs text-danger">{health.services.database.error}</p>
                  )}
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy">Queue</p>
                    <StatusBadge ok={Boolean(health.services?.queue?.ok)} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Connection: {health.services?.queue?.connection ?? '-'}</p>
                  <p className="mt-1 text-xs text-slate-600">Pending Jobs: {displayValue(health.services?.queue?.pending_jobs)}</p>
                  <p className="mt-1 text-xs text-slate-600">Failed Jobs: {displayValue(health.services?.queue?.failed_jobs)}</p>
                  {health.services?.queue?.error && (
                    <p className="mt-2 text-xs text-danger">{health.services.queue.error}</p>
                  )}
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy">Cache</p>
                    <StatusBadge ok={Boolean(health.services?.cache?.ok)} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Store: {health.services?.cache?.store ?? '-'}</p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy">Broadcast / Realtime</p>
                    <StatusBadge ok={Boolean(health.services?.broadcast?.ok)} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Connection: {health.services?.broadcast?.connection ?? '-'}</p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy">Storage</p>
                    <StatusBadge ok={Boolean(health.services?.storage?.ok)} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Disk: {health.services?.storage?.disk ?? '-'}</p>
                  <p className="mt-1 text-xs text-slate-600 break-all">{health.services?.storage?.path ?? '-'}</p>
                  {health.services?.storage?.error && (
                    <p className="mt-2 text-xs text-danger">{health.services.storage.error}</p>
                  )}
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy">Google Drive Backup</p>
                    <StatusBadge
                      ok={Boolean(health.services?.google_drive?.ok)}
                      healthyLabel="Configured"
                      issueLabel="Needs config"
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Folder: {health.services?.google_drive?.has_backup_folder_id ? 'Configured' : 'Missing'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    OAuth: {health.services?.google_drive?.has_client_config ? 'Configured' : 'Missing'}
                  </p>
                  {can('edit-system-settings') ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runGoogleDriveBackup}
                      disabled={backupLoading}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-danger px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <CloudUpload className="h-4 w-4" />
                      {backupLoading ? 'Backing up...' : 'Run Backup'}
                    </button>
                    <button
                      type="button"
                      onClick={openGoogleDriveAuth}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-navy"
                    >
                      <ExternalLink className="h-4 w-4" />
                      OAuth URL
                    </button>
                  </div>
                  ) : null}
                </article>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <Server className="h-4 w-4" />
                  Environment: {health.environment}
                </div>
                <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
                  <Database className="h-4 w-4" />
                  Last Updated: {formatDateTime(health.timestamp)}
                </div>
                {health.totals?.error && (
                  <div className="mt-2 inline-flex items-center gap-2 text-xs text-danger">
                    <HardDrive className="h-4 w-4" />
                    Totals unavailable: {health.totals.error}
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-card">
              {loading ? 'Loading system health...' : 'No system data available.'}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default AdminSystemPage
