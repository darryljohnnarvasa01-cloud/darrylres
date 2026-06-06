function BrandMark({
  compact = false,
  className = '',
  imageClassName = '',
  showTagline = true,
}) {
  if (compact) {
    return (
      <div className={`flex justify-center ${className}`}>
        <img
          src="/logo.png"
          alt="RescueLink"
          className={`h-14 w-14 rounded-2xl object-contain shadow-card ${imageClassName}`}
        />
      </div>
    )
  }

  return (
    <div className={`text-center ${className}`}>
      <img
        src="/logo.png"
        alt="RescueLink"
        className={`mx-auto h-auto max-h-32 w-auto max-w-[240px] object-contain ${imageClassName}`}
      />
      {showTagline && (
        <p className="mt-2 whitespace-nowrap text-xs font-medium uppercase tracking-[0.18em] text-navy/70">
          CDRRMO Valencia City
        </p>
      )}
    </div>
  )
}

export default BrandMark
