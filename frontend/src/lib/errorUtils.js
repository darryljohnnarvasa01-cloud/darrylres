export function getApiErrorDiagnostics(error) {
  const config = error?.config ?? {}
  const status = error?.response?.status ?? null
  const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false
  const message = error?.response?.data?.message ?? error?.message ?? 'Unknown API error'

  return {
    message,
    code: error?.code ?? null,
    status,
    method: config.method?.toUpperCase?.() ?? null,
    url: config.url ?? null,
    baseURL: config.baseURL ?? null,
    browserOnline,
    hasResponse: Boolean(error?.response),
    isTimeout: error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT',
    isNetworkFailure: !error?.response && ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', undefined].includes(error?.code),
  }
}

function fallbackMessageFor(error) {
  const details = getApiErrorDiagnostics(error)

  if (details.hasResponse) {
    return 'Something went wrong. Please try again.'
  }

  if (details.isTimeout) {
    return 'The RescueLink API request timed out. Please retry in a moment.'
  }

  if (details.browserOnline) {
    return 'Unable to reach the RescueLink API while your browser is online. Check the API deployment, CORS settings, or network gateway.'
  }

  return 'You appear to be offline. Reconnect and try again.'
}

export function parseApiError(error) {
  const payload = error?.response?.data
  const fieldErrors = payload?.errors ?? {}
  const normalizedFields = {}

  Object.entries(fieldErrors).forEach(([field, messages]) => {
    if (Array.isArray(messages) && messages.length > 0) {
      normalizedFields[field] = messages[0]
      return
    }

    normalizedFields[field] = String(messages)
  })

  return {
    message: payload?.message ?? fallbackMessageFor(error),
    fields: normalizedFields,
    data: payload?.data ?? {},
    status: error?.response?.status ?? 500,
    diagnostics: getApiErrorDiagnostics(error),
  }
}
