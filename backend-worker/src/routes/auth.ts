import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import { compare, hash } from 'bcryptjs'
import {
  createAccessToken,
  findUserByEmail,
  requireAuth,
  serializeUser,
  verifyPassword,
} from '../services/auth'
import { authLinkExtras, emailDeliveryStatus, logEmailDeliverySkipped, shouldExposeAuthLinks } from '../services/emailDelivery'
import { sendTransactionalEmail } from '../services/sendTransactionalEmail'
import { getSupabase } from '../services/supabase'
import type { AppEnv } from '../types'
import { errorResponse, successResponse } from '../utils/apiResponse'

const authRoutes = new Hono<AppEnv>()
type AuthContext = Context<AppEnv>

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const registerSchema = z.object({
  full_name: z.string().trim().min(1).max(255),
  email: z.string().email().max(255),
  password: z.string().min(8),
  password_confirmation: z.string().min(1),
  phone: z.string().trim().min(1).max(30),
  address: z.string().trim().min(1).max(500),
  barangay: z.string().trim().min(1).max(255),
}).refine((data) => data.password === data.password_confirmation, {
  path: ['password_confirmation'],
})

const govIdTypes = new Set(['image/jpeg', 'image/png'])

function formValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

type GovIdStoreResult =
  | { ok: true; path: string | null }
  | { ok: false; status: ContentfulStatusCode; message: string }

async function storeGovIdImage(c: AuthContext, file: File | null): Promise<GovIdStoreResult> {
  if (!file) return { ok: true as const, path: null }
  if (!govIdTypes.has(file.type)) return { ok: false as const, status: 422, message: 'Government ID image must be a JPG or PNG file.' }
  if (file.size > 5 * 1024 * 1024) return { ok: false as const, status: 422, message: 'Government ID image must be 5 MB or smaller.' }

  const bucket = c.env.GOVERNMENT_ID_BUCKET
  if (!bucket) return { ok: true as const, path: null }

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `gov_ids/${crypto.randomUUID()}.${ext}`

  try {
    await bucket.put(path, file.stream(), { httpMetadata: { contentType: file.type } })
    return { ok: true as const, path }
  } catch {
    return { ok: false as const, status: 503, message: 'Government ID upload is temporarily unavailable.' }
  }
}

const verifyEmailSchema = z.object({
  token: z.string().min(1),
})

const resendVerificationSchema = z.object({
  email: z.string().email(),
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

function buildVerificationUrl(c: AuthContext, token: string) {
  return `${configuredFrontendUrl(c)}/verify-email?token=${encodeURIComponent(token)}`
}

function wantsHtmlRedirect(c: AuthContext) {
  const accept = c.req.header('Accept') ?? ''
  return accept.includes('text/html') && !accept.includes('application/json')
}

function passwordResetMinutes(env: AppEnv['Bindings']) {
  const value = Number(env.PASSWORD_RESET_EXPIRES_MINUTES || 60)

  return Number.isFinite(value) && value > 0 ? value : 60
}

function emailVerificationMinutes() {
  return 30
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

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return atob(normalized + padding)
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

async function hmacBase64Url(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))
}

async function createEmailVerificationToken(env: AppEnv['Bindings'], email: string) {
  const secret = env.APP_KEY?.trim()
  if (!secret) throw new Error('APP_KEY is required for email verification.')
  const payload = base64UrlEncode(JSON.stringify({ email, exp: Date.now() + emailVerificationMinutes() * 60 * 1000 }))
  return `${payload}.${await hmacBase64Url(secret, payload)}`
}

async function resolveEmailVerificationToken(env: AppEnv['Bindings'], token: string) {
  const [payload, signature] = token.split('.', 2)
  const secret = env.APP_KEY?.trim()
  if (!payload || !signature || !secret) return null
  const expected = await hmacBase64Url(secret, payload)
  if (!timingSafeEqual(signature, expected)) return null
  const parsed = z.object({ email: z.string().email(), exp: z.number() }).safeParse(JSON.parse(base64UrlDecode(payload)))
  if (!parsed.success || parsed.data.exp < Date.now()) return null
  return parsed.data.email.trim().toLowerCase()
}

async function sendVerificationEmail(env: AppEnv['Bindings'], email: string, verifyUrl: string) {
  const appName = env.APP_NAME?.trim() || 'RescueLink'
  const safeVerifyUrl = escapeHtml(verifyUrl)
  const sent = await sendTransactionalEmail(env, {
    to: email,
    subject: `${appName} email verification`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><h1 style="font-size:20px;margin:0 0 12px">Verify your email</h1><p>Use this secure link to verify your RescueLink account:</p><p><a href="${safeVerifyUrl}">${safeVerifyUrl}</a></p><p>This link expires in ${emailVerificationMinutes()} minutes.</p></div>`,
    text: [`${appName} email verification`, '', `Use this secure link to verify your RescueLink account: ${verifyUrl}`, '', `This link expires in ${emailVerificationMinutes()} minutes.`].join('\n'),
  })

  if (!sent) logEmailDeliverySkipped('verification', env)
  return sent
}

async function sendPasswordResetEmail(env: AppEnv['Bindings'], email: string, resetUrl: string) {
  const appName = env.APP_NAME?.trim() || 'RescueLink'
  const safeResetUrl = escapeHtml(resetUrl)
  const sent = await sendTransactionalEmail(env, {
    to: email,
    subject: `${appName} password reset`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><h1 style="font-size:20px;margin:0 0 12px">${appName} password reset</h1><p>Use this secure link to set a new password:</p><p><a href="${safeResetUrl}">${safeResetUrl}</a></p><p>This link expires in ${passwordResetMinutes(env)} minutes. Ignore this email if you did not request it.</p></div>`,
    text: [
      `${appName} password reset`,
      '',
      `Use this secure link to set a new password: ${resetUrl}`,
      '',
      `This link expires in ${passwordResetMinutes(env)} minutes. Ignore this email if you did not request it.`,
    ].join('\n'),
  })

  if (!sent) logEmailDeliverySkipped('password_reset', env)
  return sent
}

function withMailStatus(c: AuthContext, extra: Record<string, unknown> = {}) {
  const mail = emailDeliveryStatus(c.env)

  return {
    ...extra,
    mail_configured: mail.ok,
    ...(mail.ok ? {} : { mail_error: mail.error }),
  }
}

function genericForgotPasswordResponse(c: AuthContext, extra: Record<string, unknown> = {}) {
  return successResponse(c, withMailStatus(c, extra), 'If that email exists, a password reset link has been sent.')
}

function genericVerificationResponse(c: AuthContext, extra: Record<string, unknown> = {}) {
  return successResponse(c, withMailStatus(c, extra), 'If that account exists and is not yet verified, a verification email has been sent.')
}

authRoutes.post('/register', async (c) => {
  const supabase = getSupabase(c.env)
  if (!supabase) return errorResponse(c, 'Supabase credentials are not configured.', {}, 503)

  const formData = await c.req.formData().catch(() => null)
  if (!formData) return errorResponse(c, 'Validation failed.', { gov_id_image: ['Government ID image is required.'] })

  const parsed = registerSchema.safeParse({
    full_name: formValue(formData, 'full_name'),
    email: formValue(formData, 'email'),
    password: formValue(formData, 'password'),
    password_confirmation: formValue(formData, 'password_confirmation'),
    phone: formValue(formData, 'phone'),
    address: formValue(formData, 'address'),
    barangay: formValue(formData, 'barangay'),
  })

  if (!parsed.success) {
    return errorResponse(c, 'Validation failed.', parsed.error.flatten().fieldErrors)
  }

  const govIdUpload = formData.get('gov_id_image')
  const govIdImage = govIdUpload instanceof File && govIdUpload.size > 0 ? govIdUpload : null

  const email = parsed.data.email.trim().toLowerCase()
  if (await findUserByEmail(supabase, email)) {
    return errorResponse(c, 'Validation failed.', { email: ['The email has already been taken.'] })
  }

  const storedGovId = await storeGovIdImage(c, govIdImage)
  if (storedGovId.ok === false) {
    const { message, status } = storedGovId
    return errorResponse(c, message, { gov_id_image: [message] }, status)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase  
    .from('users')
    .insert({
      id: crypto.randomUUID(),
      full_name: parsed.data.full_name.trim(),
      email,
      password: await hash(parsed.data.password, 10),
      phone: parsed.data.phone.trim(),
      address: parsed.data.address.trim(),
      barangay: parsed.data.barangay.trim(),
      role: 'citizen',
      status: 'pending',
      gov_id_image_path: storedGovId.path,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) throw error

  let verificationUrl: string | null = null
  let verificationEmailSent = false

  try {
    const token = await createEmailVerificationToken(c.env, email)
    verificationUrl = buildVerificationUrl(c, token)
    verificationEmailSent = await sendVerificationEmail(c.env, email, verificationUrl)
  } catch (verificationError) {
    console.error('Failed to prepare verification email', verificationError)
  }

  const mail = emailDeliveryStatus(c.env)
  const message = verificationEmailSent
    ? 'Registration submitted. Check your email to verify your account and await admin approval.'
    : mail.expose_links
      ? 'Registration submitted. Use the verification link below, then await admin approval.'
      : 'Registration submitted. Check your email to verify your account and await admin approval.'

  return successResponse(c, withMailStatus(c, {
    id: data.id,
    verification_email_sent: verificationEmailSent,
    ...authLinkExtras(c.env, 'verification_url', verificationUrl, verificationEmailSent),
    ...(!verificationEmailSent && !mail.can_send_email ? { mail_error: mail.error } : {}),
  }), message, 201)
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
    let verificationUrl: string | null = null

    try {
      const token = await createEmailVerificationToken(c.env, user.email)
      verificationUrl = buildVerificationUrl(c, token)
    } catch (verificationError) {
      console.error('Failed to create verification token during login.', verificationError)
    }

    return errorResponse(
      c,
      shouldExposeAuthLinks(c.env)
        ? 'Email is not verified. Open the verification link below, then sign in again.'
        : 'Email is not verified. Request a new verification email to continue.',
      { email: ['Email is not verified.'] },
      403,
      {
        email_not_verified: true,
        ...authLinkExtras(c.env, 'verification_url', verificationUrl, false),
      },
    )
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

  if (user.role === 'citizen' && !user.phone_verified_at && !shouldExposeAuthLinks(c.env)) {
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

authRoutes.get('/verify-email', async (c) => {
  const queryToken = c.req.query('token')

  if (wantsHtmlRedirect(c)) {
    const frontendBase = `${configuredFrontendUrl(c)}/verify-email`

    if (queryToken) {
      return c.redirect(`${frontendBase}?token=${encodeURIComponent(queryToken)}`, 302)
    }

    return c.redirect(`${frontendBase}?status=missing`, 302)
  }

  const parsed = verifyEmailSchema.safeParse({ token: queryToken })
  if (!parsed.success) return errorResponse(c, 'The verification link is invalid or has expired.', { token: ['The verification token is invalid.'] }, 422)

  const supabase = getSupabase(c.env)
  if (!supabase) return errorResponse(c, 'Supabase credentials are not configured.', {}, 503)

  const email = await resolveEmailVerificationToken(c.env, parsed.data.token)
  if (!email) return errorResponse(c, 'The verification link is invalid or has expired.', { token: ['The verification token is invalid.'] }, 422)

  const user = await findUserByEmail(supabase, email)
  if (!user || user.deleted_at) return errorResponse(c, 'The verification link is invalid or has expired.', { token: ['The verification token is invalid.'] }, 422)
  if (user.email_verified_at) return successResponse(c, { verified: true, already_verified: true }, 'Email already verified.')

  const now = new Date().toISOString()
  const { error } = await supabase.from('users').update({ email_verified_at: now, updated_at: now }).eq('id', user.id)
  if (error) throw error

  return successResponse(c, { verified: true }, 'Email verified successfully. You can now sign in.')
})

authRoutes.post('/resend-verification-email', async (c) => {
  const parsed = resendVerificationSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return errorResponse(c, 'Validation failed.', { email: ['Enter a valid email address.'] }, 422)

  const supabase = getSupabase(c.env)
  if (!supabase) return errorResponse(c, 'Supabase credentials are not configured.', {}, 503)

  const email = parsed.data.email.trim().toLowerCase()
  const user = await findUserByEmail(supabase, email)
  const extra: Record<string, unknown> = {}
  if (!user || user.deleted_at || user.email_verified_at) return genericVerificationResponse(c, extra)

  let verificationUrl: string | null = null

  try {
    const token = await createEmailVerificationToken(c.env, email)
    verificationUrl = buildVerificationUrl(c, token)
    const emailSent = await sendVerificationEmail(c.env, email, verificationUrl)
    extra.email_sent = emailSent
    Object.assign(extra, authLinkExtras(c.env, 'verification_url', verificationUrl, emailSent))
  } catch (sendError) {
    console.error('Failed to send verification email', sendError)
    extra.email_sent = false
    Object.assign(extra, authLinkExtras(c.env, 'verification_url', verificationUrl, false))
  }

  return genericVerificationResponse(c, extra)
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
    devExtra.email_sent = emailSent
    Object.assign(devExtra, authLinkExtras(c.env, 'reset_url', resetUrl, emailSent))
  } catch (error) {
    console.error('Failed to send password reset email', error)
    devExtra.email_sent = false
    Object.assign(devExtra, authLinkExtras(c.env, 'reset_url', resetUrl, false))
  }

  const mail = emailDeliveryStatus(c.env)
  const message = devExtra.email_sent
    ? 'If that email exists, a password reset link has been sent.'
    : mail.expose_links
      ? 'If that email exists, use the password reset link below.'
      : 'If that email exists, a password reset link has been sent.'

  return successResponse(c, withMailStatus(c, devExtra), message)
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
