'use client'

export function StatsSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Overview cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-100 rounded-lg h-24" />
        ))}
      </div>

      {/* Daily review chart skeleton */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>

      {/* Two column charts skeleton */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
          <div className="h-48 bg-gray-100 rounded" />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
          <div className="h-48 bg-gray-100 rounded" />
        </div>
      </div>

      {/* Deck progress skeleton */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex justify-between mb-2">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
              </div>
              <div className="h-2 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
