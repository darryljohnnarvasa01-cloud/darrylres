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
    message: payload?.message ?? 'Something went wrong. Please try again.',
    fields: normalizedFields,
    status: error?.response?.status ?? 500,
  }
}
