import type { SupabaseClient } from '@supabase/supabase-js'
import type { Bindings } from '../types'

const allowedMediaTypes = new Set([
  'image/jpeg',
  'image/png',
  'video/mp4',
  'video/quicktime',
])

const maxMediaSizeBytes = 10 * 1024 * 1024

function safeFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
    || 'incident-media'
}

export function validateMediaFiles(files: File[]) {
  const errors: Record<string, string[]> = {}

  if (files.length === 0) {
    errors.media = ['At least 1 photo or video is required.']
  }

  if (files.length > 5) {
    errors.media = ['You can attach up to 5 files per report.']
  }

  files.forEach((file, index) => {
    if (!allowedMediaTypes.has(file.type)) {
      errors[`media.${index}`] = ['Only JPG, PNG, MP4, and MOV files are allowed.']
    } else if (file.size > maxMediaSizeBytes) {
      errors[`media.${index}`] = ['Each file must be 10 MB or smaller.']
    }
  })

  return errors
}

export async function storeIncidentMedia({
  env,
  supabase,
  incidentId,
  files,
}: {
  env: Bindings
  supabase: SupabaseClient
  incidentId: string
  files: File[]
}) {
  const bucket = env.INCIDENT_MEDIA_BUCKET

  if (!bucket || files.length === 0) {
    return {
      stored: false,
      count: 0,
    }
  }

  const mediaRows = []

  for (const file of files) {
    const extension = safeFileName(file.name).split('.').pop()
    const path = `incidents/${incidentId}/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`

    await bucket.put(path, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
      },
    })

    mediaRows.push({
      incident_id: incidentId,
      file_path: path,
      file_type: file.type.startsWith('video/') ? 'video' : 'image',
    })
  }

  if (mediaRows.length > 0) {
    const { error } = await supabase.from('incident_media').insert(mediaRows)

    if (error) {
      console.warn('Incident media metadata insert failed.', error.message)
    }
  }

  return {
    stored: true,
    count: mediaRows.length,
  }
}
