'use client'

import { Suspense } from 'react'
import { StudyPageClient } from './StudyPageClient'

export default function StudyError() {
  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="animate-pulse h-8 w-32 bg-gray-200 rounded" />
      </div>
    }>
      <StudyPageClient />
    </Suspense>
  )
}
