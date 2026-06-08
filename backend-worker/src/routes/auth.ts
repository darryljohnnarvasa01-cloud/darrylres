import { Hono } from 'hono'
import { z } from 'zod'
import {
  createAccessToken,
  findUserByEmail,
  requireAuth,
  serializeUser,
  verifyPassword,
} from '../services/auth'
import { getSupabase } from '../services/supabase'
import type { AppEnv } from '../types'
import { errorResponse, successResponse } from '../utils/apiResponse'

const authRoutes = new Hono<AppEnv>()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

authRoutes.post('/login', async (c) => {
  const supabase = getSupabase(c.env)

  if (!supabase) {
    return errorResponse(c, 'Supabase credentials are not configured.', {}, 503)
  }

  const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})))

  if (!parsed.success) {
    return errorResponse(c, 'Validation failed.', {
      email: ['Enter a valid email address.'],
      password: ['Password is required.'],
    }, 422)
  }

  const user = await findUserByEmail(supabase, parsed.data.email)

  if (!user || !await verifyPassword(parsed.data.password, user.password)) {
    return errorResponse(c, 'Invalid credentials.', {
      email: ['The provided credentials are incorrect.'],
    }, 401)
  }

  if (user.role === 'citizen' && !user.email_verified_at) {
    return errorResponse(c, 'Email is not verified. Check your email for the OTP.', {
      email: ['Email is not verified.'],
    }, 403)
  }

  if (user.role === 'citizen' && user.status === 'pending') {
    return errorResponse(c, 'Account is pending approval.', {}, 403)
  }

  if (user.role === 'citizen' && user.status === 'rejected') {
    return errorResponse(c, `Account was rejected: ${user.rejection_reason || 'No reason provided.'}`, {}, 403)
  }

  if (user.role === 'citizen' && user.blocked_at) {
    return errorResponse(c, `Account is blocked: ${user.blocked_reason || 'No reason provided.'}`, {}, 403)
  }

  if (user.role === 'citizen' && !user.phone_verified_at) {
    return errorResponse(c, 'Phone number is not verified. Request an SMS OTP to continue.', {
      phone: ['Phone number is not verified.'],
    }, 403)
  }

  const token = await createAccessToken(supabase, user.id)

  return successResponse(c, {
    user: serializeUser(user),
    token,
    role: serializeUser(user).role,
  }, 'Login successful.')
})

authRoutes.get('/me', requireAuth, (c) => {
  const auth = c.get('auth')
  const user = serializeUser(auth.user)

  return successResponse(c, {
    user,
    role: user.role,
  }, 'Authenticated user retrieved successfully.')
})

authRoutes.post('/logout', requireAuth, async (c) => {
  const auth = c.get('auth')

  await auth.supabase
    .from('personal_access_tokens')
    .delete()
    .eq('id', auth.tokenId)

  return successResponse(c, {}, 'Logged out successfully.')
})

export default authRoutes
