'use client';

import { useMemo } from 'react';
import type { ExplainDebugInfo } from '@/types/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  visible: boolean;
  onClose: () => void;
  context: 'explain' | 'search';
  debug?: ExplainDebugInfo | null;
  raw?: unknown;
};

export default function DebugHUD({ visible, onClose, context, debug, raw }: Props) {
  const scores = useMemo(() => (debug?.chunks?.map((c) => c.score) ?? []), [debug]);
  const maxScore = useMemo(() => (scores.length ? Math.max(...scores) : 1), [scores]);

  if (!debug) return null;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ context, debug, raw }, null, 2));
    } catch {}
  };

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl md:max-w-4xl w-[95vw] max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 md:px-7 md:py-5 border-b mb-0">
          <DialogTitle className="text-lg md:text-xl">Retrieval Debug — {context === 'explain' ? 'Explain' : 'Search'}</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4 overflow-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Sources ({debug.chunks?.length ?? 0})</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copyJson}>Copy JSON</Button>
              <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>

          <ul className="space-y-3">
            {(debug.chunks ?? []).map((c, i) => {
              const width = Math.max(4, Math.round(((c.score || 0) / (maxScore || 1)) * 100));
              return (
                <li key={`${c.sourceFile}-${i}`} className="rounded border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{c.title || c.sourceFile}</div>
                    <div className="text-xs">score <span className="font-mono">{c.score.toFixed(4)}</span></div>
                  </div>
                  {c.description && c.description !== c.title && (
                    <div className="mt-1 text-xs text-muted-foreground truncate">{c.description}</div>
                  )}
                  <div className="mt-2 h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {typeof c.chunkIndex === 'number' && typeof c.chunkTotal === 'number' && (
                      <span>chunk {c.chunkIndex}/{c.chunkTotal}</span>
                    )}
                    {c.groupId && (
                      <span>group <span className="font-mono">{c.groupId}</span></span>
                    )}
                    {c.heading && (
                      <span>heading: {c.heading}</span>
                    )}
                  </div>
                  {c.sectionPath && (
                    <div className="mt-1 text-xs text-muted-foreground truncate">{c.sectionPath}</div>
                  )}
                  <div className="mt-1 text-xs">
                    <span className="text-muted-foreground">file:</span> <span className="font-mono">{c.sourceBasename || c.sourceFile}</span>
                  </div>
                  {c.tags && c.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block truncate">
                      {c.url}
                    </a>
                  )}
                  {c.preview && (
                    <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed bg-muted/30 p-2 rounded">
                      {c.preview}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>

          {(debug.timings || debug.questionEmbeddingDim || debug.answerEmbeddingDim || debug.chunkCounts) && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">Technical details</summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Timings (ms)</div>
                  <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    {Object.entries(debug.timings ?? {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono">{v ?? '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Meta</div>
                  <div className="mt-2 text-xs space-y-1">
                    <div>q-dim: <span className="font-mono">{debug.questionEmbeddingDim ?? '-'}</span></div>
                    <div>a-dim: <span className="font-mono">{debug.answerEmbeddingDim ?? '-'}</span></div>
                    <div>groups: <span className="font-mono">{debug.documentGroups?.join(', ') || 'all'}</span></div>
                    {debug.chunkCounts && (
                      <div>chunks: <span className="font-mono">q {debug.chunkCounts.question} / a {debug.chunkCounts.answer} / merged {debug.chunkCounts.merged} / processed {debug.chunkCounts.processed}</span></div>
                    )}
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
