export default function AdminLoading() {
  return (
    <div className="p-8 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-gray-200 rounded-lg" />
          <div className="h-4 w-64 bg-gray-100 rounded-lg" />
        </div>
        <div className="h-8 w-32 bg-gray-100 rounded-lg" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card rounded-card border border-line p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-gray-100 rounded" />
              <div className="w-8 h-8 bg-gray-100 rounded-lg" />
            </div>
            <div className="h-8 w-16 bg-gray-200 rounded" />
            <div className="h-3 w-32 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3 bg-card rounded-card border border-line p-6 space-y-4">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="h-[200px] bg-gray-50 rounded-lg" />
        </div>
        <div className="col-span-2 bg-card rounded-card border border-line p-6 space-y-4">
          <div className="h-4 w-36 bg-gray-200 rounded" />
          <div className="h-[200px] bg-gray-50 rounded-lg" />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3 bg-card rounded-card border border-line overflow-hidden">
          <div className="px-6 py-4 border-b border-line-subtle">
            <div className="h-4 w-48 bg-gray-200 rounded" />
          </div>
          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 w-32 bg-gray-100 rounded" />
                <div className="h-4 w-16 bg-gray-100 rounded" />
                <div className="h-4 w-12 bg-gray-100 rounded" />
                <div className="h-4 w-12 bg-gray-100 rounded" />
                <div className="h-5 w-12 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-2 bg-card rounded-card border border-line p-6 space-y-4">
          <div className="h-4 w-36 bg-gray-200 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-3 w-8 bg-gray-100 rounded" />
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
