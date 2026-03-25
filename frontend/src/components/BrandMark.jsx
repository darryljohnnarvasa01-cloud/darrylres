function BrandMark({ compact = false }) {
  if (compact) {
    return (
      <div className="flex justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-card">
          RL
        </div>
      </div>
    )
  }

  return (
    <div className="text-center">
      <p className="font-heading text-4xl italic text-danger">RescueLink</p>
      <p className="whitespace-nowrap text-xs font-medium uppercase tracking-[0.18em] text-navy/70">
        CDRRMO Valencia City
      </p>
    </div>
  )
}

export default BrandMark
