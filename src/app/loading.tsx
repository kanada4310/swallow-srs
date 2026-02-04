export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Greeting skeleton */}
      <div className="mb-6">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="h-5 w-40 bg-gray-100 rounded animate-pulse mt-2" />
      </div>

      {/* Stats card skeleton */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="h-5 w-28 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-3 gap-4 text-center">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 bg-gray-50 rounded-lg">
              <div className="h-9 w-12 bg-gray-200 rounded animate-pulse mx-auto" />
              <div className="h-4 w-16 bg-gray-100 rounded animate-pulse mx-auto mt-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="h-5 w-36 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          <div className="h-14 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-14 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  )
}
