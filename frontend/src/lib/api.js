import axios from 'axios'
import { getAuthState } from './authStorage'

function inferApiBaseUrl() {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8000'
  }

  return window.location.origin
}

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) {
    return inferApiBaseUrl()
  }

  return import.meta.env.VITE_API_BASE_URL ?? inferApiBaseUrl()
}

export const API_BASE_URL = resolveApiBaseUrl()

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

api.interceptors.request.use((config) => {
  const { token } = getAuthState()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export async function ensureCsrfCookie() {
  await api.get('/sanctum/csrf-cookie')
}

export function resolveApiUrl(path) {
  if (!path) {
    return ''
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
  const suffix = path.startsWith('/') ? path : `/${path}`

  return `${base}${suffix}`
}
