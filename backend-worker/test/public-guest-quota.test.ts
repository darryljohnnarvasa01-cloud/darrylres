import { describe, expect, it, vi } from 'vitest'
import type { Bindings } from '../src/types'

const { mockState } = vi.hoisted(() => ({
  mockState: {
    reportsCount: 2,
  },
}))

vi.mock('../src/services/supabase', async () => {
  const actual = await vi.importActual<typeof import('../src/services/supabase')>('../src/services/supabase')

  return {
    ...actual,
    getSupabase: () => ({
      from(table: string) {
        if (table !== 'guest_report_usages') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { reports_count: mockState.reportsCount },
                    error: null,
                  }),
                }
              },
            }
          },
        }
      },
    }),
  }
})

const env: Bindings = {
  APP_NAME: 'RescueLink',
  APP_ENV: 'test',
  APP_KEY: 'test-key',
  GUEST_REPORT_LIMIT: '10',
  DEFAULT_EMERGENCY_HOTLINE: '0966-123-4567',
}

describe('Guest quota route', () => {
  it('returns the computed guest quota successfully', async () => {
    const { default: app } = await import('../src/index')
    const response = await app.request('/api/v1/incidents/guest/quota', {}, env)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        guest_quota: {
          limit: 10,
          used: 2,
          remaining: 8,
          limit_reached: false,
        },
      },
      message: 'Guest report quota retrieved successfully.',
    })
  })
})
