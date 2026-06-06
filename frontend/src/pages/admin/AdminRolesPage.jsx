import { AlertTriangle, Check, Shield, ShieldCheck, Trash2, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import AdminSidebar from '../../components/admin/AdminSidebar'
import NotificationBell from '../../components/notifications/NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { ADMIN_ABILITY_LABELS } from '../../lib/permissions'
import { parseApiError } from '../../lib/errorUtils'

const emptyPermissionMap = (abilities) => Object.fromEntries(abilities.map((ability) => [ability, false]))

function AdminRolesPage() {
  const { user, logout } = useAuth()
  const [abilities, setAbilities] = useState([])
  const [roles, setRoles] = useState([])
  const [admins, setAdmins] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [form, setForm] = useState({ name: '', permissions: {}, is_active: true })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isNewRoleMode, setIsNewRoleMode] = useState(false)
  const [apiError, setApiError] = useState('')
  const [assignmentErrors, setAssignmentErrors] = useState({})
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [createAdminForm, setCreateAdminForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    barangay: '',
    role_id: ''
  })
  const [createAdminErrors, setCreateAdminErrors] = useState({})

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  )

  const fetchRoles = useCallback(async (preferredRoleId = null, skipAutoSelect = false) => {
    setLoading(true)
    try {
      const response = await api.get('/api/v1/admin/roles')
      const payload = response.data?.data ?? {}
      const nextAbilities = payload.abilities ?? []
      const nextRoles = payload.roles ?? []

      setAbilities(nextAbilities)
      setRoles(nextRoles)
      setAdmins(payload.admins ?? [])

      const roleToSelect = nextRoles.find((role) => role.id === (preferredRoleId ?? selectedRoleId))
        ?? (!skipAutoSelect && !selectedRoleId && !isNewRoleMode ? nextRoles[0] : null)

      if (roleToSelect) {
        setSelectedRoleId(roleToSelect.id)
        setForm({
          name: roleToSelect.name,
          permissions: { ...emptyPermissionMap(nextAbilities), ...(roleToSelect.permission_map ?? {}) },
          is_active: Boolean(roleToSelect.is_active),
        })
      }
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setLoading(false)
    }
  }, [selectedRoleId, isNewRoleMode])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const selectRole = (role) => {
    setSelectedRoleId(role.id)
    setIsNewRoleMode(false)
    setApiError('')
    setForm({
      name: role.name,
      permissions: { ...emptyPermissionMap(abilities), ...(role.permission_map ?? {}) },
      is_active: Boolean(role.is_active),
    })
  }

  const startNewRole = () => {
    setSelectedRoleId('')
    setIsNewRoleMode(true)
    setApiError('')
    setForm({ name: '', permissions: emptyPermissionMap(abilities), is_active: true })
  }

  const togglePermission = (ability) => {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [ability]: !current.permissions[ability],
      },
    }))
  }

  const allPermissionsGranted = (permissionMap) => {
    if (!permissionMap || Object.keys(permissionMap).length === 0) return false
    return Object.values(permissionMap).every((v) => v === true)
  }

  const isFullAdminRole = (role) => {
    if (!role) return false
    return role.is_active && allPermissionsGranted(role.permission_map)
  }

  const wouldLeaveNoFullAdmin = () => {
    if (!selectedRole) return false
    // Only check if we're deactivating or removing permissions from a full admin role
    const currentlyFullAdmin = isFullAdminRole(selectedRole)
    const nextPermissions = { ...form.permissions }
    const nextActive = form.is_active
    const wouldBeFullAdmin = nextActive && allPermissionsGranted(nextPermissions)

    if (!currentlyFullAdmin || wouldBeFullAdmin) return false

    // Check if any OTHER role grants full admin
    return !roles.some((r) => r.id !== selectedRole.id && isFullAdminRole(r))
  }

  const saveRole = async () => {
    setApiError('')
    setSaving(true)
    try {
      // Ensure all permissions are boolean values
      const cleanPermissions = Object.fromEntries(
        Object.entries(form.permissions).map(([key, value]) => [key, Boolean(value)])
      )

      const payload = {
        name: form.name,
        permissions: cleanPermissions,
        is_active: form.is_active,
      }

      if (selectedRoleId) {
        await api.patch(`/api/v1/admin/roles/${selectedRoleId}`, payload)
        toast.success('Role updated.')
      } else {
        const response = await api.post('/api/v1/admin/roles', payload)
        console.log('Create role response:', response.data)
        const newRoleId = response.data?.data?.role?.id ?? ''
        console.log('New role ID:', newRoleId)
        toast.success('Role created.')
        await fetchRoles(newRoleId || null, false)
        if (newRoleId) {
          setIsNewRoleMode(false)
          setSelectedRoleId(newRoleId)
        }
        setSaving(false)
        return
      }

      await fetchRoles(selectedRoleId || null, false)
    } catch (error) {
      console.error('Role save error:', error)
      const parsed = parseApiError(error)
      setApiError(parsed.message)
      toast.error(parsed.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async () => {
    if (!selectedRoleId || selectedRole?.is_system) {
      return
    }

    setSaving(true)
    try {
      await api.delete(`/api/v1/admin/roles/${selectedRoleId}`)
      toast.success('Role removed or disabled.')
      setSelectedRoleId('')
      setForm({ name: '', permissions: emptyPermissionMap(abilities), is_active: true })
      fetchRoles()
    } catch (error) {
      toast.error(parseApiError(error).message)
    } finally {
      setSaving(false)
    }
  }

  const assignRole = async (adminId, roleId) => {
    console.log('Assigning role:', { adminId, roleId })
    if (!roleId) {
      console.warn('No roleId provided, skipping assignment')
      return
    }
    // Clear previous error for this admin
    setAssignmentErrors((prev) => ({ ...prev, [adminId]: '' }))
    try {
      const response = await api.patch(`/api/v1/admin/users/${adminId}/role`, { role_id: roleId })
      console.log('Role assignment response:', response.data)
      toast.success('Admin role assigned.')
      fetchRoles()
    } catch (error) {
      console.error('Role assignment error:', error)
      const msg = parseApiError(error).message
      toast.error(msg)
      setAssignmentErrors((prev) => ({ ...prev, [adminId]: msg }))
    }
  }

  const createAdminUser = async () => {
    setCreateAdminErrors({})
    try {
      const response = await api.post('/api/v1/admin/admins', createAdminForm)
      toast.success('Admin account created.')
      setShowCreateAdmin(false)
      setCreateAdminForm({
        full_name: '',
        email: '',
        password: '',
        phone: '',
        address: '',
        barangay: '',
        role_id: ''
      })
      fetchRoles()
    } catch (error) {
      console.error('Create admin error:', error)
      const parsed = parseApiError(error)
      setCreateAdminErrors(parsed.errors || {})
      toast.error(parsed.message)
    }
  }

  return (
    <div className="admin-shell min-h-screen bg-panel">
      <AdminSidebar user={user} onLogout={logout} />

      <div className="admin-shell__content">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex flex-wrap items-start gap-3 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">Access Control</p>
              <h1 className="mt-1 text-2xl font-semibold text-navy">Roles & Permissions</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Create admin roles and limit the features each role can open or change.</p>
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

        <main className="grid gap-5 px-4 pb-6 lg:grid-cols-[320px_1fr] lg:px-6">
          <section className="admin-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy">Roles</h2>
              <button type="button" onClick={startNewRole} className="rounded-xl bg-danger px-3 py-2 text-xs font-semibold text-white">
                New Role
              </button>
            </div>

            <div className="space-y-2">
              {loading ? (
                <p className="rounded-xl bg-panel p-3 text-sm text-slate-500">Loading roles...</p>
              ) : roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => selectRole(role)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selectedRoleId === role.id ? 'border-info bg-info/10' : 'border-slate-200 bg-white hover:border-info/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-navy">{role.name}</span>
                      {isFullAdminRole(role) && (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                          Full Admin
                        </span>
                      )}
                      {role.is_system && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          System
                        </span>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${role.is_active ? 'bg-success/15 text-success' : 'bg-slate-200 text-slate-500'}`}>
                      {role.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{role.users_count} assigned admins</p>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <article className="admin-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-info" />
                  <h2 className="text-lg font-semibold text-navy">{selectedRoleId ? 'Edit Role' : 'Create Role'}</h2>
                </div>
                {selectedRole && !selectedRole.is_system ? (
                  <button type="button" onClick={deleteRole} className="inline-flex items-center gap-2 rounded-xl border border-danger px-3 py-2 text-xs font-semibold text-danger">
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                ) : null}
              </div>

              {apiError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{apiError}</span>
                </div>
              )}

              {wouldLeaveNoFullAdmin() && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>Warning:</strong> This change would leave the system without a full administrator. Keep this role active with all permissions, or ensure another role grants all permissions to an active admin.
                  </span>
                </div>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="form-input mt-2"
                    placeholder="Operations Lead"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    disabled={selectedRole?.is_system}
                    onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                    className="h-4 w-4 accent-info"
                  />
                  <span className="text-sm font-semibold text-navy">Role is active</span>
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {abilities.map((ability) => (
                  <button
                    key={ability}
                    type="button"
                    onClick={() => togglePermission(ability)}
                    className={`flex min-h-14 items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                      form.permissions[ability] ? 'border-info bg-info/10 text-info' : 'border-slate-200 bg-white text-navy hover:border-info/40'
                    }`}
                  >
                    <span>{ADMIN_ABILITY_LABELS[ability] ?? ability}</span>
                    {form.permissions[ability] ? <Check className="h-4 w-4" /> : null}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                {wouldLeaveNoFullAdmin() && (
                  <span className="text-xs text-amber-600">Cannot save: system needs at least one full admin role</span>
                )}
                <button
                  type="button"
                  disabled={saving || !form.name.trim() || wouldLeaveNoFullAdmin()}
                  onClick={saveRole}
                  className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Role'}
                </button>
              </div>
            </article>

            <article className="admin-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-navy">Assigned Admins</h2>
                <button
                  type="button"
                  onClick={() => setShowCreateAdmin(!showCreateAdmin)}
                  className="rounded-xl bg-danger px-3 py-2 text-xs font-semibold text-white"
                >
                  {showCreateAdmin ? 'Cancel' : '+ Create Admin'}
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Assign roles to admin users. A role with all permissions (Full Admin) must remain active.
                You cannot remove Full Admin access from the only remaining full admin.
              </p>

              {showCreateAdmin && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-4 text-sm font-semibold text-navy">Create New Admin Account</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</label>
                      <input
                        type="text"
                        value={createAdminForm.full_name}
                        onChange={(e) => setCreateAdminForm({...createAdminForm, full_name: e.target.value})}
                        className="form-input"
                        placeholder="John Doe"
                      />
                      {createAdminErrors.full_name && <p className="mt-1 text-xs text-danger">{createAdminErrors.full_name}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                      <input
                        type="email"
                        value={createAdminForm.email}
                        onChange={(e) => setCreateAdminForm({...createAdminForm, email: e.target.value})}
                        className="form-input"
                        placeholder="admin@example.com"
                      />
                      {createAdminErrors.email && <p className="mt-1 text-xs text-danger">{createAdminErrors.email}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
                      <input
                        type="password"
                        value={createAdminForm.password}
                        onChange={(e) => setCreateAdminForm({...createAdminForm, password: e.target.value})}
                        className="form-input"
                        placeholder="Min 8 characters"
                      />
                      {createAdminErrors.password && <p className="mt-1 text-xs text-danger">{createAdminErrors.password}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
                      <input
                        type="text"
                        value={createAdminForm.phone}
                        onChange={(e) => setCreateAdminForm({...createAdminForm, phone: e.target.value})}
                        className="form-input"
                        placeholder="09123456789"
                      />
                      {createAdminErrors.phone && <p className="mt-1 text-xs text-danger">{createAdminErrors.phone}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
                      <input
                        type="text"
                        value={createAdminForm.address}
                        onChange={(e) => setCreateAdminForm({...createAdminForm, address: e.target.value})}
                        className="form-input"
                        placeholder="Street address"
                      />
                      {createAdminErrors.address && <p className="mt-1 text-xs text-danger">{createAdminErrors.address}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Barangay</label>
                      <input
                        type="text"
                        value={createAdminForm.barangay}
                        onChange={(e) => setCreateAdminForm({...createAdminForm, barangay: e.target.value})}
                        className="form-input"
                        placeholder="Barangay name"
                      />
                      {createAdminErrors.barangay && <p className="mt-1 text-xs text-danger">{createAdminErrors.barangay}</p>}
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Assign Role</label>
                      <select
                        value={createAdminForm.role_id}
                        onChange={(e) => setCreateAdminForm({...createAdminForm, role_id: e.target.value})}
                        className="form-input"
                      >
                        <option value="">Select a role...</option>
                        {roles.filter((role) => role.is_active).map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                      {createAdminErrors.role_id && <p className="mt-1 text-xs text-danger">{createAdminErrors.role_id}</p>}
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={createAdminUser}
                      className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white"
                    >
                      Create Admin
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Current Role</th>
                      <th>Assign Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin.id}>
                        <td className="px-3 py-3 font-medium">{admin.full_name}</td>
                        <td className="px-3 py-3">{admin.email}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-navy">{admin.role_name}</span>
                          {admin.is_full_admin ? <span className="ml-2 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Full admin</span> : null}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={admin.role_id ?? ''}
                            onChange={(event) => assignRole(admin.id, event.target.value)}
                            className={`form-input h-10 min-w-48 py-1 text-sm ${assignmentErrors[admin.id] ? 'border-danger' : ''}`}
                          >
                            <option value="" disabled>Choose role</option>
                            {roles.filter((role) => role.is_active).map((role) => (
                              <option key={role.id} value={role.id}>{role.name}</option>
                            ))}
                          </select>
                          {assignmentErrors[admin.id] && (
                            <p className="mt-1 text-xs text-danger">{assignmentErrors[admin.id]}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  )
}

export default AdminRolesPage
