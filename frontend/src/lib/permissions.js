export const ADMIN_ABILITIES = [
  'view-dashboard',
  'manage-users',
  'manage-roles',
  'manage-incidents',
  'view-analytics',
  'view-reports',
  'manage-iot',
  'broadcast-messages',
  'edit-system-settings',
  'delete-records',
]

export const ADMIN_ABILITY_LABELS = {
  'view-dashboard': 'View dashboard',
  'manage-users': 'Manage users',
  'manage-roles': 'Manage roles',
  'manage-incidents': 'Manage incidents',
  'view-analytics': 'View analytics',
  'view-reports': 'View reports',
  'manage-iot': 'Manage IoT devices',
  'broadcast-messages': 'Broadcast messages',
  'edit-system-settings': 'Edit system settings',
  'delete-records': 'Delete records',
}

export function permissionListForUser(user, role = user?.role) {
  if (role !== 'admin') {
    return []
  }

  if (Array.isArray(user?.permissions)) {
    return user.permissions
  }

  if (user?.permission_map && typeof user.permission_map === 'object') {
    return Object.entries(user.permission_map)
      .filter(([, allowed]) => Boolean(allowed))
      .map(([ability]) => ability)
  }

  return [...ADMIN_ABILITIES]
}

export function hasPermission(user, ability, role = user?.role) {
  return permissionListForUser(user, role).includes(ability)
}

export function getDefaultRouteForUser(user, role) {
  const resolvedRole = role ?? user?.role

  if (resolvedRole === 'admin') {
    if (hasPermission(user, 'view-dashboard', resolvedRole)) {
      return '/admin/dashboard'
    }

    if (hasPermission(user, 'manage-incidents', resolvedRole)) {
      return '/admin/dashboard'
    }

    if (hasPermission(user, 'manage-users', resolvedRole)) {
      return '/admin/registrations'
    }

    if (hasPermission(user, 'view-analytics', resolvedRole)) {
      return '/admin/analytics'
    }

    if (hasPermission(user, 'manage-iot', resolvedRole)) {
      return '/admin/iot-devices'
    }

    if (hasPermission(user, 'broadcast-messages', resolvedRole)) {
      return '/admin/notifications'
    }

    if (hasPermission(user, 'manage-roles', resolvedRole)) {
      return '/admin/roles'
    }

    if (hasPermission(user, 'view-reports', resolvedRole)) {
      return '/admin/audit'
    }

    if (hasPermission(user, 'edit-system-settings', resolvedRole)) {
      return '/admin/system'
    }

    return '/admin/responders'
  }

  if (resolvedRole === 'citizen') {
    return '/report'
  }

  if (resolvedRole === 'staff') {
    return '/staff'
  }

  return '/dashboard'
}
