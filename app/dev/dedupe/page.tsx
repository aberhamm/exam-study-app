"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { APP_CONFIG } from '@/lib/app-config';
import type { ExamSummary } from '@/types/api';
import type { NormalizedQuestion } from '@/types/normalized';
import type { ExternalQuestion } from '@/types/external-question';
import { normalizeQuestions } from '@/lib/normalize';
import { QuestionEditorDialog } from '@/components/QuestionEditorDialog';

type PairItem = {
  score: number;
  a: ExternalQuestion & { id: string; examId: string };
  b: ExternalQuestion & { id: string; examId: string };
};

type FlagStatus = 'ignore' | 'review';

export default function DedupeDevPage() {
  const DEV = APP_CONFIG.DEV_FEATURES_ENABLED;
  const { setConfig, resetConfig } = useHeader();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState<string | null>(null);

  const [examId, setExamId] = useState('');
  const [topK, setTopK] = useState(3);
  const [threshold, setThreshold] = useState(0.9);
  const [limitPairs, setLimitPairs] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<PairItem[]>([]);
  const [flags, setFlags] = useState<Record<string, FlagStatus>>({});
  const [view, setView] = useState<'all' | 'review'>('all');
  const [editing, setEditing] = useState<{ which: 'A' | 'B'; q: NormalizedQuestion } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Home
        </Link>
      ),
      rightContent: (
        <Link href="/import" className="text-sm text-muted-foreground hover:text-foreground">
          Import Questions
        </Link>
      ),
    });
    return () => {
      resetConfig();
    };
  }, [resetConfig, setConfig]);

  useEffect(() => {
    if (!DEV) return;
    const loadExams = async () => {
      setExamsLoading(true);
      setExamsError(null);
      try {
        const response = await fetch('/api/exams', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to load exams (${response.status})`);
        const json = (await response.json()) as { exams: ExamSummary[] };
        setExams(json.exams);
        setExamId((prev) => (prev ? prev : json.exams[0]?.examId ?? ''));
      } catch (err) {
        setExamsError(err instanceof Error ? err.message : 'Failed to load exams');
      } finally {
        setExamsLoading(false);
      }
    };
    loadExams();
  }, [DEV]);

  // Load existing flags for current exam
  useEffect(() => {
    if (!DEV || !examId) return;
    const loadFlags = async () => {
      try {
        const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe/flags`, { cache: 'no-store' });
        const json = await resp.json().catch(() => ({}));
        if (resp.ok && Array.isArray(json?.flags)) {
          const next: Record<string, FlagStatus> = {};
          for (const f of json.flags as Array<{ aId: string; bId: string; status: FlagStatus }>) {
            const key = [f.aId, f.bId].sort().join('::');
            next[key] = f.status;
          }
          setFlags(next);
        }
      } catch {}
    };
    loadFlags();
  }, [DEV, examId]);

  const canSubmit = useMemo(() => !!examId && !submitting, [examId, submitting]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setPairs([]);
    try {
      const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topK, threshold, limitPairs }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : `Dedupe failed (${resp.status})`);
      }
      const items: PairItem[] = Array.isArray(json?.pairs) ? json.pairs : [];
      // Filter out ignored pairs locally too
      const filtered = items.filter((p) => !flags[[p.a.id, p.b.id].sort().join('::')] || flags[[p.a.id, p.b.id].sort().join('::')] !== 'ignore');
      setPairs(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dedupe failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!examId) return;
    if (!confirm(`Delete question ${id}? This cannot be undone.`)) return;
    try {
      const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/questions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(typeof json?.error === 'string' ? json.error : `Delete failed (${resp.status})`);
      // Remove all pairs that include this id
      setPairs((prev) => prev.filter((p) => p.a.id !== id && p.b.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const loadReviewPairs = async () => {
    if (!examId) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe/review`, { cache: 'no-store' });
      const json = await resp.json();
      if (!resp.ok) throw new Error(typeof json?.error === 'string' ? json.error : `Fetch failed (${resp.status})`);
      const items: PairItem[] = Array.isArray(json?.pairs) ? json.pairs : [];
      setPairs(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review list');
    } finally {
      setSubmitting(false);
    }
  };

  const updateFlag = async (aId: string, bId: string, status: FlagStatus | 'clear') => {
    if (!examId) return;
    try {
      const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe/flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aId, bId, status }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(typeof json?.error === 'string' ? json.error : `Flag update failed (${resp.status})`);
      const key = [aId, bId].sort().join('::');
      setFlags((prev) => {
        const next = { ...prev } as Record<string, FlagStatus>;
        if (status === 'clear') {
          delete next[key];
        } else {
          next[key] = status as FlagStatus;
        }
        return next;
      });
      // Remove ignored pairs from current list
      if (status === 'ignore') {
        setPairs((prev) => prev.filter((p) => [p.a.id, p.b.id].sort().join('::') !== key));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Flag update failed');
    }
  };

  const bulkIgnoreAll = async () => {
    if (!examId || pairs.length === 0) return;
    if (!confirm(`Mark all ${pairs.length} pair(s) as Ignored?`)) return;
    for (const p of pairs) {
      await updateFlag(p.a.id, p.b.id, 'ignore');
    }
    if (view === 'review') {
      await loadReviewPairs();
    }
  };

  const handleEdit = (which: 'A' | 'B', q: NormalizedQuestion) => {
    setEditing({ which, q });
    setSaveError(null);
    setEditOpen(true);
  };

  const saveEditedQuestion = async (updated: NormalizedQuestion) => {
    if (!examId) throw new Error('Missing examId');
    setSaving(true);
    setSaveError(null);
    try {
      const payload: ExternalQuestion & { id: string } = {
        id: updated.id,
        question: updated.prompt,
        options: {
          A: updated.choices[0],
          B: updated.choices[1],
          C: updated.choices[2],
          D: updated.choices[3],
          ...(updated.choices[4] ? { E: updated.choices[4] } : {}),
        },
        answer: Array.isArray(updated.answerIndex)
          ? (updated.answerIndex.map((i) => (['A','B','C','D','E'][i] as 'A'|'B'|'C'|'D'|'E')) as ('A'|'B'|'C'|'D'|'E')[])
          : (['A','B','C','D','E'][updated.answerIndex] as 'A'|'B'|'C'|'D'|'E'),
        question_type: updated.questionType,
        explanation: updated.explanation,
        study: updated.study,
      };
      const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/questions/${encodeURIComponent(updated.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : `Save failed (${resp.status})`);
      }
      // Update local pairs with edited question
      setPairs((prev) => prev.map((p) => {
        if (p.a.id === updated.id) return { ...p, a: { ...p.a, ...json } };
        if (p.b.id === updated.id) return { ...p, b: { ...p.b, ...json } };
        return p;
      }));
      setEditOpen(false);
      setEditing(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  if (!DEV) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-2">Dedupe Disabled</h2>
          <p className="text-sm text-muted-foreground">This tool is available only in development.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-2">Find Similar Questions (Dev)</h2>
        <p className="text-sm text-muted-foreground mb-6">Scan for likely duplicates using vector similarity. Adjust threshold and neighbors as needed.</p>

        <div className="mb-4 flex items-center gap-2">
          <button type="button" className={`px-3 py-1.5 rounded border text-sm ${view === 'all' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`} onClick={() => setView('all')}>
            All (scan)
          </button>
          <button type="button" className={`px-3 py-1.5 rounded border text-sm ${view === 'review' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`} onClick={() => setView('review')}>
            Needs Review
          </button>
        </div>

        <form className="space-y-4" onSubmit={view === 'all' ? handleScan : (e) => { e.preventDefault(); loadReviewPairs(); }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="exam-select">Exam</label>
              <select
                id="exam-select"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                disabled={examsLoading}
              >
                {exams.length === 0 && <option value="">{examsLoading ? 'Loading exams…' : 'No exams found'}</option>}
                {exams.map((exam) => (
                  <option key={exam.examId} value={exam.examId}>
                    {exam.examTitle ? `${exam.examTitle} (${exam.examId})` : exam.examId}
                  </option>
                ))}
              </select>
              {examsError && <p className="text-sm text-destructive">{examsError}</p>}
            </div>

            {view === 'all' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="threshold">Threshold</label>
                  <input
                    id="threshold"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={threshold}
                    onChange={(e) => setThreshold(Math.min(1, Math.max(0, Number(e.target.value))))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">Min similarity score to consider (0.00–1.00)</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="topk">Neighbors</label>
                  <input
                    id="topk"
                    type="number"
                    min={1}
                    max={20}
                    value={topK}
                    onChange={(e) => setTopK(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">Per question</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="limitPairs">Max Pairs</label>
                  <input
                    id="limitPairs"
                    type="number"
                    min={1}
                    max={5000}
                    value={limitPairs}
                    onChange={(e) => setLimitPairs(Math.min(5000, Math.max(1, Number(e.target.value))))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            {view === 'all' ? (
              <Button type="submit" disabled={!canSubmit}>{submitting ? 'Scanning…' : 'Scan for Duplicates'}</Button>
            ) : (
              <>
                <Button type="submit" disabled={!canSubmit}>{submitting ? 'Loading…' : 'Refresh List'}</Button>
                <Button type="button" variant="outline" disabled={pairs.length === 0} onClick={bulkIgnoreAll}>Mark all as Ignored</Button>
              </>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-2">Candidate Pairs</h3>
        {saveError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {saveError}
          </div>
        )}
        {pairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pairs yet. Run a scan to see similar questions.</p>
        ) : (
          <ul className="space-y-4">
            {pairs.map((p, i) => {
              const [aNorm] = normalizeQuestions([{ id: p.a.id, question: p.a.question, options: p.a.options, answer: p.a.answer, question_type: p.a.question_type, explanation: p.a.explanation, study: p.a.study } as ExternalQuestion]);
              const [bNorm] = normalizeQuestions([{ id: p.b.id, question: p.b.question, options: p.b.options, answer: p.b.answer, question_type: p.b.question_type, explanation: p.b.explanation, study: p.b.study } as ExternalQuestion]);
              return (
                <li key={`${p.a.id}__${p.b.id}__${i}`} className="rounded-md border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">Score: <span className="font-mono">{p.score.toFixed(4)}</span></div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono">{p.a.id}</span>
                      <span className="opacity-50">/</span>
                      <span className="font-mono">{p.b.id}</span>
                      {(() => {
                        const key = [p.a.id, p.b.id].sort().join('::');
                        const st = flags[key];
                        if (!st) return null;
                        return (
                          <span className={`ml-2 rounded px-1.5 py-0.5 border ${st === 'ignore' ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}>
                            {st === 'ignore' ? 'Ignored' : 'Needs Review'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <QuestionPreview
                      label="A"
                      q={aNorm}
                      onDelete={() => handleDelete(p.a.id)}
                      onEdit={() => handleEdit('A', aNorm)}
                    />
                    <QuestionPreview
                      label="B"
                      q={bNorm}
                      onDelete={() => handleDelete(p.b.id)}
                      onEdit={() => handleEdit('B', bNorm)}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => updateFlag(p.a.id, p.b.id, 'ignore')}>Ignore Pair</Button>
                    <Button variant="outline" size="sm" onClick={() => updateFlag(p.a.id, p.b.id, 'review')}>Needs Review</Button>
                    {(() => {
                      const key = [p.a.id, p.b.id].sort().join('::');
                      return flags[key] ? (
                        <Button variant="ghost" size="sm" onClick={() => updateFlag(p.a.id, p.b.id, 'clear')}>Clear Flag</Button>
                      ) : null;
                    })()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <QuestionEditorDialog
        open={editOpen}
        question={editing?.q ?? null}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditing(null);
            setSaveError(null);
          }
        }}
        onSave={saveEditedQuestion}
        saving={saving}
      />
    </div>
  );
}

function QuestionPreview({ label, q, onDelete, onEdit }: { label: 'A' | 'B'; q: NormalizedQuestion; onDelete: () => void; onEdit: () => void }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDelete}>Delete</Button>
          <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
        </div>
      </div>
      <div className="mt-2">
        <div className="font-medium">{q.prompt}</div>
        <ul className="mt-2 space-y-1 text-sm list-disc ml-5">
          {q.choices.map((c, idx) => (
            <li key={idx} className={Array.isArray(q.answerIndex) ? (q.answerIndex as number[]).includes(idx) ? 'text-green-600 dark:text-green-400' : '' : (q.answerIndex as number) === idx ? 'text-green-600 dark:text-green-400' : ''}>
              {String.fromCharCode(65 + idx)}) {c}
            </li>
          ))}
        </ul>
        {q.explanation && (
          <div className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Explanation:</span> {q.explanation}</div>
        )}
      </div>
    </div>
  );
}
