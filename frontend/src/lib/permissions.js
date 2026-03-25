export const ADMIN_ABILITIES = [
  'manage-users',
  'manage-incidents',
  'view-analytics',
  'manage-iot',
  'broadcast-messages',
]

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

export function getDefaultRouteForUser(user, role = user?.role) {
  if (role === 'admin') {
    if (hasPermission(user, 'manage-incidents', role)) {
      return '/admin/dashboard'
    }

    if (hasPermission(user, 'manage-users', role)) {
      return '/admin/registrations'
    }

    if (hasPermission(user, 'view-analytics', role)) {
      return '/admin/analytics'
    }

    if (hasPermission(user, 'manage-iot', role)) {
      return '/admin/iot-devices'
    }

    if (hasPermission(user, 'broadcast-messages', role)) {
      return '/admin/notifications'
    }

    return '/admin/responders'
  }

  if (role === 'citizen') {
    return '/report'
  }

  if (role === 'staff') {
    return '/staff'
  }

  return '/dashboard'
}
