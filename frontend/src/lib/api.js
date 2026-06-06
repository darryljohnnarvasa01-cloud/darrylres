import axios from 'axios'
import { getAuthState } from './authStorage'

export function getRuntimeConfig() {
  if (typeof window === 'undefined') {
    return {}
  }

  return window.__RESCUELINK_CONFIG__ || {}
}

function readRuntimeString(keys) {
  const config = getRuntimeConfig()

  for (const key of keys) {
    const value = config[key]

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim()
    }
  }

  return ''
}

function stripTrailingSlash(value) {
  if (!value) {
    return ''
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}

function inferApiBaseUrl() {
  return stripTrailingSlash(readRuntimeString(['apiBaseUrl', 'api_base_url', 'VITE_API_BASE_URL']))
}

function resolveApiBaseUrl() {
  const runtimeApiBaseUrl = inferApiBaseUrl()
  const buildApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || ''

  return stripTrailingSlash(runtimeApiBaseUrl || buildApiBaseUrl)
}

export const API_BASE_URL = resolveApiBaseUrl()

const GET_CACHE_TTL_MS = 10000
const getCache = new Map()
const pendingGetRequests = new Map()

function stableStringify(value) {
  if (!value || typeof value !== 'object') {
    return String(value ?? '')
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  return Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableStringify(value[key])}`)
    .join('|')
}

function cacheKeyFor(url, config = {}) {
  const { token } = getAuthState()
  const params = config.params ? stableStringify(config.params) : ''
  const authScope = token ? token.slice(0, 16) : 'guest'

  return `${authScope}:${url}?${params}`
}

function isCacheableGet(config = {}) {
  return config.cache !== false && !config.responseType && !config.signal
}

export function clearApiCache() {
  getCache.clear()
  pendingGetRequests.clear()
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  withXSRFToken: false,
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearApiCache()
    }

    return Promise.reject(error)
  },
)

const rawGet = api.get.bind(api)
api.get = (url, config = {}) => {
  if (!isCacheableGet(config)) {
    return rawGet(url, config)
  }

  const ttl = Number(config.cacheTtl ?? GET_CACHE_TTL_MS)
  const key = cacheKeyFor(url, config)
  const cached = getCache.get(key)

  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve({
      ...cached.response,
      data: typeof structuredClone === 'function' ? structuredClone(cached.response.data) : cached.response.data,
    })
  }

  if (pendingGetRequests.has(key)) {
    return pendingGetRequests.get(key)
  }

  const request = rawGet(url, config)
    .then((response) => {
      getCache.set(key, {
        expiresAt: Date.now() + ttl,
        response,
      })

      return response
    })
    .finally(() => {
      pendingGetRequests.delete(key)
    })

  pendingGetRequests.set(key, request)

  return request
}

;['post', 'put', 'patch', 'delete'].forEach((method) => {
  const rawMethod = api[method].bind(api)

  api[method] = (...args) => rawMethod(...args).then((response) => {
    clearApiCache()
    return response
  })
})

export async function ensureCsrfCookie() {
  return Promise.resolve()
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
