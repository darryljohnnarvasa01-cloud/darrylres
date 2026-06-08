import { describe, expect, it } from 'vitest'
import app from '../src/index'
import type { Bindings } from '../src/types'

const env: Bindings = {
  APP_NAME: 'RescueLink',
  APP_ENV: 'test',
  DEFAULT_EMERGENCY_HOTLINE: '0966-123-4567',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}

describe('Worker API smoke routes', () => {
  it('returns the public config envelope', async () => {
    const response = await app.request('/api/v1/public/config', {}, env)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        supabase: {
          url: 'https://example.supabase.co',
          anon_key: 'anon-key',
        },
        google_maps: {
          api_key: '',
        },
      },
      message: 'Public frontend configuration retrieved successfully.',
    })
  })

  it('returns a not-found envelope for unknown routes', async () => {
    const response = await app.request('/missing', {}, env)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.message).toBe('Route not found.')
  })

  it('reports missing Supabase credentials for guest incident submission', async () => {
    const formData = new FormData()
    formData.set('type', 'fire')
    formData.set('description', 'A valid emergency report description for testing.')
    formData.set('incident_datetime', new Date(Date.now() - 60000).toISOString())
    formData.set('latitude', '7.9')
    formData.set('longitude', '125.1')
    formData.set('address_label', 'Valencia City')
    formData.append('media[]', new File(['image'], 'incident.jpg', { type: 'image/jpeg' }))

    const response = await app.request('/api/v1/public/incidents', {
      method: 'POST',
      body: formData,
    }, {
      APP_NAME: 'RescueLink',
      APP_ENV: 'test',
    })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.message).toBe('Supabase credentials are not configured.')
  })
})
