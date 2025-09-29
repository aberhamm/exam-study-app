"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { ExternalQuestionsImportZ } from '@/lib/validation';
import type { ExamSummary } from '@/types/api';

const jsonBeautify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

type ImportSuccess = {
  examId: string;
  insertedCount: number;
  questions: Array<{ id: string; question: string }>;
};

type ImportError = {
  message: string;
  details?: string;
  duplicates?: string[];
};

export default function ImportQuestionsPage() {
  const { setConfig, resetConfig } = useHeader();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [rawInput, setRawInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<string | null>(null);
  const [normalizedPayload, setNormalizedPayload] = useState<z.infer<typeof ExternalQuestionsImportZ> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<ImportSuccess | null>(null);
  const [submitError, setSubmitError] = useState<ImportError | null>(null);

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Quiz
        </Link>
      ),
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
        if (!response.ok) {
          throw new Error(`Failed to load exams (status ${response.status})`);
        }
        const json = (await response.json()) as { exams: ExamSummary[] };
        setExams(json.exams);
        setSelectedExamId((prev) => (prev ? prev : json.exams[0]?.examId ?? ''));
      } catch (error) {
        setExamsError(error instanceof Error ? error.message : 'Failed to load exams');
      } finally {
        setExamsLoading(false);
      }
    };

    loadExams();
  }, []);

  useEffect(() => {
    if (!rawInput.trim()) {
      setParseError(null);
      setValidationIssues(null);
      setNormalizedPayload(null);
      return;
    }

    try {
      const parsed = JSON.parse(rawInput);
      const payload = Array.isArray(parsed) ? { questions: parsed } : parsed;
      const result = ExternalQuestionsImportZ.safeParse(payload);
      if (!result.success) {
        const fieldErrors = Object.values(result.error.flatten().fieldErrors).flat();
        setValidationIssues(fieldErrors.join('\n') || 'Invalid question payload');
        setParseError(null);
        setNormalizedPayload(null);
      } else {
        setNormalizedPayload(result.data);
        setValidationIssues(null);
        setParseError(null);
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Invalid JSON');
      setValidationIssues(null);
      setNormalizedPayload(null);
    }
  }, [rawInput]);

  const questionsPreview = useMemo(() => {
    if (!normalizedPayload) return '';
    return jsonBeautify(normalizedPayload.questions.slice(0, 3));
  }, [normalizedPayload]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSuccess(null);

    if (!selectedExamId) {
      setSubmitError({ message: 'Select an exam before importing questions.' });
      return;
    }

    if (!normalizedPayload) {
      setSubmitError({ message: 'Provide valid question JSON before submitting.' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/exams/${encodeURIComponent(selectedExamId)}/questions/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedPayload),
      });

      const json = await response.json();
      if (!response.ok) {
        const duplicates = Array.isArray(json?.duplicates) ? (json.duplicates as string[]) : undefined;
        const details = typeof json?.error === 'string' ? json.error : 'Failed to import questions';
        setSubmitError({
          message: details,
          details: typeof json?.details === 'string' ? json.details : undefined,
          duplicates,
        });
        return;
      }

      const inserted = Array.isArray(json?.questions) ? (json.questions as Array<{ id: string; question: string }>) : [];
      setSuccess({
        examId: json?.examId ?? selectedExamId,
        insertedCount: Number(json?.insertedCount) || inserted.length,
        questions: inserted.map((q) => ({ id: q.id, question: q.question })),
      });
      setRawInput('');
    } catch (error) {
      setSubmitError({
        message: error instanceof Error ? error.message : 'Failed to import questions',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-2">Import Questions</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Paste a JSON array of questions (or an object with a <code>questions</code> property) to append them to an existing exam.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="exam-select">
              Target exam
            </label>
            <select
              id="exam-select"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedExamId}
              onChange={(event) => setSelectedExamId(event.target.value)}
              disabled={examsLoading}
            >
              {exams.length === 0 && <option value="">{examsLoading ? 'Loading exams...' : 'No exams found'}</option>}
              {exams.map((exam) => (
                <option key={exam.examId} value={exam.examId}>
                  {exam.examTitle ? `${exam.examTitle} (${exam.examId})` : exam.examId}
                </option>
              ))}
            </select>
            {examsError && <p className="text-sm text-destructive">{examsError}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="questions-json">
              Questions JSON
            </label>
            <textarea
              id="questions-json"
              className="w-full min-h-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder='[{ "question": "..." }]'
              value={rawInput}
              onChange={(event) => setRawInput(event.target.value)}
            />
            {parseError && <p className="text-sm text-destructive">JSON parse error: {parseError}</p>}
            {validationIssues && <p className="text-sm text-destructive whitespace-pre-line">{validationIssues}</p>}
            {normalizedPayload && (
              <p className="text-xs text-muted-foreground">
                Detected {normalizedPayload.questions.length} question{normalizedPayload.questions.length === 1 ? '' : 's'} ready for import.
              </p>
            )}
          </div>

          {questionsPreview && (
            <details className="bg-muted/30 rounded-md p-3 text-xs">
              <summary className="cursor-pointer text-sm font-medium">Preview first few questions</summary>
              <pre className="mt-2 whitespace-pre-wrap">{questionsPreview}</pre>
            </details>
          )}

          {submitError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{submitError.message}</p>
              {submitError.details && <p className="mt-1">{submitError.details}</p>}
              {submitError.duplicates && submitError.duplicates.length > 0 && (
                <p className="mt-1">Duplicate IDs: {submitError.duplicates.join(', ')}</p>
              )}
            </div>
          )}

          {success && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">
              <p className="font-medium">Imported {success.insertedCount} question{success.insertedCount === 1 ? '' : 's'} into {success.examId}.</p>
              {success.questions.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer">View inserted IDs</summary>
                  <ul className="mt-2 space-y-1">
                    {success.questions.map((question) => (
                      <li key={question.id} className="font-mono text-xs">
                        {question.id} — {question.question}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting || !normalizedPayload || !selectedExamId}>
              {submitting ? 'Importing…' : 'Import Questions'}
            </Button>
            {normalizedPayload && !submitting && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRawInput(jsonBeautify(normalizedPayload.questions))}
              >
                Format JSON
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
