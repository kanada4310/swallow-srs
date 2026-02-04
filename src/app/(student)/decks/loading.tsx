export default function DecksLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 w-20 bg-gray-200 rounded-lg animate-pulse" />
      </div>

      {/* Section title skeleton */}
      <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-4" />

      {/* Deck card skeletons */}
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mt-2" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
                <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
