// src/components/ExplanationHistoryDialog.tsx
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { NormalizedQuestion } from '@/types/normalized';
import { normalizeQuestions } from '@/lib/normalize';
import type { ExplanationVersion } from '@/types/explanation';
import { MarkdownContent } from '@/components/ui/markdown';
import { ExplanationSources as ExplanationSourcesList } from '@/components/ExplanationSources';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  questionId: string;
  onReverted: (updated: NormalizedQuestion) => void;
};

type VersionView = ExplanationVersion & { idx: number };

export function ExplanationHistoryDialog({ open, onOpenChange, examId, questionId, onReverted }: Props) {
  const [versions, setVersions] = useState<VersionView[]>([]);
  const [loading, setLoading] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/exams/${examId}/questions/${questionId}/explanation/history`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        const list = Array.isArray(j.versions) ? (j.versions as ExplanationVersion[]) : [];
        setVersions(list.map((v, idx) => ({ ...v, idx })));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load history');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, examId, questionId]);

  const revertTo = async (versionId: string) => {
    try {
      setRevertingId(versionId);
      const resp = await fetch(`/api/exams/${examId}/questions/${questionId}/explanation/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
        cache: 'no-store',
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${resp.status}`);
      }
      const j = await resp.json();
      const [normalized] = normalizeQuestions([j.question]);
      onReverted(normalized);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revert');
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Explanation History</DialogTitle>
          <DialogDescription>
            Review previous versions of this explanation. Reverting will replace the current explanation and save it into history.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : versions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No history yet.</div>
        ) : (
          <div className="space-y-4">
            {versions.map((v) => (
              <div key={v.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Saved:</span>{' '}
                    {new Date(v.savedAt).toLocaleString()} • {v.savedBy?.username || 'system'} • {v.aiGenerated ? 'AI' : 'Manual'} • {v.reason || 'edit'}
                  </div>
                  <Button size="sm" onClick={() => revertTo(v.id)} disabled={!!revertingId}>
                    {revertingId === v.id ? 'Reverting…' : 'Revert to this'}
                  </Button>
                </div>
                <div className="mt-2">
                  <MarkdownContent variant="explanation">{v.explanation}</MarkdownContent>
                  <ExplanationSourcesList sources={v.sources} />
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
