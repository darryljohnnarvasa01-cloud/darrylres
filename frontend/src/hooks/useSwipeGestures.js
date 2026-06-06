import { useState, useCallback, useRef } from 'react'

export function useSwipeGestures({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  preventDefault = true,
} = {}) {
  const [swipe, setSwipe] = useState(null)
  const touchStart = useRef(null)
  const touchEnd = useRef(null)

  const minSwipeDistance = threshold

  const onTouchStart = useCallback(
    (e) => {
      if (preventDefault) {
        // Only prevent default for horizontal swipes to avoid blocking scroll
      }
      touchEnd.current = null
      touchStart.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
      }
    },
    [preventDefault]
  )

  const onTouchMove = useCallback(
    (e) => {
      touchEnd.current = {
        x: e.targetTouches[0].clientX,
        y: e.targetTouches[0].clientY,
      }

      if (touchStart.current && preventDefault) {
        const deltaX = touchEnd.current.x - touchStart.current.x
        const deltaY = touchEnd.current.y - touchStart.current.y

        // Prevent default only for horizontal swipes
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
          e.preventDefault()
        }
      }
    },
    [preventDefault]
  )

  const onTouchEnd = useCallback(() => {
    if (!touchStart.current || !touchEnd.current) return

    const distanceX = touchEnd.current.x - touchStart.current.x
    const distanceY = touchEnd.current.y - touchStart.current.y
    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY)

    if (isHorizontalSwipe && Math.abs(distanceX) > minSwipeDistance) {
      if (distanceX > 0) {
        setSwipe('right')
        onSwipeRight?.()
      } else {
        setSwipe('left')
        onSwipeLeft?.()
      }
    } else if (!isHorizontalSwipe && Math.abs(distanceY) > minSwipeDistance) {
      if (distanceY > 0) {
        setSwipe('down')
        onSwipeDown?.()
      } else {
        setSwipe('up')
        onSwipeUp?.()
      }
    }

    touchStart.current = null
    touchEnd.current = null
  }, [minSwipeDistance, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown])

  const resetSwipe = useCallback(() => {
    setSwipe(null)
  }, [])

  const swipeHandlers = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }

  return { swipe, swipeHandlers, resetSwipe }
}

export function usePullToRefresh({ onRefresh, threshold = 80 }) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef(0)
  const isRefreshing = useRef(false)

  const onTouchStart = useCallback(
    (e) => {
      if (window.scrollY === 0 && !isRefreshing.current) {
        startY.current = e.touches[0].clientY
        setIsPulling(true)
      }
    },
    []
  )

  const onTouchMove = useCallback(
    (e) => {
      if (!isPulling) return

      const currentY = e.touches[0].clientY
      const distance = Math.max(0, currentY - startY.current)

      // Apply resistance
      const resistedDistance = Math.min(distance * 0.5, threshold * 1.5)
      setPullDistance(resistedDistance)

      if (distance > 0) {
        e.preventDefault()
      }
    },
    [isPulling, threshold]
  )

  const onTouchEnd = useCallback(() => {
    if (!isPulling) return

    if (pullDistance >= threshold && !isRefreshing.current) {
      isRefreshing.current = true
      onRefresh?.().finally(() => {
        isRefreshing.current = false
        setIsPulling(false)
        setPullDistance(0)
      })
    } else {
      setIsPulling(false)
      setPullDistance(0)
    }
  }, [isPulling, pullDistance, threshold, onRefresh])

  return {
    isPulling,
    pullDistance,
    pullHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  }
}
