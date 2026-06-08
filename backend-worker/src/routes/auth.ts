import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { compare, hash } from 'bcryptjs'
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
type AuthContext = Context<AppEnv>

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(32),
  password: z.string().min(8),
  password_confirmation: z.string().min(1),
}).refine((data) => data.password === data.password_confirmation, {
  path: ['password_confirmation'],
})

function configuredFrontendUrl(c: AuthContext) {
  const configured = c.env.FRONTEND_URL?.trim()

  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  const url = new URL(c.req.url)

  return `${url.protocol}//${url.host}`
}

function passwordResetMinutes(env: AppEnv['Bindings']) {
  const value = Number(env.PASSWORD_RESET_EXPIRES_MINUTES || 60)

  return Number.isFinite(value) && value > 0 ? value : 60
}

function generateResetToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
}

function normalizeBcryptHash(value: string) {
  return value.replace(/^\$2y\$/, '$2a$')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

async function sendPasswordResetEmail(
  env: AppEnv['Bindings'],
  email: string,
  resetUrl: string,
) {
  const fromEmail = env.MAIL_FROM_ADDRESS?.trim()
  const fromName = env.MAIL_FROM_NAME?.trim() || env.APP_NAME?.trim() || 'RescueLink'

  if (!env.EMAIL || !fromEmail) {
    return false
  }

  const safeResetUrl = escapeHtml(resetUrl)
  const appName = escapeHtml(env.APP_NAME?.trim() || 'RescueLink')

  await env.EMAIL.send({
    to: email,
    from: { email: fromEmail, name: fromName },
    subject: `${appName} password reset`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h1 style="font-size:20px;margin:0 0 12px">${appName} password reset</h1>
        <p>Use this secure link to set a new password:</p>
        <p><a href="${safeResetUrl}">${safeResetUrl}</a></p>
        <p>This link expires in ${passwordResetMinutes(env)} minutes. Ignore this email if you did not request it.</p>
      </div>
    `,
    text: [
      `${appName} password reset`,
      '',
      `Use this secure link to set a new password: ${resetUrl}`,
      '',
      `This link expires in ${passwordResetMinutes(env)} minutes. Ignore this email if you did not request it.`,
    ].join('\n'),
  })

  return true
}

function genericForgotPasswordResponse(c: AuthContext, extra: Record<string, unknown> = {}) {
  return successResponse(c, extra, 'If that email exists, a password reset link has been sent.')
}

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

authRoutes.post('/forgot-password', async (c) => {
  const parsed = forgotPasswordSchema.safeParse(await c.req.json().catch(() => ({})))

  if (!parsed.success) {
    return errorResponse(c, 'Validation failed.', {
      email: ['Enter a valid email address.'],
    }, 422)
  }

  const supabase = getSupabase(c.env)

  if (!supabase) {
    return errorResponse(c, 'Supabase credentials are not configured.', {}, 503)
  }

  const email = parsed.data.email.trim().toLowerCase()
  const user = await findUserByEmail(supabase, email)
  const devExtra: Record<string, unknown> = {}

  if (!user || user.deleted_at) {
    return genericForgotPasswordResponse(c, devExtra)
  }

  const token = generateResetToken()
  const resetUrl = `${configuredFrontendUrl(c)}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  const now = new Date().toISOString()
  const hashedToken = await hash(token, 10)

  const { error } = await supabase
    .from('password_reset_tokens')
    .upsert({
      email,
      token: hashedToken,
      created_at: now,
    }, {
      onConflict: 'email',
    })

  if (error) {
    throw error
  }

  try {
    const emailSent = await sendPasswordResetEmail(c.env, user.email, resetUrl)

    if (c.env.APP_ENV !== 'production') {
      devExtra.email_sent = emailSent
      devExtra.reset_url = resetUrl
    }
  } catch (error) {
    console.error('Failed to send password reset email', error)

    if (c.env.APP_ENV !== 'production') {
      devExtra.email_sent = false
      devExtra.reset_url = resetUrl
    }
  }

  return genericForgotPasswordResponse(c, devExtra)
})

authRoutes.post('/reset-password', async (c) => {
  const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => ({})))

  if (!parsed.success) {
    return errorResponse(c, 'Validation failed.', {
      email: ['Enter a valid email address.'],
      token: ['The reset token is invalid.'],
      password: ['Password must be at least 8 characters.'],
      password_confirmation: ['Password confirmation must match.'],
    }, 422)
  }

  const supabase = getSupabase(c.env)

  if (!supabase) {
    return errorResponse(c, 'Supabase credentials are not configured.', {}, 503)
  }

  const email = parsed.data.email.trim().toLowerCase()
  const user = await findUserByEmail(supabase, email)

  if (!user || user.deleted_at) {
    return errorResponse(c, 'This password reset link is invalid or has expired.', {
      token: ['The reset token is invalid.'],
    }, 422)
  }

  const { data: resetToken, error } = await supabase
    .from('password_reset_tokens')
    .select('email,token,created_at')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!resetToken?.token || !resetToken.created_at) {
    return errorResponse(c, 'This password reset link is invalid or has expired.', {
      token: ['The reset token is invalid.'],
    }, 422)
  }

  const createdAt = new Date(resetToken.created_at).getTime()
  const expiresAt = createdAt + passwordResetMinutes(c.env) * 60 * 1000
  const tokenMatches = await compare(parsed.data.token, normalizeBcryptHash(resetToken.token))

  if (!Number.isFinite(createdAt) || expiresAt < Date.now() || !tokenMatches) {
    return errorResponse(c, 'This password reset link is invalid or has expired.', {
      token: ['The reset token is invalid.'],
    }, 422)
  }

  const now = new Date().toISOString()
  const hashedPassword = await hash(parsed.data.password, 10)

  const { error: updateError } = await supabase
    .from('users')
    .update({
      password: hashedPassword,
      updated_at: now,
    })
    .eq('id', user.id)

  if (updateError) {
    throw updateError
  }

  await supabase
    .from('password_reset_tokens')
    .delete()
    .eq('email', email)

  await supabase
    .from('personal_access_tokens')
    .delete()
    .eq('tokenable_id', user.id)

  return successResponse(c, {}, 'Password reset successfully. You can now sign in.')
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
