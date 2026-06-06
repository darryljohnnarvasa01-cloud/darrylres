import { api } from './api'

let configPromise = null

export async function getPublicConfig() {
  if (!configPromise) {
    configPromise = api
      .get('/api/v1/public/config', { cacheTtl: 60000 })
      .then((response) => response.data?.data ?? {})
      .catch((error) => {
        configPromise = null
        throw error
      })
  }

  return configPromise
}
