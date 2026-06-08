import { Hono } from 'hono'
import { requireAuth } from '../services/auth'
import type { AppEnv } from '../types'
import { successResponse } from '../utils/apiResponse'

const notificationRoutes = new Hono<AppEnv>()

notificationRoutes.get('/unread-count', requireAuth, async (c) => {
  const auth = c.get('auth')
  let query = auth.supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)

  if (auth.user.role !== 'admin') {
    query = query.eq('user_id', auth.user.id)
  }

  const { count, error } = await query

  if (error) {
    console.warn('Unread notification count failed.', error.message)
  }

  return successResponse(c, {
    count: count ?? 0,
  }, 'Unread notification count retrieved successfully.')
})

notificationRoutes.get('/', requireAuth, async (c) => {
  const auth = c.get('auth')
  let query = auth.supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  if (auth.user.role !== 'admin') {
    query = query.eq('user_id', auth.user.id)
  }

  const { data, error } = await query

  if (error) {
    console.warn('Notification list failed.', error.message)
  }

  return successResponse(c, {
    notifications: data ?? [],
  }, 'Notifications retrieved successfully.')
})

notificationRoutes.patch('/read-all', requireAuth, async (c) => {
  const auth = c.get('auth')
  const query = auth.supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)

  const { error } = auth.user.role === 'admin'
    ? await query
    : await query.eq('user_id', auth.user.id)

  if (error) {
    console.warn('Mark all notifications read failed.', error.message)
  }

  return successResponse(c, {}, 'Notifications marked as read.')
})

notificationRoutes.patch('/:id/read', requireAuth, async (c) => {
  const auth = c.get('auth')
  const query = auth.supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', c.req.param('id'))

  const { error } = auth.user.role === 'admin'
    ? await query
    : await query.eq('user_id', auth.user.id)

  if (error) {
    console.warn('Mark notification read failed.', error.message)
  }

  return successResponse(c, {}, 'Notification marked as read.')
})

export default notificationRoutes
