import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

function applyApiHeaders(c: Context) {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
}

export function successResponse<T>(
  c: Context,
  data: T,
  message = '',
  status: ContentfulStatusCode = 200,
) {
  applyApiHeaders(c)

  return c.json({
    success: true,
    data: data ?? {},
    message,
  }, status)
}

export function errorResponse(
  c: Context,
  message: string,
  errors: Record<string, unknown> = {},
  status: ContentfulStatusCode = 422,
  data: Record<string, unknown> = {},
) {
  applyApiHeaders(c)

  return c.json({
    success: false,
    data: data ?? {},
    errors,
    message,
  }, status)
}
