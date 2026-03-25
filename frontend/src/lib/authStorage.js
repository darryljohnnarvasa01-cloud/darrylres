const AUTH_STORAGE_KEY = 'rescuelink_auth'

export function getAuthState() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)

  if (!raw) {
    return { token: null, role: null, user: null }
  }

  try {
    const parsed = JSON.parse(raw)
    return {
      token: parsed.token ?? null,
      role: parsed.role ?? null,
      user: parsed.user ?? null,
    }
  } catch {
    return { token: null, role: null, user: null }
  }
}

export function saveAuthState(state) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
}

export function clearAuthState() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
