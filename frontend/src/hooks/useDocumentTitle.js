import { useEffect } from 'react'

export function useDocumentTitle(title) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title ? `${title} | RescueLink` : 'RescueLink'

    return () => {
      document.title = previousTitle
    }
  }, [title])
}
