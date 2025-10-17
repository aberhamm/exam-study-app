"use client";

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import SpinnerButton from '@/components/ui/SpinnerButton';
import { ExternalQuestionZ, coerceExternalQuestion } from '@/lib/validation';
import type { ExternalQuestion } from '@/types/external-question';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

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
  const [processing, setProcessing] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [competencyStatus, setCompetencyStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  // JSON mode state
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonValid, setJsonValid] = useState<ExternalQuestion | null>(null);

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
            .filter(([, v]) => v)
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
    setProcessing(false);
    setEmbeddingStatus('idle');
    setCompetencyStatus('idle');
    setJsonOpen(false);
    setJsonInput('');
    setJsonError(null);
    setJsonValid(null);
  };

  const validateJson = useCallback(() => {
    setJsonError(null);
    setJsonValid(null);
    try {
      const raw = JSON.parse(jsonInput);
      const coerced = coerceExternalQuestion(raw);
      const parsed = ExternalQuestionZ.parse(coerced);
      setJsonValid(parsed);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, [jsonInput]);

  const loadFromJson = useCallback(() => {
    if (!jsonValid) return;
    setQuestion(jsonValid.question || '');
    setQuestionType(jsonValid.question_type || 'single');
    setOptions({
      A: jsonValid.options?.A || '',
      B: jsonValid.options?.B || '',
      C: jsonValid.options?.C || '',
      D: jsonValid.options?.D || '',
      E: jsonValid.options?.E || '',
    });
    if (Array.isArray(jsonValid.answer)) {
      setAnswerMulti({
        A: jsonValid.answer.includes('A'),
        B: jsonValid.answer.includes('B'),
        C: jsonValid.answer.includes('C'),
        D: jsonValid.answer.includes('D'),
        E: jsonValid.answer.includes('E'),
      });
      setAnswerSingle('');
      setQuestionType('multiple');
    } else {
      setAnswerSingle(jsonValid.answer || '');
      setAnswerMulti({ A: false, B: false, C: false, D: false, E: false });
      setQuestionType('single');
    }
    setExplanation(jsonValid.explanation || '');
  }, [jsonValid]);

  const submitFromJson = useCallback(async () => {
    if (!jsonValid) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/exams/${encodeURIComponent(examId)}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonValid),
      });
      const json = await response.json();
      if (!response.ok) {
        const msg = typeof json?.error === 'string' ? json.error : 'Failed to create question';
        setError(msg);
        return;
      }
      const questionId: string = json?.questionId;

      if ((generateEmbeddings || assignCompetencies) && questionId) {
        setProcessing(true);
        if (generateEmbeddings) setEmbeddingStatus('pending');
        if (assignCompetencies) setCompetencyStatus('pending');
        try {
          const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/questions/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questionIds: [questionId],
              generateEmbeddings,
              assignCompetencies,
              competencyOptions: { topN: 1, threshold: 0.5, overwrite: false },
            }),
          });
          if (!resp.ok) throw new Error('processing failed');
          if (generateEmbeddings) setEmbeddingStatus('success');
          if (assignCompetencies) setCompetencyStatus('success');
        } catch {
          if (generateEmbeddings) setEmbeddingStatus('error');
          if (assignCompetencies) setCompetencyStatus('error');
        } finally {
          setProcessing(false);
          setTimeout(() => {
            if (embeddingStatus === 'success') setEmbeddingStatus('idle');
            if (competencyStatus === 'success') setCompetencyStatus('idle');
          }, 1800);
        }
      }

      setSuccess({ questionId });
      onCreated?.({ questionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create question');
    } finally {
      setSubmitting(false);
    }
  }, [jsonValid, examId, generateEmbeddings, assignCompetencies, embeddingStatus, competencyStatus, onCreated]);

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
        setProcessing(true);
        if (generateEmbeddings) setEmbeddingStatus('pending');
        if (assignCompetencies) setCompetencyStatus('pending');
        try {
          const resp = await fetch(`/api/exams/${encodeURIComponent(examId)}/questions/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questionIds: [questionId],
              generateEmbeddings,
              assignCompetencies,
              competencyOptions: { topN: 1, threshold: 0.5, overwrite: false },
            }),
          });
          if (!resp.ok) throw new Error('processing failed');
          if (generateEmbeddings) setEmbeddingStatus('success');
          if (assignCompetencies) setCompetencyStatus('success');
        } catch {
          if (generateEmbeddings) setEmbeddingStatus('error');
          if (assignCompetencies) setCompetencyStatus('error');
        } finally {
          setProcessing(false);
          // Auto-clear success indicators after a short delay
          setTimeout(() => {
            if (embeddingStatus === 'success') setEmbeddingStatus('idle');
            if (competencyStatus === 'success') setCompetencyStatus('idle');
          }, 1800);
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Add Question</h2>
        <Button type="button" variant="outline" onClick={() => setJsonOpen((v) => !v)}>
          {jsonOpen ? 'Hide JSON' : 'Paste JSON'}
        </Button>
      </div>

      {jsonOpen && (
        <div className="rounded-md border p-4 bg-muted/10 space-y-3">
          <label className="text-sm font-medium" htmlFor="json-question">Paste JSON Question</label>
          <textarea
            id="json-question"
            className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder='{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A","question_type":"single"}'
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
          {jsonError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {jsonError}
            </div>
          )}
          {jsonValid && !jsonError && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-700">
              JSON validated
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={validateJson} disabled={submitting}>Validate</Button>
            <Button type="button" variant="outline" onClick={loadFromJson} disabled={!jsonValid || submitting}>Load into Form</Button>
            <SpinnerButton type="button" onClick={submitFromJson} loading={submitting} loadingText="Creating..." disabled={!jsonValid || submitting}>
              Create from JSON
            </SpinnerButton>
          </div>
          <p className="text-xs text-muted-foreground">Supports optional fields: explanation, explanationSources, study, question_type. Answer can be a letter or an array of letters for multiple-select.</p>
        </div>
      )}
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

        <div className={`flex items-start gap-2 ${processing && generateEmbeddings && embeddingStatus === 'pending' ? 'ring-2 ring-blue-400 ring-offset-1 rounded-md pr-2 animate-pulse' : ''}`}>
          <input
            id="generate-embeddings"
            type="checkbox"
            className="h-4 w-4 mt-0.5"
            checked={generateEmbeddings}
            onChange={(e) => setGenerateEmbeddings(e.target.checked)}
            disabled={submitting || processing}
          />
          <label htmlFor="generate-embeddings" className="text-sm">
            <div className="font-medium">Generate embeddings</div>
            <div className="text-xs text-muted-foreground">Create vector embeddings for this question (required for search and auto-competencies)</div>
            {processing && generateEmbeddings && (
              <div className="mt-1 text-xs flex items-center gap-1">
                {embeddingStatus === 'pending' && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Embedding…</span>
                  </>
                )}
                {embeddingStatus === 'success' && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Embeddings created</span>
                  </>
                )}
                {embeddingStatus === 'error' && (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-600" />
                    <span className="text-red-700">Embedding failed</span>
                  </>
                )}
              </div>
            )}
          </label>
        </div>

        <div className={`flex items-start gap-2 ${processing && assignCompetencies && competencyStatus === 'pending' ? 'ring-2 ring-blue-400 ring-offset-1 rounded-md pr-2 animate-pulse' : ''}`}>
          <input
            id="assign-competencies"
            type="checkbox"
            className="h-4 w-4 mt-0.5"
            checked={assignCompetencies}
            onChange={(e) => {
              setAssignCompetencies(e.target.checked);
              if (e.target.checked && !generateEmbeddings) setGenerateEmbeddings(true);
            }}
            disabled={submitting || processing}
          />
          <label htmlFor="assign-competencies" className="text-sm">
            <div className="font-medium">Auto-assign competencies</div>
            <div className="text-xs text-muted-foreground">Use vector similarity to assign related competencies (requires embeddings)</div>
            {processing && assignCompetencies && (
              <div className="mt-1 text-xs flex items-center gap-1">
                {competencyStatus === 'pending' && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Assigning…</span>
                  </>
                )}
                {competencyStatus === 'success' && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Competencies set</span>
                  </>
                )}
                {competencyStatus === 'error' && (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-600" />
                    <span className="text-red-700">Assignment failed</span>
                  </>
                )}
              </div>
            )}
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
