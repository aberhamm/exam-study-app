"use client";

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import SpinnerButton from '@/components/ui/SpinnerButton';

type QuestionFormProps = {
  examId: string;
  onCreated?: (created: { questionId: string }) => void;
};

type Options = { A: string; B: string; C: string; D: string; E?: string };

export function QuestionForm({ examId, onCreated }: QuestionFormProps) {
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<'single' | 'multiple'>('single');
  const [options, setOptions] = useState<Options>({ A: '', B: '', C: '', D: '', E: '' });
  const [answerSingle, setAnswerSingle] = useState<'A' | 'B' | 'C' | 'D' | 'E' | ''>('');
  const [answerMulti, setAnswerMulti] = useState<{ A: boolean; B: boolean; C: boolean; D: boolean; E: boolean }>({ A: false, B: false, C: false, D: false, E: false });
  const [explanation, setExplanation] = useState('');

  const [generateEmbeddings, setGenerateEmbeddings] = useState(false);
  const [assignCompetencies, setAssignCompetencies] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ questionId: string } | null>(null);

  const answersValid = useMemo(() => {
    if (questionType === 'single') return !!answerSingle;
    return Object.values(answerMulti).some(Boolean);
  }, [questionType, answerMulti, answerSingle]);

  const isValid = useMemo(() => {
    const { A, B, C, D } = options;
    return (
      question.trim().length > 0 &&
      A.trim().length > 0 &&
      B.trim().length > 0 &&
      C.trim().length > 0 &&
      D.trim().length > 0 &&
      answersValid
    );
  }, [question, options, answersValid]);

  const buildPayload = useCallback(() => {
    // Omit E if empty
    const opts: Options = {
      A: options.A.trim(),
      B: options.B.trim(),
      C: options.C.trim(),
      D: options.D.trim(),
      ...(options.E && options.E.trim() ? { E: options.E.trim() } : {}),
    };

    const answer =
      questionType === 'single'
        ? (answerSingle as 'A' | 'B' | 'C' | 'D' | 'E')
        : (Object.entries(answerMulti)
            .filter(([k, v]) => v)
            .map(([k]) => k) as Array<'A' | 'B' | 'C' | 'D' | 'E'>);

    const payload: Record<string, unknown> = {
      question: question.trim(),
      options: opts,
      answer,
      question_type: questionType,
    };
    if (explanation.trim()) payload.explanation = explanation.trim();
    return payload;
  }, [question, options, questionType, answerSingle, answerMulti, explanation]);

  const resetForm = () => {
    setQuestion('');
    setQuestionType('single');
    setOptions({ A: '', B: '', C: '', D: '', E: '' });
    setAnswerSingle('');
    setAnswerMulti({ A: false, B: false, C: false, D: false, E: false });
    setExplanation('');
    setGenerateEmbeddings(false);
    setAssignCompetencies(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!isValid) {
      setError('Please complete all required fields and select the correct answer(s).');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/exams/${encodeURIComponent(examId)}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = await response.json();
      if (!response.ok) {
        const msg = typeof json?.error === 'string' ? json.error : 'Failed to create question';
        setError(msg);
        return;
      }
      const questionId: string = json?.questionId;

      // Optional post-processing
      if ((generateEmbeddings || assignCompetencies) && questionId) {
        try {
          await fetch(`/api/exams/${encodeURIComponent(examId)}/questions/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questionIds: [questionId],
              generateEmbeddings,
              assignCompetencies,
              competencyOptions: { topN: 1, threshold: 0.5, overwrite: false },
            }),
          });
        } catch {
          // Non-blocking; surface creation success even if processing fails silently
        }
      }

      setSuccess({ questionId });
      onCreated?.({ questionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create question');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="question">Question</label>
        <textarea
          id="question"
          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Enter the question text"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Question Type</label>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="question-type"
              value="single"
              checked={questionType === 'single'}
              onChange={() => setQuestionType('single')}
            />
            Single answer
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="question-type"
              value="multiple"
              checked={questionType === 'multiple'}
              onChange={() => setQuestionType('multiple')}
            />
            Multiple answers
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">Options</label>
        {(['A', 'B', 'C', 'D', 'E'] as const).map((key) => (
          <div key={key} className="flex items-center gap-3">
            <div className="w-6 text-sm font-medium">{key}.</div>
            <input
              type="text"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={`Option ${key}`}
              value={(options as Record<string, string>)[key] ?? ''}
              onChange={(e) => setOptions((prev) => ({ ...prev, [key]: e.target.value }))}
              required={key !== 'E'}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Correct Answer{questionType === 'multiple' ? 's' : ''}</label>
        {questionType === 'single' ? (
          <div className="flex items-center gap-4 text-sm">
            {(['A', 'B', 'C', 'D', 'E'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="answer-single"
                  value={k}
                  checked={answerSingle === k}
                  onChange={() => setAnswerSingle(k)}
                  disabled={k === 'E' && !(options.E && options.E.trim())}
                />
                {k}
              </label>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-4 text-sm flex-wrap">
            {(['A', 'B', 'C', 'D', 'E'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={answerMulti[k]}
                  onChange={(e) => setAnswerMulti((prev) => ({ ...prev, [k]: e.target.checked }))}
                  disabled={k === 'E' && !(options.E && options.E.trim())}
                />
                {k}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="explanation">Explanation (optional)</label>
        <textarea
          id="explanation"
          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Provide an explanation if available"
        />
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Post-create processing (optional)</p>

        <div className="flex items-start gap-2">
          <input
            id="generate-embeddings"
            type="checkbox"
            className="h-4 w-4 mt-0.5"
            checked={generateEmbeddings}
            onChange={(e) => setGenerateEmbeddings(e.target.checked)}
          />
          <label htmlFor="generate-embeddings" className="text-sm">
            <div className="font-medium">Generate embeddings</div>
            <div className="text-xs text-muted-foreground">Create vector embeddings for this question (required for search and auto-competencies)</div>
          </label>
        </div>

        <div className="flex items-start gap-2">
          <input
            id="assign-competencies"
            type="checkbox"
            className="h-4 w-4 mt-0.5"
            checked={assignCompetencies}
            onChange={(e) => {
              setAssignCompetencies(e.target.checked);
              if (e.target.checked && !generateEmbeddings) setGenerateEmbeddings(true);
            }}
          />
          <label htmlFor="assign-competencies" className="text-sm">
            <div className="font-medium">Auto-assign competencies</div>
            <div className="text-xs text-muted-foreground">Use vector similarity to assign related competencies (requires embeddings)</div>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">
          <p className="font-medium">✓ Question created</p>
          <div className="mt-3 flex items-center gap-2">
            <Button asChild>
              <Link href={`/admin/questions/${encodeURIComponent(examId)}`}>View All Questions</Link>
            </Button>
            <Button variant="ghost" type="button" onClick={resetForm}>Add Another</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <SpinnerButton type="submit" loading={submitting} loadingText="Creating..." disabled={!isValid || submitting}>
          Create Question
        </SpinnerButton>
        <Button type="button" variant="outline" asChild>
          <Link href={`/admin/questions/${encodeURIComponent(examId)}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

