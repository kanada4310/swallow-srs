'use client'

import { useEffect, type ComponentType } from 'react'

/**
 * Creates an error.tsx component that re-renders the page from IndexedDB
 * when an RSC fetch fails (e.g., during offline navigation).
 *
 * Usage in error.tsx:
 *   import { createErrorBoundary } from '@/lib/createErrorBoundary'
 *   import Page from './page'
 *   export default createErrorBoundary(Page)
 */
export function createErrorBoundary(PageComponent: ComponentType) {
  function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
    useEffect(() => {
      const onOnline = () => reset()
      window.addEventListener('online', onOnline)
      return () => window.removeEventListener('online', onOnline)
    }, [reset])

    return <PageComponent />
  }

  ErrorBoundary.displayName = `ErrorBoundary(${PageComponent.displayName || PageComponent.name || 'Page'})`
  return ErrorBoundary
}
