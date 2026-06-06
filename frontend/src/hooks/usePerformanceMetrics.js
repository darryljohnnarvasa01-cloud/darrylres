import { useEffect, useRef, useState, useCallback } from 'react'

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState({
    lcp: null,
    fid: null,
    cls: null,
    fcp: null,
    ttfb: null,
  })
  const observersRef = useRef([])

  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return undefined
    }

    const newMetrics = { ...metrics }

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        if (lastEntry) {
          newMetrics.lcp = Math.round(lastEntry.startTime)
          setMetrics({ ...newMetrics })
        }
      })
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
      observersRef.current.push(lcpObserver)
    } catch {
      // LCP not supported
    }

    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const firstEntry = entries[0]
        if (firstEntry) {
          newMetrics.fid = Math.round(firstEntry.processingStart - firstEntry.startTime)
          setMetrics({ ...newMetrics })
        }
      })
      fidObserver.observe({ entryTypes: ['first-input'] })
      observersRef.current.push(fidObserver)
    } catch {
      // FID not supported
    }

    try {
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value
          }
        })
        newMetrics.cls = Math.round(clsValue * 1000) / 1000
        setMetrics({ ...newMetrics })
      })
      clsObserver.observe({ entryTypes: ['layout-shift'] })
      observersRef.current.push(clsObserver)
    } catch {
      // CLS not supported
    }

    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const firstEntry = entries[0]
        if (firstEntry) {
          newMetrics.fcp = Math.round(firstEntry.startTime)
          setMetrics({ ...newMetrics })
        }
      })
      fcpObserver.observe({ entryTypes: ['paint'] })
      observersRef.current.push(fcpObserver)
    } catch {
      // Paint not supported
    }

    if (performance && performance.timing) {
      const timing = performance.timing
      const ttfb = timing.responseStart - timing.requestStart
      if (ttfb > 0) {
        newMetrics.ttfb = ttfb
        setMetrics({ ...newMetrics })
      }
    }

    return () => {
      observersRef.current.forEach((observer) => {
        try {
          observer.disconnect()
        } catch {
          // Ignore
        }
      })
      observersRef.current = []
    }
  }, [])

  const logMetrics = useCallback(() => {
    console.table(metrics)
    return metrics
  }, [metrics])

  return { metrics, logMetrics }
}

export function usePageLoadTime(pageName) {
  const startTimeRef = useRef(performance.now())

  useEffect(() => {
    const startTime = startTimeRef.current

    return () => {
      const duration = Math.round(performance.now() - startTime)

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Performance] ${pageName} duration: ${duration}ms`)
      }

      if (window.gtag) {
        window.gtag('event', 'page_duration', {
          page_name: pageName,
          duration,
        })
      }
    }
  }, [pageName])
}

export function useRenderCount(componentName) {
  const renderCount = useRef(0)

  useEffect(() => {
    renderCount.current += 1

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Render] ${componentName} rendered ${renderCount.current} times`)
    }
  })

  return renderCount.current
}

export function useInteractionTiming(interactionName) {
  const startTimeRef = useRef(null)

  const start = useCallback(() => {
    startTimeRef.current = performance.now()
  }, [])

  const end = useCallback(() => {
    if (startTimeRef.current) {
      const duration = Math.round(performance.now() - startTimeRef.current)

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Interaction] ${interactionName}: ${duration}ms`)
      }

      startTimeRef.current = null
      return duration
    }
    return null
  }, [interactionName])

  return { start, end }
}
