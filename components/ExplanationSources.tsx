// src/components/ExplanationSources.tsx

export type ExplanationSource = { url?: string; title?: string; sourceFile: string; sectionPath?: string };

type Props = {
  sources?: ExplanationSource[] | null;
  className?: string;
  compact?: boolean;
};

export function ExplanationSources({ sources, className = '', compact = true }: Props) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className={`mt-3 ${className}`}>
      <div className="text-xs font-medium text-muted-foreground mb-1">Sources</div>
      <ul className="space-y-1 text-sm">
        {sources.map((s, idx) => {
          const label = s.title || s.sourceFile || s.url || `Source ${idx + 1}`;
          return (
            <li key={(s.url || s.sourceFile || '') + idx} className="flex items-center gap-2">
              <span className="text-muted-foreground">•</span>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 dark:text-blue-300 underline decoration-blue-500 hover:text-blue-900 dark:hover:text-blue-100"
                >
                  {label}
                </a>
              ) : (
                <span className="text-foreground">{label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
