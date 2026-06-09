import { Hono } from 'hono'
import { rescueLinkCors } from './middleware/cors'
import adminRoutes from './routes/admin'
import authRoutes from './routes/auth'
import healthRoutes from './routes/health'
import notificationRoutes from './routes/notifications'
import publicRoutes, { guestIncidentQuota, storeGuestIncident } from './routes/public'
// Import staff routes - ensure ./routes/staff.ts exists and exports a valid Hono route
import staffRoutes from './routes/staff'
import type { AppEnv } from './types'
import { errorResponse, successResponse } from './utils/apiResponse'

const app = new Hono<AppEnv>()

app.use('*', rescueLinkCors())

app.get('/', (c) => successResponse(c, {
  service: 'rescuelink-worker-api',
  version: '0.1.0',
}, 'RescueLink Worker API is running.'))

app.get('/sanctum/csrf-cookie', (c) => successResponse(c, {}, 'CSRF cookie is not required for Worker token auth.'))
app.route('/api/v1/health', healthRoutes)
app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/admin', adminRoutes)
app.route('/api/v1/staff', staffRoutes)
app.route('/api/v1/notifications', notificationRoutes)
app.route('/api/v1/public', publicRoutes)
app.get('/api/v1/incidents/guest/quota', guestIncidentQuota)
app.post('/api/v1/incidents/guest', storeGuestIncident)
app.post('/api/v1/incidents/guest/claim', (c) => successResponse(c, {
  claimed_count: 0,
}, 'Guest reports claim is not available in the Worker API yet.'))

app.notFound((c) => errorResponse(c, 'Route not found.', {}, 404))

app.onError((error, c) => {
  console.error('Unhandled worker error.', {
    method: c.req.method,
    url: c.req.url,
    message: error instanceof Error ? error.message : String(error),
  })

  if (error instanceof Error && error.name === 'AbortError') {
    return errorResponse(c, 'Upstream request timed out.', {}, 504)
  }

  return errorResponse(c, 'Internal server error.', {}, 500)
})

export default app
