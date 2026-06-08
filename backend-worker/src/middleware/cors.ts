import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

function parseAllowedOrigins(value?: string) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}

export function rescueLinkCors(): MiddlewareHandler<AppEnv> {
  return cors({
    origin: (origin, c) => {
      const allowedOrigins = parseAllowedOrigins(c.env.CORS_ALLOWED_ORIGINS)

      if (!origin) {
        return origin
      }

      if (
        allowedOrigins.has(origin)
        || /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin)
      ) {
        return origin
      }

      return null
    },
    allowHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN', 'X-RescueLink-Guest-Id'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 600,
  })
}
