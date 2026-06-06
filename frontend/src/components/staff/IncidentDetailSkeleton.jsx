import { memo } from 'react'

const SkeletonBlock = ({ className }) => (
  <div className={`animate-pulse rounded bg-slate-100 ${className}`} />
)

const IncidentDetailSkeleton = memo(function IncidentDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 pb-8 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBlock className="h-12 w-40 rounded-xl" />
        <SkeletonBlock className="h-4 w-24" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <SkeletonBlock className="h-[250px] w-full" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-7 w-28 rounded-full" />
          <SkeletonBlock className="h-7 w-24 rounded-full" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
        <SkeletonBlock className="mt-3 h-4 w-3/4" />
        <SkeletonBlock className="mt-2 h-20 w-full" />
        <div className="mt-4 rounded-xl bg-panel p-3">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-1 h-4 w-40" />
          <SkeletonBlock className="mt-1 h-4 w-32" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <SkeletonBlock className="h-4 w-32" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SkeletonBlock className="h-48 w-full rounded-xl" />
          <SkeletonBlock className="h-48 w-full rounded-xl" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <SkeletonBlock className="h-4 w-28" />
        <div className="relative mt-3 space-y-4 border-l border-slate-200 pl-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-100" />
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="mt-1 h-3 w-48" />
              <SkeletonBlock className="mt-1 h-3 w-full" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="mt-2 h-10 w-full rounded-xl" />
        <SkeletonBlock className="mt-2 h-20 w-full rounded-xl" />
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <SkeletonBlock className="mt-2 h-10 w-full rounded-xl" />
      </section>
    </div>
  )
})

export default IncidentDetailSkeleton
