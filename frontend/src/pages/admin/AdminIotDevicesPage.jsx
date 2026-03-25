import {
  Activity,
  ArrowUpDown,
  Copy,
  Gauge,
  Link2,
  Plus,
  Radio,
  Trash2,
  UserCircle2,
  X,
} from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CircleMarker, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import useSWR from 'swr'
import AdminEmptyState from '../../components/admin/AdminEmptyState'
import AdminSearchField from '../../components/admin/AdminSearchField'
import AdminSkeletonRows from '../../components/admin/AdminSkeletonRows'
import IncidentDetailDrawer from '../../components/admin/IncidentDetailDrawer'
import AdminSidebar from '../../components/admin/AdminSidebar'
import IotDeviceStatusCard from '../../components/admin/IotDeviceStatusCard'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/datetime'
import { parseApiError } from '../../lib/errorUtils'
import {
  buildHistorySeries,
  buildPossibleMatches,
  formatBattery,
  HISTORY_DAYS,
  statusConfig,
} from '../../lib/iotMonitoring'

const MAP_CENTER = [7.9062, 125.0936]

const VALENCIA_CITY_BOUNDARY = [
  [7.9980, 125.0150],
  [7.9950, 125.0600],
  [7.9900, 125.1050],
  [7.9750, 125.1400],
  [7.9550, 125.1650],
  [7.9300, 125.1750],
  [7.9000, 125.1700],
  [7.8700, 125.1600],
  [7.8450, 125.1450],
  [7.8250, 125.1200],
  [7.8200, 125.0900],
  [7.8250, 125.0550],
  [7.8350, 125.0250],
  [7.8550, 124.9950],
  [7.8800, 124.9750],
  [7.9100, 124.9600],
  [7.9450, 124.9650],
  [7.9700, 124.9800],
  [7.9900, 124.9950],
  [7.9980, 125.0150],
]

function swrFetcher(path) {
  return api.get(path).then((response) => response.data?.data ?? {})
}

function MapClickPicker({ onPick }) {
  useMapEvents({
    click: (event) => {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })

  return null
}

function emptyForm() {
  return {
    device_id: '',
    location_name: '',
    latitude: MAP_CENTER[0],
    longitude: MAP_CENTER[1],
    smoke_threshold: 300,
  }
}

function SummaryCard({ label, value, helper, icon, accentClass = 'text-navy' }) {
  const IconComponent = icon

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-navy">{value}</p>
          {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
        </div>
        <IconComponent className={`h-5 w-5 ${accentClass}`} />
      </div>
    </article>
  )
}

function SortableHeader({ label, sortKey, currentSort, onToggle }) {
  const active = currentSort.key === sortKey

  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] ${
        active ? 'text-navy' : 'text-slate-500'
      }`}
    >
      {label}
      <ArrowUpDown className={`h-3.5 w-3.5 transition ${active && currentSort.direction === 'asc' ? 'rotate-180' : ''}`} />
    </button>
  )
}

function AdminIotDevicesPage() {
  const { user, logout, can } = useAuth()
  const canManageIncidents = can('manage-incidents')
  const [searchInput, setSearchInput] = useState('')
  const deferredSearch = useDeferredValue(searchInput)
  const [sortConfig, setSortConfig] = useState({ key: 'device_id', direction: 'asc' })
  const [drafts, setDrafts] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiKeyModal, setApiKeyModal] = useState('')
  const [apiKeyDeviceId, setApiKeyDeviceId] = useState('')
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [drawerIncident, setDrawerIncident] = useState(null)
  const [drawerRelatedIncidents, setDrawerRelatedIncidents] = useState([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  const { data, error, isLoading, isValidating, mutate } = useSWR('/api/v1/admin/iot-devices', swrFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  })
  const { data: staffPayload } = useSWR(canManageIncidents ? '/api/v1/admin/staff' : null, swrFetcher, {
    revalidateOnFocus: false,
  })

  useEffect(() => {
    if (!error) {
      return
    }

    toast.error(parseApiError(error).message, {
      id: 'iot-device-error',
    })
  }, [error])

  const devices = useMemo(() => data?.devices ?? [], [data])
  const activeIncidents = useMemo(() => data?.active_incidents ?? [], [data])
  const historyWindowDays = data?.history_window_days ?? HISTORY_DAYS
  const staff = useMemo(() => staffPayload?.staff ?? [], [staffPayload])

  const filteredDevices = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()

    if (!keyword) {
      return devices
    }

    return devices.filter((device) =>
      [device.device_id, device.location_name, device.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    )
  }, [deferredSearch, devices])

  const sortedDevices = useMemo(() => {
    const nextDevices = [...filteredDevices]
    const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1

    nextDevices.sort((left, right) => {
      if (sortConfig.key === 'last_ping_at') {
        return ((new Date(left.last_ping_at ?? 0)).getTime() - (new Date(right.last_ping_at ?? 0)).getTime()) * directionMultiplier
      }

      if (sortConfig.key === 'smoke_threshold') {
        return (Number(left.smoke_threshold ?? 0) - Number(right.smoke_threshold ?? 0)) * directionMultiplier
      }

      return String(left[sortConfig.key] ?? '').localeCompare(String(right[sortConfig.key] ?? '')) * directionMultiplier
    })

    return nextDevices
  }, [filteredDevices, sortConfig.direction, sortConfig.key])

  const possibleMatches = useMemo(() => buildPossibleMatches(devices, activeIncidents), [activeIncidents, devices])

  const selectedDevice = useMemo(() => {
    const pool = filteredDevices.length ? filteredDevices : devices

    return pool.find((device) => device.id === selectedDeviceId) ?? pool[0] ?? null
  }, [devices, filteredDevices, selectedDeviceId])

  const handleSort = (sortKey) => {
    setSortConfig((current) => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const selectedHistorySeries = useMemo(
    () => buildHistorySeries(selectedDevice, historyWindowDays),
    [historyWindowDays, selectedDevice],
  )

  const summary = useMemo(() => ({
    onlineDevices: devices.filter((device) => device.status === 'online').length,
    alertingDevices: devices.filter((device) => device.status === 'alert').length,
    alertsLastWindow: devices.reduce((total, device) => total + Number(device.recent_alert_count ?? 0), 0),
    possibleMatchCount: Object.values(possibleMatches).filter(Boolean).length,
  }), [devices, possibleMatches])

  const openIncident = useCallback(async (incidentId) => {
    setDrawerLoading(true)
    setDrawerIncident(null)
    setDrawerRelatedIncidents([])

    try {
      const response = await api.get(`/api/v1/admin/incidents/${incidentId}`)
      setDrawerIncident(response.data?.data?.incident ?? null)
      setDrawerRelatedIncidents(response.data?.data?.related_incidents ?? [])
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    } finally {
      setDrawerLoading(false)
    }
  }, [])

  const handleVerify = useCallback(async (incidentId, staffId) => {
    try {
      await api.patch(`/api/v1/admin/incidents/${incidentId}/verify`, {
        assigned_staff_id: staffId,
      })
      toast.success('Incident verified and assigned.')
      await Promise.all([openIncident(incidentId), mutate()])
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    }
  }, [mutate, openIncident])

  const handleReject = useCallback(async (incidentId, rejectionReason) => {
    try {
      await api.patch(`/api/v1/admin/incidents/${incidentId}/reject`, {
        rejection_reason: rejectionReason,
      })
      toast.success('Incident rejected.')
      await Promise.all([openIncident(incidentId), mutate()])
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    }
  }, [mutate, openIncident])

  useEffect(() => {
    const echo = window?.Echo

    if (!echo) {
      return undefined
    }

    const channel = echo.private('admin.alerts')
    const revalidate = () => mutate()

    channel.listen('.IotSmokeAlert', (event) => {
      toast.error(`SMOKE ALERT: ${event.location_name ?? 'Unknown location'} (${event.smoke_level ?? '-'} ppm)`, {
        position: 'bottom-right',
        duration: 5000,
      })
      revalidate()
    })
    channel.listen('.NewIncidentSubmitted', revalidate)
    channel.listen('.IncidentStatusUpdated', revalidate)

    return () => echo.leave('private-admin.alerts')
  }, [mutate])

  const updateDevice = async (deviceId, payload, successMessage) => {
    try {
      await api.patch(`/api/v1/admin/iot-devices/${deviceId}`, payload)
      setDrafts((current) => {
        const next = { ...current }
        delete next[deviceId]
        return next
      })
      toast.success(successMessage)
      await mutate()
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    }
  }

  const deleteDevice = async (deviceId) => {
    if (!window.confirm('Delete this IoT device?')) {
      return
    }

    try {
      await api.delete(`/api/v1/admin/iot-devices/${deviceId}`)
      setDrafts((current) => {
        const next = { ...current }
        delete next[deviceId]
        return next
      })
      toast.success('Device deleted.')
      await mutate()
    } catch (requestError) {
      toast.error(parseApiError(requestError).message)
    }
  }

  const createDevice = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setFormErrors({})

    try {
      const response = await api.post('/api/v1/admin/iot-devices', {
        device_id: addForm.device_id.trim(),
        location_name: addForm.location_name.trim(),
        latitude: Number(addForm.latitude),
        longitude: Number(addForm.longitude),
        smoke_threshold: Number(addForm.smoke_threshold),
      })

      const createdDeviceId = response.data?.data?.device?.device_id ?? addForm.device_id.trim()

      setShowAddModal(false)
      setAddForm(emptyForm())
      setApiKeyDeviceId(createdDeviceId)
      setApiKeyModal(response.data?.data?.api_key ?? '')
      toast.success('IoT device added.')
      await mutate()
    } catch (requestError) {
      const parsed = parseApiError(requestError)
      setFormErrors(parsed.fields)
      toast.error(parsed.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />
      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">IoT Monitoring</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Smoke alert operations</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Monitor live smoke sensors, recent alert density, and nearby active incidents without leaving the IoT workspace.</p>
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
            <SummaryCard label="Online Devices" value={summary.onlineDevices} helper="Heartbeat received within the last 15 minutes." icon={Radio} accentClass="text-emerald-600" />
            <SummaryCard label="Alerting Devices" value={summary.alertingDevices} helper="Devices tied to unresolved IoT-generated incidents." icon={Activity} accentClass="text-danger" />
            <SummaryCard label="Alerts In 7 Days" value={summary.alertsLastWindow} helper="IoT-generated fire incidents in the current history window." icon={Gauge} accentClass="text-amber-500" />
            <SummaryCard label="Possible Matches" value={summary.possibleMatchCount} helper="Alert devices with another active incident within 200 meters." icon={Link2} accentClass="text-info" />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-3">
              <AdminSearchField
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search device ID, location, or status..."
                className="w-full sm:w-[340px]"
              />
              <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">{filteredDevices.length} devices</div>
              <div className="ml-auto flex items-center gap-3">
                <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">{isValidating ? 'Refreshing live feed...' : 'Realtime via Echo + 30s polling'}</div>
                <button type="button" onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white">
                  <Plus className="h-4 w-4" />
                  Add Device
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Device Status Grid</p>
              <h2 className="mt-1 text-xl font-semibold text-navy">Operational status by sensor</h2>
              <p className="mt-1 text-sm text-slate-500">Cards pulse red whenever a device currently has an unresolved IoT-generated smoke alert.</p>
            </div>
            <div className="mt-4">
              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-60 animate-pulse rounded-3xl bg-slate-100" />)}
                </div>
              ) : filteredDevices.length ? (
                <div className="grid gap-4 xl:grid-cols-3">
                  {filteredDevices.map((device) => (
                    <IotDeviceStatusCard
                      key={device.id}
                      device={device}
                      selected={selectedDevice?.id === device.id}
                      possibleMatch={possibleMatches[device.id]}
                      onSelect={() => setSelectedDeviceId(device.id)}
                      onOpenIncident={openIncident}
                      canManageIncidents={canManageIncidents}
                    />
                  ))}
                </div>
              ) : (
                <AdminEmptyState title="No IoT devices match the current search" description="Adjust the search term or add a new smoke sensor to populate the monitoring grid." />
              )}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Alert History Chart</p>
                  <h2 className="mt-1 text-xl font-semibold text-navy">{selectedDevice ? `${selectedDevice.device_id} over the last ${historyWindowDays} days` : 'Select a device'}</h2>
                </div>
                {selectedDevice ? <div className="rounded-xl bg-panel px-3 py-2 text-xs text-slate-500">{selectedDevice.recent_alert_count} alerts recorded</div> : null}
              </div>
              <div className="mt-4">
                {selectedDevice ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={selectedHistorySeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip formatter={(value) => [`${value} alerts`, 'Triggered']} labelFormatter={(value, payload) => payload?.[0]?.payload?.date ?? value} />
                      <Bar dataKey="alerts" fill="#DC2626" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <AdminEmptyState title="Select a device from the grid" description="The per-device alert chart appears once a sensor card is selected." />
                )}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Alert Context</p>
                  <h2 className="mt-1 text-xl font-semibold text-navy">Current smoke incident view</h2>
                </div>
                {selectedDevice ? <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusConfig(selectedDevice.status).badgeClass}`}>{statusConfig(selectedDevice.status).label}</span> : null}
              </div>

              <div className="mt-4 space-y-3">
                {selectedDevice ? (
                  <>
                    <div className="rounded-2xl bg-panel p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Selected Sensor</p>
                      <p className="mt-2 text-lg font-semibold text-navy">{selectedDevice.location_name}</p>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <p>Device ID: <span className="font-semibold text-navy">{selectedDevice.device_id}</span></p>
                        <p>Battery: <span className="font-semibold text-navy">{formatBattery(selectedDevice.battery_level)}</span></p>
                        <p>Last Ping: <span className="font-semibold text-navy">{selectedDevice.last_ping_at ? timeAgo(selectedDevice.last_ping_at) : 'Never'}</span></p>
                        <p>Threshold: <span className="font-semibold text-navy">{selectedDevice.smoke_threshold} ppm</span></p>
                      </div>
                    </div>

                    {selectedDevice.open_alert_incident ? (
                      <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-danger">Open Alert Incident</p>
                        <p className="mt-2 text-sm font-semibold text-navy">{selectedDevice.open_alert_incident.reference_code ?? selectedDevice.open_alert_incident.id}</p>
                        <p className="mt-1 text-xs text-slate-500">{selectedDevice.open_alert_incident.address_label} | {formatDateTime(selectedDevice.open_alert_incident.created_at)}</p>
                        {canManageIncidents ? (
                          <button type="button" onClick={() => openIncident(selectedDevice.open_alert_incident.id)} className="mt-3 rounded-xl border border-danger/20 bg-white px-3 py-2 text-xs font-semibold text-danger">Open incident</button>
                        ) : null}
                      </div>
                    ) : (
                      <AdminEmptyState title="No open smoke alert" description="This device has no unresolved IoT-generated fire incident right now." />
                    )}

                    {possibleMatches[selectedDevice.id] && canManageIncidents ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Possible Match</p>
                        <p className="mt-2 text-sm font-semibold text-navy">{possibleMatches[selectedDevice.id].reference_code ?? possibleMatches[selectedDevice.id].id}</p>
                        <p className="mt-1 text-xs text-slate-500">{possibleMatches[selectedDevice.id].address_label} | {Math.round(possibleMatches[selectedDevice.id].distanceMeters)} m away</p>
                        <button type="button" onClick={() => openIncident(possibleMatches[selectedDevice.id].id)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700">
                          <Link2 className="h-3.5 w-3.5" />
                          Open incident
                        </button>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent Alert Events</p>
                      <div className="mt-3 space-y-2">
                        {selectedDevice.alert_events?.length ? selectedDevice.alert_events.slice(0, 5).map((incident) => (
                          <div key={incident.id} className="rounded-2xl bg-panel px-3 py-3">
                            <p className="text-sm font-semibold text-navy">{incident.reference_code ?? incident.id}</p>
                            <p className="mt-1 text-xs text-slate-500">{incident.address_label} | {timeAgo(incident.created_at)}</p>
                          </div>
                        )) : <p className="rounded-2xl bg-panel px-3 py-4 text-sm text-slate-500">No alerts recorded for this device in the current history window.</p>}
                      </div>
                    </div>
                  </>
                ) : (
                  <AdminEmptyState title="No device selected" description="Choose any sensor card to inspect its current alert context." />
                )}
              </div>
            </article>
          </section>

          <section className="admin-surface p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Device Configuration</p>
              <h2 className="mt-1 text-xl font-semibold text-navy">Threshold and activation controls</h2>
            </div>
            <div className="mt-4 overflow-x-auto">
              {isLoading ? (
                <AdminSkeletonRows rows={5} className="h-16" />
              ) : sortedDevices.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><SortableHeader label="Device ID" sortKey="device_id" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Location Name" sortKey="location_name" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th>Coordinates</th>
                      <th><SortableHeader label="Threshold" sortKey="smoke_threshold" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Status" sortKey="status" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th><SortableHeader label="Last Ping" sortKey="last_ping_at" currentSort={sortConfig} onToggle={handleSort} /></th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDevices.map((row) => {
                      const draft = drafts[row.id] ?? {}

                      return (
                        <tr key={row.id}>
                          <td className="px-3 py-3 font-medium text-navy">{row.device_id}</td>
                          <td className="px-3 py-3">{row.location_name}</td>
                          <td className="px-3 py-3 text-xs text-slate-600">{Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <input type="number" value={draft.smoke_threshold ?? row.smoke_threshold} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...current[row.id], smoke_threshold: Number(event.target.value) } }))} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-danger" />
                              <button type="button" onClick={() => updateDevice(row.id, { smoke_threshold: Number(draft.smoke_threshold ?? row.smoke_threshold) }, 'Threshold updated.')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-navy">Save</button>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => updateDevice(row.id, { is_active: !(draft.is_active ?? row.is_active) }, 'Device status updated.')} className={`rounded-full px-3 py-1 text-xs font-semibold ${(draft.is_active ?? row.is_active) ? 'bg-success/15 text-success' : 'bg-slate-200 text-slate-600'}`}>
                              {(draft.is_active ?? row.is_active) ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500">{row.last_ping_at ? timeAgo(row.last_ping_at) : 'Never'}</td>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => deleteDevice(row.id)} className="inline-flex items-center gap-1 rounded-lg border border-danger px-2.5 py-1.5 text-xs font-semibold text-danger">
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <AdminEmptyState
                  title="No IoT devices found"
                  description="Add a new smoke sensor or widen the search to bring devices back into the configuration table."
                />
              )}
            </div>
          </section>
        </main>

        {showAddModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Register Sensor</p>
                  <h2 className="mt-1 text-xl font-semibold text-navy">Add IoT Device</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Place the device on the Valencia City map and capture the generated API key once.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setFormErrors({})
                  }}
                  className="rounded-full border border-slate-200 p-2 text-slate-500 hover:border-danger hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={createDevice} className="grid gap-5 px-5 py-5 xl:grid-cols-[0.92fr_1.08fr]">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-navy">Device ID</label>
                    <input
                      type="text"
                      value={addForm.device_id}
                      onChange={(event) => setAddForm((current) => ({ ...current, device_id: event.target.value }))}
                      className="form-input"
                      placeholder="SMOKE-VAL-001"
                    />
                    {formErrors.device_id ? <p className="mt-1 text-xs text-danger">{formErrors.device_id}</p> : null}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-navy">Location Name</label>
                    <input
                      type="text"
                      value={addForm.location_name}
                      onChange={(event) =>
                        setAddForm((current) => ({ ...current, location_name: event.target.value }))
                      }
                      className="form-input"
                      placeholder="Poblacion Covered Court"
                    />
                    {formErrors.location_name ? (
                      <p className="mt-1 text-xs text-danger">{formErrors.location_name}</p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-navy">Smoke Threshold (ppm)</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={addForm.smoke_threshold}
                      onChange={(event) =>
                        setAddForm((current) => ({ ...current, smoke_threshold: event.target.value }))
                      }
                      className="form-input"
                    />
                    {formErrors.smoke_threshold ? (
                      <p className="mt-1 text-xs text-danger">{formErrors.smoke_threshold}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-navy">Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={addForm.latitude}
                        onChange={(event) =>
                          setAddForm((current) => ({ ...current, latitude: event.target.value }))
                        }
                        className="form-input"
                      />
                      {formErrors.latitude ? <p className="mt-1 text-xs text-danger">{formErrors.latitude}</p> : null}
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-navy">Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={addForm.longitude}
                        onChange={(event) =>
                          setAddForm((current) => ({ ...current, longitude: event.target.value }))
                        }
                        className="form-input"
                      />
                      {formErrors.longitude ? (
                        <p className="mt-1 text-xs text-danger">{formErrors.longitude}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-panel p-4 text-sm text-slate-600">
                    Click the map to place the sensor marker. Manual coordinate edits still work if you need exact
                    values from the field team.
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false)
                        setFormErrors({})
                      }}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {submitting ? 'Creating...' : 'Create Device'}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">Device placement</p>
                    <p className="mt-1 text-sm text-slate-500">
                      The map is constrained to the Valencia City boundary used elsewhere in the admin console.
                    </p>
                  </div>
                  <div className="h-[420px] overflow-hidden rounded-3xl border border-slate-200">
                    <MapContainer
                      center={[Number(addForm.latitude), Number(addForm.longitude)]}
                      zoom={13}
                      className="h-full w-full"
                    >
                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Polygon positions={VALENCIA_CITY_BOUNDARY} pathOptions={{ color: '#2563EB', weight: 2 }} />
                      <CircleMarker
                        center={[Number(addForm.latitude), Number(addForm.longitude)]}
                        radius={9}
                        pathOptions={{ color: '#DC2626', fillColor: '#DC2626', fillOpacity: 0.95 }}
                      />
                      <MapClickPicker
                        onPick={(latitude, longitude) =>
                          setAddForm((current) => ({
                            ...current,
                            latitude: latitude.toFixed(6),
                            longitude: longitude.toFixed(6),
                          }))
                        }
                      />
                    </MapContainer>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {apiKeyModal ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4">
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">One-Time Secret</p>
                  <h2 className="mt-1 text-xl font-semibold text-navy">Device API Key</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    This key is shown once. Hand it to the device integrator before closing this dialog.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setApiKeyModal('')
                    setApiKeyDeviceId('')
                  }}
                  className="rounded-full border border-slate-200 p-2 text-slate-500 hover:border-danger hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-panel p-4">
                <p className="break-all font-mono text-sm text-navy">{apiKeyModal}</p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Connect The Device</p>
                <div className="mt-3 space-y-3 text-xs text-slate-600">
                  <div>
                    <p className="font-semibold text-navy">Device ID</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-700">{apiKeyDeviceId || '-'}</p>
                  </div>

                  <div>
                    <p className="font-semibold text-navy">Endpoint</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-700">POST /api/v1/iot/alert</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      For ESP32, use your PC LAN IP (example: <span className="font-mono">http://192.168.137.1:8000</span>), not localhost.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-navy">Headers</p>
                    <pre className="mt-1 overflow-x-auto rounded-xl bg-panel p-3 font-mono text-[11px] text-slate-700">{`Authorization: Bearer <API_KEY>\nContent-Type: application/json`}</pre>
                  </div>

                  <div>
                    <p className="font-semibold text-navy">JSON Body</p>
                    <pre className="mt-1 overflow-x-auto rounded-xl bg-panel p-3 font-mono text-[11px] text-slate-700">{`{\n  "device_id": "${apiKeyDeviceId || '<DEVICE_ID>'}",\n  "smoke_level": 1234,\n  "timestamp": "${new Date().toISOString()}"\n}`}</pre>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(apiKeyModal)
                      toast.success('API key copied.')
                    } catch {
                      toast.error('Unable to copy API key.')
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy"
                >
                  <Copy className="h-4 w-4" />
                  Copy key
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApiKeyModal('')
                    setApiKeyDeviceId('')
                  }}
                  className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <IncidentDetailDrawer
          key={drawerIncident?.id ?? 'drawer-empty'}
          incident={drawerIncident}
          loading={drawerLoading}
          staff={staff}
          relatedIncidents={drawerRelatedIncidents}
          onOpenIncident={openIncident}
          canManageIncidents={canManageIncidents}
          onClose={() => {
            setDrawerIncident(null)
            setDrawerLoading(false)
            setDrawerRelatedIncidents([])
          }}
          onVerify={handleVerify}
          onReject={handleReject}
        />
      </div>
    </div>
  )
}

export default AdminIotDevicesPage
