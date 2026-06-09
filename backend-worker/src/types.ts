export type IncidentMediaBucket = {
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: {
      httpMetadata?: {
        contentType?: string
      }
    },
  ) => Promise<unknown>
  delete?: (key: string) => Promise<unknown>
}

export type SendEmailBinding = {
  send: (message: Record<string, unknown>) => Promise<unknown>
}

export type Bindings = {
  APP_NAME?: string
  APP_ENV?: string
  APP_KEY?: string
  FRONTEND_URL?: string
  MAIL_FROM_ADDRESS?: string
  MAIL_FROM_NAME?: string
  RESEND_API_KEY?: string
  EXPOSE_AUTH_LINKS?: string
  PASSWORD_RESET_EXPIRES_MINUTES?: string
  GUEST_REPORT_LIMIT?: string
  CORS_ALLOWED_ORIGINS?: string
  DEFAULT_EMERGENCY_HOTLINE?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  GOOGLE_MAPS_API_KEY?: string
  INCIDENT_MEDIA_BUCKET?: IncidentMediaBucket
  GOVERNMENT_ID_BUCKET?: IncidentMediaBucket
  EMAIL?: SendEmailBinding
}

export type AppEnv = {
  Bindings: Bindings
  Variables: {
    auth: {
      supabase: import('@supabase/supabase-js').SupabaseClient
      tokenId: string | number
      user: Record<string, any>
    }
  }
}
