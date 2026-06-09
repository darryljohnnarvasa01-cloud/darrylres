import type { AppEnv } from '../types'

export function shouldExposeAuthLinks(env: AppEnv['Bindings']) {
  return env.EXPOSE_AUTH_LINKS?.trim().toLowerCase() === 'true'
    || (env.APP_ENV ?? 'production') !== 'production'
}

export function emailDeliveryStatus(env: AppEnv['Bindings']) {
  const fromAddressConfigured = Boolean(env.MAIL_FROM_ADDRESS?.trim())
  const hasBinding = Boolean(env.EMAIL)
  const hasResend = Boolean(env.RESEND_API_KEY?.trim())
  const cloudflareReady = hasBinding && fromAddressConfigured
  const resendReady = hasResend
  const canSendEmail = cloudflareReady || resendReady
  const exposeLinks = shouldExposeAuthLinks(env)
  const ok = canSendEmail || exposeLinks

  let provider: string | null = null
  if (cloudflareReady) provider = 'cloudflare'
  else if (resendReady) provider = 'resend'
  else if (exposeLinks) provider = 'on_screen_links'

  let error: string | null = null
  if (!ok) {
    error = 'No email provider configured. Set EXPOSE_AUTH_LINKS=true for free on-screen links, or add a free RESEND_API_KEY from resend.com.'
  }

  return {
    ok,
    provider,
    can_send_email: canSendEmail,
    expose_links: exposeLinks,
    binding: hasBinding,
    resend_configured: hasResend,
    from_address_configured: fromAddressConfigured,
    error,
  }
}

export function authLinkExtras(
  env: AppEnv['Bindings'],
  key: string,
  url: string | null,
  emailSent: boolean,
) {
  if (!url || (!shouldExposeAuthLinks(env) && emailSent)) {
    return {}
  }

  return {
    [key]: url,
    auth_link_on_screen: true,
  }
}

export function logEmailDeliverySkipped(kind: 'verification' | 'password_reset', env: AppEnv['Bindings']) {
  const status = emailDeliveryStatus(env)

  if (!status.can_send_email) {
    console.warn(`Skipped ${kind} email delivery.`, status)
  }
}
