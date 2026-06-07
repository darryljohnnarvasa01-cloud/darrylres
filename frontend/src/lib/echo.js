import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { API_BASE_URL, getRuntimeConfig } from './api'

let echoInstance = null

function asBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }

  return String(value).toLowerCase() === 'true'
}

function asNumber(value, defaultValue) {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function asString(value) {
  const normalized = String(value ?? '').trim()

  return normalized || undefined
}

function getRuntimeReverbConfig() {
  const config = getRuntimeConfig()

  return config.reverb || {}
}

function isReverbEnabled(reverbConfig) {
  const configuredEnabled = reverbConfig.enabled ?? import.meta.env.VITE_REVERB_ENABLED

  if (configuredEnabled !== undefined && configuredEnabled !== null && configuredEnabled !== '') {
    return asBoolean(configuredEnabled, false)
  }

  return Boolean(asString(reverbConfig.host) || import.meta.env.VITE_REVERB_HOST)
}

export function initializeEcho(token) {
  if (!token) {
    return null
  }

  const reverbConfig = getRuntimeReverbConfig()

  if (!isReverbEnabled(reverbConfig)) {
    disconnectEcho()
    return null
  }

  if (echoInstance) {
    echoInstance.disconnect()
  }

  window.Pusher = Pusher

  const envPort = Number(import.meta.env.VITE_REVERB_PORT ?? 8080)
  const wsHost = asString(reverbConfig.host) ?? import.meta.env.VITE_REVERB_HOST ?? window.location.hostname
  const wsPort = asNumber(reverbConfig.port, envPort)
  const wssPort = asNumber(reverbConfig.wssPort ?? reverbConfig.port, Number(import.meta.env.VITE_REVERB_PORT ?? 443))
  const forceTLS = asBoolean(reverbConfig.tls ?? import.meta.env.VITE_REVERB_TLS, false)
  const key = asString(reverbConfig.appKey) ?? import.meta.env.VITE_REVERB_APP_KEY ?? 'rescuelink-key'

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key,
    wsHost,
    wsPort,
    wssPort,
    forceTLS,
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${API_BASE_URL}/broadcasting/auth`,
    auth: {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  })

  window.Echo = echoInstance

  return echoInstance
}

export function disconnectEcho() {
  if (echoInstance) {
    echoInstance.disconnect()
    echoInstance = null
  }

  if (window.Echo) {
    delete window.Echo
  }
}
