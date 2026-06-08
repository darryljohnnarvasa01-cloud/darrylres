import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function successResponse<T>(
  c: Context,
  data: T,
  message = '',
  status: ContentfulStatusCode = 200,
) {
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
) {
  return c.json({
    success: false,
    errors,
    message,
  }, status)
}
