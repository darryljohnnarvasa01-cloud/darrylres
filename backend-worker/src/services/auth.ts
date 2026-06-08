import { compare } from 'bcryptjs'
import type { Context, MiddlewareHandler } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'
import type { AppEnv } from '../types'
import { errorResponse } from '../utils/apiResponse'

const adminAbilities = [
  'view-dashboard',
  'manage-users',
  'manage-roles',
  'manage-incidents',
  'view-analytics',
  'view-reports',
  'manage-iot',
  'broadcast-messages',
  'edit-system-settings',
  'delete-records',
]

export type AuthUser = Record<string, any>

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function tokenExpiresAt() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  return expiresAt.toISOString()
}

function defaultAdminPermissionMap() {
  return Object.fromEntries(adminAbilities.map((ability) => [ability, true]))
}

function permissionMap(user: AuthUser) {
  if (user.role !== 'admin') {
    return {}
  }

  const stored = typeof user.role_permissions === 'object' && user.role_permissions
    ? user.role_permissions
    : {}

  if (Object.keys(stored).length === 0) {
    return defaultAdminPermissionMap()
  }

  return Object.fromEntries(
    adminAbilities.map((ability) => [ability, Boolean(stored[ability])]),
  )
}

function clientRole(user: AuthUser) {
  return String(user.role || 'citizen')
}

export function serializeUser(user: AuthUser) {
  const permissions = permissionMap(user)

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    barangay: user.barangay,
    role: clientRole(user),
    actual_role: user.role,
    admin_role: null,
    status: user.status,
    blocked_at: user.blocked_at,
    blocked_reason: user.blocked_reason,
    email_verified_at: user.email_verified_at,
    phone_verified_at: user.phone_verified_at,
    current_latitude: user.current_latitude,
    current_longitude: user.current_longitude,
    location_updated_at: user.location_updated_at,
    availability_status: user.availability_status || 'available',
    availability_updated_at: user.availability_updated_at,
    permissions: Object.entries(permissions)
      .filter(([, allowed]) => allowed)
      .map(([ability]) => ability),
    permission_map: permissions,
    is_volunteer: Boolean(user.is_volunteer),
    volunteer_skills: Array.isArray(user.volunteer_skills) ? user.volunteer_skills : [],
    volunteer_availability: Boolean(user.volunteer_availability),
  }
}

export async function findUserByEmail(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email.trim())
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as AuthUser | null
}

export async function verifyPassword(password: string, hash: string) {
  // Laravel bcrypt hashes may use $2y$; bcryptjs accepts the equivalent $2a$ form.
  const normalizedHash = hash.replace(/^\$2y\$/, '$2a$')

  return compare(password, normalizedHash)
}

export async function createAccessToken(supabase: SupabaseClient, userId: string) {
  const plainToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const hashedToken = await sha256Hex(plainToken)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .insert({
      tokenable_type: 'App\\Models\\User',
      tokenable_id: userId,
      name: 'auth_token',
      token: hashedToken,
      abilities: '["*"]',
      expires_at: tokenExpiresAt(),
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return `${data.id}|${plainToken}`
}

export async function resolveBearerToken(c: Context<AppEnv>) {
  const supabase = getSupabase(c.env)

  if (!supabase) {
    return null
  }

  const header = c.req.header('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return null
  }

  const [tokenId, plainToken] = token.includes('|')
    ? token.split('|', 2)
    : ['', token]
  const hashedToken = await sha256Hex(plainToken)
  let query = supabase
    .from('personal_access_tokens')
    .select('id,tokenable_id,expires_at')
    .eq('token', hashedToken)

  if (tokenId) {
    query = query.eq('id', tokenId)
  }

  const { data, error } = await query.maybeSingle()

  if (error || !data) {
    return null
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return null
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.tokenable_id)
    .maybeSingle()

  if (userError || !user || user.deleted_at) {
    return null
  }

  await supabase
    .from('personal_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    supabase,
    tokenId: data.id,
    user: user as AuthUser,
  }
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = await resolveBearerToken(c)

  if (!auth) {
    return errorResponse(c, 'Unauthenticated.', {}, 401)
  }

  c.set('auth', auth)
  await next()
}
