import { useEffect, useRef, useCallback } from 'react'

export function useRealtimeUpdates({
  channelName,
  events = [],
  onEvent,
  enabled = true,
}) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const handlersRef = useRef(new Map())

  const setupListeners = useCallback((channel, echo) => {
    const handlers = new Map()

    events.forEach((eventName) => {
      const handler = (payload) => {
        onEventRef.current?.(eventName, payload)
      }

      channel.listen(`.${eventName}`, handler)
      handlers.set(eventName, handler)
    })

    handlersRef.current = handlers

    return () => {
      events.forEach((eventName) => {
        const handler = handlers.get(eventName)
        if (handler) {
          channel.stopListening(`.${eventName}`)
        }
      })
      handlers.clear()
    }
  }, [events])

  useEffect(() => {
    const echo = window?.Echo

    if (!enabled || !echo || !channelName) {
      return undefined
    }

    let cleanup = null

    try {
      const channel = echo.private(channelName)
      cleanup = setupListeners(channel, echo)
    } catch (err) {
      console.warn('Failed to subscribe to realtime channel:', channelName, err)
    }

    return () => {
      cleanup?.()
      try {
        echo.leave(`private-${channelName}`)
      } catch {
        // Ignore leave errors
      }
    }
  }, [channelName, enabled, setupListeners])
}

export function useStaffRealtimeUpdates({ userId, onIncidentChange, enabled = true }) {
  const channelName = userId ? `incidents.${userId}` : null

  useRealtimeUpdates({
    channelName,
    events: ['IncidentAssigned', 'IncidentStatusUpdated'],
    onEvent: useCallback(
      (eventName, payload) => {
        onIncidentChange?.(eventName, payload)
      },
      [onIncidentChange]
    ),
    enabled,
  })
}
