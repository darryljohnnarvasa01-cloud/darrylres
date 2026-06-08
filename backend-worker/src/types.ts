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
}

export type Bindings = {
  APP_NAME?: string
  APP_ENV?: string
  APP_KEY?: string
  FRONTEND_URL?: string
  GUEST_REPORT_LIMIT?: string
  CORS_ALLOWED_ORIGINS?: string
  DEFAULT_EMERGENCY_HOTLINE?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  GOOGLE_MAPS_API_KEY?: string
  INCIDENT_MEDIA_BUCKET?: IncidentMediaBucket
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
