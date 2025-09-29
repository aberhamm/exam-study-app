"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { APP_CONFIG } from '@/lib/app-config';
import type { ExamSummary } from '@/types/api';

type ApiSearchResult = {
  score: number;
  question: {
    id: string;
    examId: string;
    question: string;
    options: { A: string; B: string; C: string; D: string; E?: string };
    answer: 'A' | 'B' | 'C' | 'D' | 'E' | ('A' | 'B' | 'C' | 'D' | 'E')[];
    explanation?: string;
  };
};

export default function SearchDevPage() {
  const DEV = APP_CONFIG.DEV_FEATURES_ENABLED;
  const { setConfig, resetConfig } = useHeader();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState<string | null>(null);

  const [examId, setExamId] = useState('');
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApiSearchResult[]>([]);

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Quiz
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
        if (!response.ok) {
          throw new Error(`Failed to load exams (status ${response.status})`);
        }
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

  const canSubmit = useMemo(() => {
    return !!examId && query.trim().length > 0 && !submitting;
  }, [examId, query, submitting]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResults([]);

    try {
      const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : `Search failed (${resp.status})`);
      }
      const items = Array.isArray(json?.results) ? (json.results as ApiSearchResult[]) : [];
      setResults(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrySample = () => {
    if (!query) {
      setQuery('experience edge publishing pipeline');
    }
  };

  if (!DEV) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-2">Search Disabled</h2>
          <p className="text-sm text-muted-foreground">This tool is available only in development.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-2">Semantic Question Search (Dev)</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Query questions via vector similarity. Requires populated embeddings and a MongoDB Atlas vector index.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="query">Query</label>
              <input
                id="query"
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Describe what you're looking for…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <label className="text-sm" htmlFor="topk">Top K</label>
                <input
                  id="topk"
                  type="number"
                  min={1}
                  max={100}
                  value={topK}
                  onChange={(e) => setTopK(Math.min(100, Math.max(1, Number(e.target.value))))}
                  className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button type="button" variant="ghost" onClick={handleTrySample}>Try sample</Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-2">Results</h3>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results yet. Submit a query to see matches.</p>
        ) : (
          <ul className="space-y-4">
            {results.map((item) => (
              <li key={item.question.id} className="rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">ID: <span className="font-mono">{item.question.id}</span></p>
                  <p className="text-sm">Score: <span className="font-mono">{item.score.toFixed(4)}</span></p>
                </div>
                <h4 className="mt-2 font-medium">{item.question.question}</h4>
                <div className="mt-2 text-sm">
                  <p className="font-medium">Options</p>
                  <ul className="list-disc ml-5">
                    <li>A) {item.question.options.A}</li>
                    <li>B) {item.question.options.B}</li>
                    <li>C) {item.question.options.C}</li>
                    <li>D) {item.question.options.D}</li>
                    {item.question.options.E && <li>E) {item.question.options.E}</li>}
                  </ul>
                </div>
                {item.question.explanation && (
                  <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Explanation:</span> {item.question.explanation}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
