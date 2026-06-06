import { Edit3, Loader2, Map, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import AdminSidebar from '../../components/admin/AdminSidebar'
import HazardLayer from '../../components/maps/HazardLayer'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { parseApiError } from '../../lib/errorUtils'
import { normalizeHazardCircle, normalizeHazardPositions } from '../../lib/hazardGeometry'

const MAP_CENTER = [7.9062, 125.0936]

const DEFAULT_POLYGON = JSON.stringify([
  [7.9062, 125.0936],
  [7.9072, 125.0956],
  [7.9048, 125.0962],
], null, 2)

const EMPTY_FORM = {
  id: null,
  name: '',
  type: 'danger',
  polygon: DEFAULT_POLYGON,
  description: '',
  capacity: '',
  current_occupancy: '',
  facilities: '',
  is_active: true,
}

function formatPolygonPreview(polygon) {
  if (Array.isArray(polygon)) {
    return `${polygon.length} point${polygon.length === 1 ? '' : 's'}`
  }

  if (polygon?.type === 'circle') {
    return `Circle, ${polygon.radius ?? 0}m`
  }

  return 'Custom geometry'
}

function HazardMapViewport({ zones }) {
  const map = useMap()

  useEffect(() => {
    const points = zones.flatMap((zone) => {
      const circle = normalizeHazardCircle(zone.polygon)

      if (circle) {
        return [circle.center]
      }

      return normalizeHazardPositions(zone.polygon)
    })

    if (points.length > 1) {
      map.fitBounds(points, { padding: [32, 32], maxZoom: 16 })
    } else if (points.length === 1) {
      map.setView(points[0], 15)
    } else {
      map.setView(MAP_CENTER, 13)
    }
  }, [map, zones])

  return null
}

function AdminHazardZonesPage() {
  const { user, logout } = useAuth()
  const [zones, setZones] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const isEditing = Boolean(form.id)

  const activeCount = useMemo(() => zones.filter((zone) => zone.is_active).length, [zones])

  const fetchZones = async () => {
    setLoading(true)

    try {
      const response = await api.get('/api/v1/admin/hazard-zones', {
        params: { include_inactive: true },
        cacheTtl: 1000,
      })
      setZones(response.data?.data?.hazard_zones ?? [])
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchZones()
  }, [])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
  }

  const editZone = (zone) => {
    setForm({
      id: zone.id,
      name: zone.name ?? '',
      type: zone.type ?? 'danger',
      polygon: JSON.stringify(zone.polygon ?? [], null, 2),
      description: zone.description ?? '',
      capacity: zone.capacity ?? '',
      current_occupancy: zone.current_occupancy ?? '',
      facilities: Array.isArray(zone.facilities) ? zone.facilities.join(', ') : '',
      is_active: Boolean(zone.is_active),
    })
  }

  const submitForm = async (event) => {
    event.preventDefault()
    setSaving(true)

    try {
      const polygon = JSON.parse(form.polygon)
      const payload = {
        name: form.name,
        type: form.type,
        polygon,
        description: form.description || null,
        is_active: form.is_active,
      }

      if (form.type === 'evacuation') {
        payload.capacity = form.capacity === '' ? null : Number(form.capacity)
        payload.current_occupancy = form.current_occupancy === '' ? null : Number(form.current_occupancy)
        payload.facilities = form.facilities
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      }

      if (isEditing) {
        await api.patch(`/api/v1/admin/hazard-zones/${form.id}`, payload)
        toast.success('Hazard zone updated.')
      } else {
        await api.post('/api/v1/admin/hazard-zones', payload)
        toast.success('Hazard zone created.')
      }

      resetForm()
      fetchZones()
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error('Polygon must be valid JSON.')
      } else {
        toast.error(parseApiError(error).message)
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteZone = async (zone) => {
    if (!window.confirm(`Delete hazard zone "${zone.name}"?`)) {
      return
    }

    try {
      await api.delete(`/api/v1/admin/hazard-zones/${zone.id}`)
      toast.success('Hazard zone deleted.')
      fetchZones()
    } catch (error) {
      toast.error(parseApiError(error).message)
    }
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />
      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-info">Hazard Mapping</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Hazard zones</h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage danger zones, flood-prone areas, and evacuation centers shown on public and admin maps.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <button
                type="button"
                onClick={fetchZones}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy hover:border-info hover:text-info"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 pb-6 pt-5 lg:px-6">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Map className="h-3.5 w-3.5" />
                Live Map Preview
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Active hazard zones appear here exactly as they will on the public and admin maps.
              </p>
            </div>
            <div className="h-[420px]">
              <MapContainer center={MAP_CENTER} zoom={13} className="h-full w-full">
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <HazardMapViewport zones={zones.filter((zone) => zone.is_active)} />
                <HazardLayer zones={zones.filter((zone) => zone.is_active)} />
              </MapContainer>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Map className="h-3.5 w-3.5" />
                  Map Layers
                </p>
                <h2 className="mt-1 text-xl font-semibold text-navy">{activeCount} active zones</h2>
              </div>
            </div>

            {loading ? (
              <div className="flex h-52 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-danger" />
              </div>
            ) : zones.length ? (
              <div className="space-y-3">
                {zones.map((zone) => (
                  <article key={zone.id} className="rounded-2xl border border-slate-200 bg-panel px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-navy">{zone.name}</h3>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold uppercase text-slate-500">
                            {zone.type}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${zone.is_active ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-500'}`}>
                            {zone.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{zone.description || 'No description provided.'}</p>
                        <p className="mt-2 text-xs text-slate-500">{formatPolygonPreview(zone.polygon)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => editZone(zone)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-info hover:text-info"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteZone(zone)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-danger hover:border-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
                <p className="text-sm font-semibold text-navy">No hazard zones yet.</p>
                <p className="mt-1 text-sm text-slate-500">Create one here, then open the public map or admin map to see it.</p>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-danger" />
              <h2 className="text-lg font-semibold text-navy">{isEditing ? 'Edit zone' : 'New zone'}</h2>
            </div>
            <form className="mt-4 space-y-4" onSubmit={submitForm}>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Name</span>
                <input
                  required
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-info"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Type</span>
                <select
                  value={form.type}
                  onChange={(event) => updateField('type', event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-info"
                >
                  <option value="danger">Danger</option>
                  <option value="flood">Flood</option>
                  <option value="evacuation">Evacuation</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Polygon JSON</span>
                <textarea
                  required
                  rows={8}
                  value={form.polygon}
                  onChange={(event) => updateField('polygon', event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-info"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Description</span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => updateField('description', event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-info"
                />
              </label>

              {form.type === 'evacuation' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Capacity</span>
                    <input
                      type="number"
                      min="0"
                      value={form.capacity}
                      onChange={(event) => updateField('capacity', event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-info"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Occupancy</span>
                    <input
                      type="number"
                      min="0"
                      value={form.current_occupancy}
                      onChange={(event) => updateField('current_occupancy', event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-info"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Facilities</span>
                    <input
                      value={form.facilities}
                      onChange={(event) => updateField('facilities', event.target.value)}
                      placeholder="Water, medical, charging"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-info"
                    />
                  </label>
                </div>
              ) : null}

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-panel px-3 py-2 text-sm font-semibold text-navy">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => updateField('is_active', event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-danger"
                />
                Active on maps
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc1f34] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isEditing ? 'Save Zone' : 'Create Zone'}
                </button>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-navy hover:border-danger hover:text-danger"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminHazardZonesPage
