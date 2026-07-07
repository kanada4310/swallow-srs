export default function StudyLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4">
      <div className="py-6">
        {/* Progress bar skeleton */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 w-24 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-4 w-16 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="h-2 bg-gray-200 rounded-full" />
        </div>

        {/* Card skeleton */}
        <div className="w-full max-w-2xl mx-auto">
          <div className="bg-white rounded-card shadow-card border border-gray-200 min-h-[300px] flex flex-col">
            <div className="flex-1 p-8 flex flex-col items-center justify-center gap-4">
              <div className="h-6 w-48 bg-gray-200 rounded-xl animate-pulse" />
              <div className="h-4 w-32 bg-gray-100 rounded-xl animate-pulse" />
            </div>
          </div>

          {/* "Show answer" button skeleton */}
          <div className="mt-6 flex justify-center">
            <div className="h-12 w-48 bg-gray-200 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
