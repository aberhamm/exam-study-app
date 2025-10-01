export function CompetencySkeleton() {
  return (
    <div className="bg-card p-6 rounded-lg border border-border animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          {/* Title skeleton */}
          <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
          {/* Metadata skeleton */}
          <div className="flex items-center gap-4 mt-2">
            <div className="h-4 bg-muted rounded w-20"></div>
            <div className="h-4 bg-muted rounded w-24"></div>
            <div className="h-4 bg-muted rounded w-16"></div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-12 bg-muted rounded"></div>
          <div className="h-8 w-16 bg-muted rounded"></div>
        </div>
      </div>

      {/* Description skeleton */}
      <div className="space-y-2 mt-4">
        <div className="h-4 bg-muted rounded w-full"></div>
        <div className="h-4 bg-muted rounded w-5/6"></div>
        <div className="h-4 bg-muted rounded w-4/6"></div>
      </div>
    </div>
  );
}

export function CompetencyListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary Stats Skeleton */}
      <div className="bg-muted/50 border border-border rounded-lg p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-4 bg-muted rounded w-24 mb-2"></div>
            <div className="h-8 bg-muted rounded w-16"></div>
          </div>
          <div>
            <div className="h-4 bg-muted rounded w-24 mb-2"></div>
            <div className="h-8 bg-muted rounded w-12"></div>
          </div>
          <div>
            <div className="h-4 bg-muted rounded w-32 mb-2"></div>
            <div className="h-8 bg-muted rounded w-16"></div>
          </div>
        </div>
      </div>

      {/* Competency Cards Skeleton */}
      <div className="space-y-4">
        <CompetencySkeleton />
        <CompetencySkeleton />
        <CompetencySkeleton />
      </div>
    </div>
  );
}
