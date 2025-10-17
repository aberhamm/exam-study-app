'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SpinnerButton from '@/components/ui/SpinnerButton';
import { useHeader } from '@/contexts/HeaderContext';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import type { ExamSummary } from '@/types/api';
import type { NormalizedQuestion } from '@/types/normalized';
import type { ExternalQuestion } from '@/types/external-question';
import { normalizeQuestions } from '@/lib/normalize';
import { QuestionEditorDialog } from '@/components/QuestionEditorDialog';
import type { QuestionCluster } from '@/types/clusters';
import { toast } from 'sonner';

// Pair scan removed; clusters are the primary workflow

export default function DedupeDevPage() {
  const { setConfig, resetConfig } = useHeader();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState<string | null>(null);

  const [examId, setExamId] = useState('');
  // Pair scan controls removed
  const [submitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pair list and flags removed
  const [view] = useState<'all' | 'review' | 'clusters'>('clusters');
  const [clusters, setClusters] = useState<QuestionCluster[]>([]);
  const [, setClustersLoading] = useState(false); // retained for potential global disabled states
  const [loadingAction, setLoadingAction] = useState<'load' | 'regenerate' | null>(null);
  const [clusterThreshold, setClusterThreshold] = useState(0.9);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [editing, setEditing] = useState<{ which: 'A' | 'B'; q: NormalizedQuestion } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Admin' }, { label: 'Deduplicate' }]} />
      ),
      rightContent: null,
    });
    return () => {
      resetConfig();
    };
  }, [resetConfig, setConfig]);

  useEffect(() => {
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
  }, []);

  // Pair flags removed from UI state

  const canSubmit = useMemo(() => !!examId && !submitting, [examId, submitting]);

  // Pair scan removed

  const handleDelete = async (id: string) => {
    if (!examId) return;
    if (!confirm(`Delete question ${id}? This cannot be undone.`)) return;
    try {
      const resp = await fetch(
        `/api/exams/${encodeURIComponent(examId)}/questions/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Delete failed (${resp.status})`
        );
      await loadClusters();
      toast.success('Deleted question');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  // Pair review removed

  const loadClusters = async (regenerate = false) => {
    if (!examId) return;
    setClustersLoading(true);
    setLoadingAction(regenerate ? 'regenerate' : 'load');
    setError(null);
    try {
      if (regenerate) {
        // Use POST for regeneration with custom threshold
        const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe/clusters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threshold: clusterThreshold,
            minClusterSize: 2,
            mode: 'incremental',
          }),
          cache: 'no-store',
        });
        const json = await resp.json();
        if (!resp.ok)
          throw new Error(
            typeof json?.error === 'string' ? json.error : `Fetch failed (${resp.status})`
          );
        const items: QuestionCluster[] = Array.isArray(json?.clusters) ? json.clusters : [];
        setClusters(items);
      } else {
        // Use GET for loading existing clusters
        const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe/clusters`, {
          cache: 'no-store',
        });
        const json = await resp.json();
        if (!resp.ok)
          throw new Error(
            typeof json?.error === 'string' ? json.error : `Fetch failed (${resp.status})`
          );
        const items: QuestionCluster[] = Array.isArray(json?.clusters) ? json.clusters : [];
        setClusters(items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clusters');
    } finally {
      setClustersLoading(false);
      setLoadingAction(null);
    }
  };

  // Pair flags removed

  // Bulk ignore removed

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
          ? (updated.answerIndex.map(
              (i) => ['A', 'B', 'C', 'D', 'E'][i] as 'A' | 'B' | 'C' | 'D' | 'E'
            ) as ('A' | 'B' | 'C' | 'D' | 'E')[])
          : (['A', 'B', 'C', 'D', 'E'][updated.answerIndex] as 'A' | 'B' | 'C' | 'D' | 'E'),
        question_type: updated.questionType,
        explanation: updated.explanation,
        study: updated.study,
      };
      const resp = await fetch(
        `/api/exams/${encodeURIComponent(examId)}/questions/${encodeURIComponent(updated.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Save failed (${resp.status})`
        );
      }
      // Pair list removed; nothing to update locally here
      setEditOpen(false);
      setEditing(null);
      toast.success('Saved changes');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
      toast.error(e instanceof Error ? e.message : 'Failed to save');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-2">Similarity Groups (Admin)</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Load or regenerate similarity groups. Curate clusters directly; pair triage is hidden in
          this workflow.
        </p>

        <div className="mb-4 flex items-center gap-2">
          <span className="px-3 py-1.5 rounded border text-sm border-primary text-primary">
            Similarity Groups
          </span>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            loadClusters();
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="exam-select">
                Exam
              </label>
              <select
                id="exam-select"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                disabled={examsLoading}
              >
                {exams.length === 0 && (
                  <option value="">{examsLoading ? 'Loading exams…' : 'No exams found'}</option>
                )}
                {exams.map((exam) => (
                  <option key={exam.examId} value={exam.examId}>
                    {exam.examTitle ? `${exam.examTitle} (${exam.examId})` : exam.examId}
                  </option>
                ))}
              </select>
              {examsError && <p className="text-sm text-destructive">{examsError}</p>}
            </div>

            {/* Filter controls for review */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Filter</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded border text-sm ${
                    !reviewOnly
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                  onClick={() => setReviewOnly(false)}
                >
                  All Groups
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded border text-sm ${
                    reviewOnly
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                  onClick={() => setReviewOnly(true)}
                >
                  Review Only
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {clusters.filter((c) => c.flaggedForReview).length} flagged
              </p>
            </div>

            {view === 'clusters' && (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="cluster-threshold">
                  Cluster Threshold
                </label>
                <input
                  id="cluster-threshold"
                  type="number"
                  min={0.8}
                  max={0.99}
                  step={0.01}
                  value={clusterThreshold}
                  onChange={(e) =>
                    setClusterThreshold(Math.min(0.99, Math.max(0.8, Number(e.target.value))))
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Min similarity for grouping (0.80–0.99) - higher = tighter clusters
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <SpinnerButton type="submit" disabled={!canSubmit} loading={loadingAction === 'load'} loadingText="Loading…">
              Load Groups
            </SpinnerButton>
            <SpinnerButton
              type="button"
              variant="outline"
              disabled={!canSubmit}
              onClick={() => loadClusters(true)}
              loading={loadingAction === 'regenerate'}
              loadingText="Regenerating…"
            >
              Regenerate Groups
            </SpinnerButton>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-2">
          {view === 'clusters' ? 'Similarity Groups' : 'Candidate Pairs'}
        </h3>
        {saveError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {saveError}
          </div>
        )}

        {true ? (
          clusters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clusters yet. Load groups to see similar question clusters.
            </p>
          ) : (
            <div className="space-y-4">
              {clusters
                .filter(
                  (c) =>
                    !reviewOnly ||
                    c.flaggedForReview ||
                    (Array.isArray(c.proposedAdditions) && c.proposedAdditions.length > 0)
                )
                .map((cluster) => (
                  <ClusterCard
                    key={cluster.id}
                    cluster={cluster}
                    examId={examId}
                    onClusterUpdate={() => loadClusters()}
                    onQuestionEdit={(q) => handleEdit('A', q)}
                    onQuestionDelete={(id) => handleDelete(id)}
                  />
                ))}
            </div>
          )
        ) : null}
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

// Pair preview UI removed

function ClusterCard({
  cluster,
  examId,
  onClusterUpdate,
  onQuestionEdit,
  onQuestionDelete,
}: {
  cluster: QuestionCluster;
  examId: string;
  onClusterUpdate: () => void;
  onQuestionEdit: (q: NormalizedQuestion) => void;
  onQuestionDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [proposed, setProposed] = useState<NormalizedQuestion[] | null>(null);
  const [loadingProposed, setLoadingProposed] = useState(false);

  const performClusterAction = async (action: { type: string; [key: string]: unknown }, key?: string) => {
    setProcessingKey(key ?? action.type);
    try {
      const resp = await fetch(
        `/api/exams/${encodeURIComponent(examId)}/dedupe/clusters/${encodeURIComponent(
          cluster.id
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        }
      );
      const json = await resp.json();
      if (!resp.ok)
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Action failed (${resp.status})`
        );
      onClusterUpdate();
      switch (action.type) {
        case 'approve_variants':
          toast.success('Marked as variants');
          break;
        case 'exclude_question':
          toast.success('Excluded question');
          break;
        case 'approve_additions':
          toast.success('Accepted proposed addition');
          break;
        case 'reject_additions':
          toast.success('Rejected proposed addition');
          break;
        case 'reset':
          toast.success('Reset to pending');
          break;
        case 'flag_review':
          toast.success('Flagged for review');
          break;
        case 'clear_review':
          toast.success('Cleared review flag');
          break;
        default:
          toast.success('Action complete');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setProcessingKey(null);
    }
  };

  const questions = cluster.questions || [];
  const normalizedQuestions = normalizeQuestions(
    questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      answer: q.answer,
      question_type: q.question_type,
      explanation: q.explanation,
      study: q.study,
    }))
  );

  const statusColor = {
    pending:
      'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    approved_duplicates:
      'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    approved_variants:
      'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    split:
      'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
  }[cluster.status];

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="p-1 h-6 w-6"
          >
            {expanded ? '−' : '+'}
          </Button>
          <div>
            <div className="text-sm font-medium">{questions.length} similar questions</div>
            <div className="text-xs text-muted-foreground">
              Avg similarity: {cluster.avgSimilarity.toFixed(3)}
              {cluster.minSimilarity !== cluster.maxSimilarity && (
                <span>
                  {' '}
                  (range: {cluster.minSimilarity.toFixed(3)}–{cluster.maxSimilarity.toFixed(3)})
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs border ${statusColor}`}>
            {cluster.status.replace('_', ' ')}
          </span>
          {(cluster.flaggedForReview || (Array.isArray(cluster.proposedAdditions) && cluster.proposedAdditions.length > 0)) && (
            <span className="px-2 py-1 rounded text-xs border bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
              Review{Array.isArray(cluster.proposedAdditions) && cluster.proposedAdditions.length > 0 ? ` +${cluster.proposedAdditions.length}` : ''}
            </span>
          )}
          <span className="text-xs text-muted-foreground font-mono">{cluster.id.slice(-8)}</span>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          Sample: {questions[0].question.slice(0, 100)}...
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          {(Array.isArray(cluster.proposedAdditions) && cluster.proposedAdditions.length > 0) && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Proposed Additions</div>
                <div className="flex items-center gap-2">
                  <SpinnerButton
                    size="sm"
                    variant="default"
                    disabled={loadingProposed || !proposed || proposed.length === 0}
                    loading={processingKey === 'approve_additions_all'}
                    loadingText="Processing…"
                    onClick={() => performClusterAction({ type: 'approve_additions', ids: (proposed || []).map((q) => q.id) }, 'approve_additions_all')}
                  >
                    Accept All
                  </SpinnerButton>
                  <SpinnerButton
                    size="sm"
                    variant="destructive"
                    disabled={loadingProposed || !proposed || proposed.length === 0}
                    loading={processingKey === 'reject_additions_all'}
                    loadingText="Processing…"
                    onClick={() => performClusterAction({ type: 'reject_additions', ids: (proposed || []).map((q) => q.id) }, 'reject_additions_all')}
                  >
                    Reject All
                  </SpinnerButton>
                </div>
              </div>
              <div className="space-y-3">
                {!proposed && (
                  <SpinnerButton
                    variant="outline"
                    size="sm"
                    loading={loadingProposed}
                    loadingText="Loading…"
                    onClick={async () => {
                      setLoadingProposed(true);
                      try {
                        const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe/clusters/${encodeURIComponent(cluster.id)}`, { cache: 'no-store' });
                        const json = await resp.json();
                        if (!resp.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to load proposals');
                        const pq = Array.isArray(json?.cluster?.proposedQuestions) ? json.cluster.proposedQuestions : [] as Array<ExternalQuestion & { _id?: { toString?: () => string } }>;
                        const normalized = normalizeQuestions(pq.map((q) => ({ id: q.id || q._id?.toString?.() || '', question: q.question, options: q.options, answer: q.answer, question_type: q.question_type, explanation: q.explanation, study: q.study })));
                        setProposed(normalized);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Failed to load proposals');
                      } finally {
                        setLoadingProposed(false);
                      }
                    }}
                  >
                    Load Proposals
                  </SpinnerButton>
                )}
                {proposed && proposed.length === 0 && (
                  <p className="text-sm text-muted-foreground">No proposals to review.</p>
                )}
                {proposed && proposed.length > 0 && (
                  <ul className="space-y-3">
                    {proposed.map((pq) => (
                      <li key={pq.id} className="rounded-md border bg-card p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-xs font-medium text-muted-foreground">Proposed</div>
                          <div className="flex items-center gap-2">
                            <SpinnerButton size="sm" variant="default" loading={processingKey === `approve_additions_${pq.id}`} loadingText="Processing…" onClick={() => performClusterAction({ type: 'approve_additions', ids: [pq.id] }, `approve_additions_${pq.id}`)}>Accept</SpinnerButton>
                            <SpinnerButton size="sm" variant="destructive" loading={processingKey === `reject_additions_${pq.id}`} loadingText="Processing…" onClick={() => performClusterAction({ type: 'reject_additions', ids: [pq.id] }, `reject_additions_${pq.id}`)}>Reject</SpinnerButton>
                          </div>
                        </div>
                        <div className="font-medium mb-2">{pq.prompt}</div>
                        <ul className="space-y-1 text-sm list-disc ml-5">
                          {pq.choices.map((c, idx) => (
                            <li key={idx}>{String.fromCharCode(65 + idx)}) {c}</li>
                          ))}
                        </ul>
                        {pq.explanation && (
                          <div className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Explanation:</span> {pq.explanation}</div>
                        )}
                        <div className="mt-1 text-xs text-muted-foreground font-mono">{pq.id}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {normalizedQuestions.map((q, idx) => (
              <div key={q.id} className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Question {idx + 1}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="destructive" size="sm" onClick={() => onQuestionDelete(q.id)}>
                      Delete
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onQuestionEdit(q)}>
                      Edit
                    </Button>
                    <SpinnerButton
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        performClusterAction({ type: 'exclude_question', questionId: q.id }, `exclude_${q.id}`)
                      }
                      loading={processingKey === `exclude_${q.id}`}
                      loadingText="Processing…"
                    >
                      Exclude
                    </SpinnerButton>
                  </div>
                </div>
                <div className="font-medium mb-2">{q.prompt}</div>
                <ul className="space-y-1 text-sm list-disc ml-5">
                  {q.choices.map((c, choiceIdx) => (
                    <li
                      key={choiceIdx}
                      className={
                        Array.isArray(q.answerIndex)
                          ? (q.answerIndex as number[]).includes(choiceIdx)
                            ? 'text-green-600 dark:text-green-400'
                            : ''
                          : (q.answerIndex as number) === choiceIdx
                          ? 'text-green-600 dark:text-green-400'
                          : ''
                      }
                    >
                      {String.fromCharCode(65 + choiceIdx)}) {c}
                    </li>
                  ))}
                </ul>
                {q.explanation && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Explanation:</span>{' '}
                    {q.explanation}
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground font-mono">{q.id}</div>
              </div>
            ))}
          </div>

          {cluster.status === 'pending' && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <SpinnerButton
                variant="default"
                size="sm"
                onClick={() => performClusterAction({ type: 'approve_variants' }, 'approve_variants')}
                loading={processingKey === 'approve_variants'}
                loadingText="Processing…"
              >
                Keep as Variants
              </SpinnerButton>
              <SpinnerButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  const act = cluster.flaggedForReview ? { type: 'clear_review' } : { type: 'flag_review' };
                  const key = (act.type as string);
                  void performClusterAction(act, key);
                }}
                loading={processingKey === (cluster.flaggedForReview ? 'clear_review' : 'flag_review')}
                loadingText="Processing…"
              >
                {cluster.flaggedForReview ? 'Clear Review Flag' : 'Flag for Review'}
              </SpinnerButton>
              <SpinnerButton
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (questions.length < 2) return;
                  if (
                    !confirm(
                      'Mark items in this group as not similar to each other and remove the group?'
                    )
                  )
                    return;
                  setProcessingKey('not_similar');
                  try {
                    // Mark all pairwise combinations as ignored
                    const ids = questions.map((q) => String(q.id));
                    const ops: Promise<Response>[] = [];
                    for (let i = 0; i < ids.length; i++) {
                      for (let j = i + 1; j < ids.length; j++) {
                        const aId = ids[i]!;
                        const bId = ids[j]!;
                        ops.push(
                          fetch(`/api/exams/${encodeURIComponent(examId)}/dedupe/flags`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ aId, bId, status: 'ignore' }),
                          })
                        );
                      }
                    }
                    const results = await Promise.all(ops);
                    const bad = results.find((r) => !r.ok);
                    if (bad) {
                      const j = await bad.json().catch(() => ({}));
                      throw new Error(
                        typeof j?.error === 'string'
                          ? j.error
                          : `Flag update failed (${bad.status})`
                      );
                    }

                    // Remove this cluster now (it cannot be formed again due to the ignores)
                    const del = await fetch(
                      `/api/exams/${encodeURIComponent(
                        examId
                      )}/dedupe/clusters/${encodeURIComponent(cluster.id)}`,
                      { method: 'DELETE' }
                    );
                    if (!del.ok) {
                      const j = await del.json().catch(() => ({}));
                      throw new Error(
                        typeof j?.error === 'string'
                          ? j.error
                          : `Failed to delete cluster (${del.status})`
                      );
                    }
                    onClusterUpdate();
                    toast.success('Marked not similar and removed group');
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : 'Failed to mark not similar'
                    );
                  } finally {
                    setProcessingKey(null);
                  }
                }}
                loading={processingKey === 'not_similar'}
                loadingText="Processing…"
              >
                Not Similar
              </SpinnerButton>
            </div>
          )}

          {cluster.status !== 'pending' && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <SpinnerButton
                variant="ghost"
                size="sm"
                onClick={() => performClusterAction({ type: 'reset' }, 'reset')}
                loading={processingKey === 'reset'}
                loadingText="Processing…"
              >
                Reset to Pending
              </SpinnerButton>
              <SpinnerButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  const act = cluster.flaggedForReview ? { type: 'clear_review' } : { type: 'flag_review' };
                  const key = act.type as string;
                  void performClusterAction(act, key);
                }}
                loading={processingKey === (cluster.flaggedForReview ? 'clear_review' : 'flag_review')}
                loadingText="Processing…"
              >
                {cluster.flaggedForReview ? 'Clear Review Flag' : 'Flag for Review'}
              </SpinnerButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
