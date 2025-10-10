export function QuestionListItemSkeleton({ showIndex = true }: { showIndex?: boolean }) {
  return (
    <div className="bg-card p-6 rounded-lg border border-border animate-pulse">
      <div className="flex items-start gap-4">
        {showIndex && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted"></div>
        )}
        <div className="flex-1 space-y-4">
          {/* Question title */}
          <div className="h-6 bg-muted rounded w-3/4"></div>

          {/* Answer options */}
          <div className="space-y-2">
            <div className="h-12 bg-muted rounded"></div>
            <div className="h-12 bg-muted rounded"></div>
            <div className="h-12 bg-muted rounded"></div>
            <div className="h-12 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuestionListSkeleton({ count = 3, showIndex = true }: { count?: number; showIndex?: boolean }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <QuestionListItemSkeleton key={i} showIndex={showIndex} />
      ))}
    </div>
  );
}
