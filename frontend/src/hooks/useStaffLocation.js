import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'

export function useStaffLocation(options = {}) {
  const {
    enableHighAccuracy = true,
    maximumAge = 30000,
    timeout = 10000,
    watch = false,
  } = options

  const [location, setLocation] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const watchIdRef = useRef(null)

  const handleSuccess = useCallback((position) => {
    setLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    })
    setError(null)
    setIsLoading(false)
  }, [])

  const handleError = useCallback((err) => {
    let message = 'Unable to retrieve your location'

    switch (err.code) {
      case err.PERMISSION_DENIED:
        message = 'Location access denied. Enable location permissions in your browser settings.'
        break
      case err.POSITION_UNAVAILABLE:
        message = 'Location information unavailable.'
        break
      case err.TIMEOUT:
        message = 'Location request timed out. Retrying...'
        break
      default:
        message = err.message || message
    }

    setError({ code: err.code, message })
    setIsLoading(false)

    if (err.code !== err.PERMISSION_DENIED) {
      toast.error(message, { id: 'staff-location-error', duration: 3000 })
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      setError({ code: -1, message: 'Geolocation is not supported by your browser' })
      setIsLoading(false)
      return undefined
    }

    setIsLoading(true)

    if (watch) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        { enableHighAccuracy, maximumAge, timeout }
      )

      return () => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
        }
      }
    }

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      { enableHighAccuracy, maximumAge, timeout }
    )

    return undefined
  }, [enableHighAccuracy, maximumAge, timeout, watch, handleSuccess, handleError])

  const refresh = useCallback(() => {
    if (!navigator.geolocation) return

    setIsLoading(true)
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      { enableHighAccuracy, maximumAge, timeout }
    )
  }, [enableHighAccuracy, maximumAge, timeout, handleSuccess, handleError])

  return {
    location,
    error,
    isLoading,
    refresh,
  }
}
