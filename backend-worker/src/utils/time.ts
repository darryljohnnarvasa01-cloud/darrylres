export function manilaDayBounds(date = new Date()) {
  const manilaOffsetMs = 8 * 60 * 60 * 1000
  const manilaNow = new Date(date.getTime() + manilaOffsetMs)
  const yyyy = manilaNow.getUTCFullYear()
  const mm = manilaNow.getUTCMonth()
  const dd = manilaNow.getUTCDate()

  const startUtc = new Date(Date.UTC(yyyy, mm, dd) - manilaOffsetMs)
  const endUtc = new Date(Date.UTC(yyyy, mm, dd + 1) - manilaOffsetMs)

  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
  }
}
