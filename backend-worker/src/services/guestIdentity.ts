import type { Context } from 'hono'
import type { AppEnv } from '../types'

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function guestIdentity(c: Context<AppEnv>) {
  const browserId = (c.req.header('X-RescueLink-Guest-Id') || 'anonymous-browser')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80)
    || 'anonymous-browser'
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '0.0.0.0'
  const userAgent = (c.req.header('User-Agent') || '').slice(0, 255)
  const secret = c.env.APP_KEY || 'rescuelink'

  return {
    guest_identifier: await sha256Hex(`${browserId}|${ip}|${userAgent}|${secret}`),
    ip_hash: await sha256Hex(`${ip}|${secret}`),
    user_agent_hash: await sha256Hex(`${userAgent}|${secret}`),
  }
}

export function publicGuestQuota(quota: {
  limit: number
  used: number
  remaining: number
  limit_reached: boolean
}) {
  return {
    limit: quota.limit,
    used: quota.used,
    remaining: quota.remaining,
    limit_reached: quota.limit_reached,
  }
}
