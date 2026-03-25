import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { API_BASE_URL } from './api'

let echoInstance = null

function asBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue
  }

  return String(value).toLowerCase() === 'true'
}

export function initializeEcho(token) {
  if (!token) {
    return null
  }

  if (echoInstance) {
    echoInstance.disconnect()
  }

  window.Pusher = Pusher

  const wsHost = import.meta.env.VITE_REVERB_HOST ?? window.location.hostname
  const wsPort = Number(import.meta.env.VITE_REVERB_PORT ?? 8080)
  const wssPort = Number(import.meta.env.VITE_REVERB_PORT ?? 443)
  const forceTLS = asBoolean(import.meta.env.VITE_REVERB_TLS, false)
  const key = import.meta.env.VITE_REVERB_APP_KEY ?? 'rescuelink-key'

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
