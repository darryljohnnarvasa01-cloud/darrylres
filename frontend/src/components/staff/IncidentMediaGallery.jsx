import { memo, useState, useCallback } from 'react'
import { X, ZoomIn } from 'lucide-react'

const IncidentMediaGallery = memo(function IncidentMediaGallery({ media = [] }) {
  const [lightboxImage, setLightboxImage] = useState(null)

  const openLightbox = useCallback((url) => {
    setLightboxImage(url)
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxImage(null)
  }, [])

  if (!media?.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <p className="text-sm font-semibold text-navy">Evidence Media</p>
        <p className="mt-2 text-sm text-slate-500">No uploaded evidence.</p>
      </section>
    )
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <p className="text-sm font-semibold text-navy">Evidence Media</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {media.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-panel"
            >
              {item.file_type === 'video' ? (
                <video
                  src={item.file_url}
                  controls
                  className="h-48 w-full bg-black object-cover"
                  preload="metadata"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => openLightbox(item.file_url)}
                  className="relative block h-48 w-full"
                >
                  <img
                    src={item.file_url}
                    alt="Incident evidence"
                    className="h-48 w-full object-cover transition group-hover:scale-105"
                    loading="lazy"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-navy/0 transition group-hover:bg-navy/30">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100" />
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 p-4"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Incident evidence enlarged"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
})

export default IncidentMediaGallery
