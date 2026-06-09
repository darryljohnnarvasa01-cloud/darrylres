import type { AppEnv } from '../types'

export type TransactionalEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

function resolveFromAddress(env: AppEnv['Bindings']) {
  const configured = env.MAIL_FROM_ADDRESS?.trim()
  if (configured) return configured
  if (env.RESEND_API_KEY?.trim()) return 'onboarding@resend.dev'
  return null
}

function resolveFromName(env: AppEnv['Bindings']) {
  return env.MAIL_FROM_NAME?.trim() || env.APP_NAME?.trim() || 'RescueLink'
}

async function sendViaCloudflare(
  env: AppEnv['Bindings'],
  fromEmail: string,
  fromName: string,
  message: TransactionalEmailInput,
) {
  if (!env.EMAIL || !env.MAIL_FROM_ADDRESS?.trim()) {
    return false
  }

  await env.EMAIL.send({
    to: message.to,
    from: { email: fromEmail, name: fromName },
    subject: message.subject,
    html: message.html,
    text: message.text,
  })

  return true
}

async function sendViaResend(
  env: AppEnv['Bindings'],
  fromEmail: string,
  fromName: string,
  message: TransactionalEmailInput,
) {
  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) return false

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error('Resend email failed.', { status: response.status, body })
    return false
  }

  return true
}

export async function sendTransactionalEmail(env: AppEnv['Bindings'], message: TransactionalEmailInput) {
  const fromEmail = resolveFromAddress(env)
  const fromName = resolveFromName(env)

  if (!fromEmail) {
    return false
  }

  try {
    if (await sendViaCloudflare(env, fromEmail, fromName, message)) {
      return true
    }
  } catch (error) {
    console.error('Cloudflare email send failed.', error)
  }

  try {
    return await sendViaResend(env, fromEmail, fromName, message)
  } catch (error) {
    console.error('Resend email send failed.', error)
    return false
  }
}
