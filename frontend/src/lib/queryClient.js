import { QueryClient } from '@tanstack/react-query'
import { clearApiCache } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 15,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        const status = error?.response?.status

        if (status === 401 || status === 403 || status === 404) {
          return false
        }

        return failureCount < 3
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 0,
      onSuccess: () => {
        clearApiCache()
      },
    },
  },
})

export const staffQueryKeys = {
  incidents: (params = {}) => ['staff', 'incidents', params],
  incidentDetail: (incidentId) => ['staff', 'incidents', incidentId],
}
