'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { NormalizedQuestion } from '@/types/normalized';

const ANSWER_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

type Props = {
  open: boolean;
  question: NormalizedQuestion | null;
  onOpenChange: (open: boolean) => void;
  onSave: (question: NormalizedQuestion) => Promise<void> | void;
  saving?: boolean;
  // Optional post-save processing controls (admin use)
  showPostOptions?: boolean;
  onPostProcess?: (question: NormalizedQuestion, options: { embed?: boolean; assign?: boolean }) => Promise<void> | void;
  processing?: { embedding?: { status: 'idle' | 'pending' | 'success' | 'error'; progress: number }; competency?: { status: 'idle' | 'pending' | 'success' | 'error'; progress: number } };
};

type FormState = {
  prompt: string;
  choices: string[];
  questionType: 'single' | 'multiple';
  singleAnswer: number | null;
  multiAnswers: number[];
  explanation: string;
};

const DEFAULT_CHOICES = ['', '', '', '', ''];

export function QuestionEditorDialog({
  open,
  question,
  onOpenChange,
  onSave,
  saving = false,
  showPostOptions = false,
  onPostProcess,
  processing,
}: Props) {
  const [formState, setFormState] = useState<FormState>(() => ({
    prompt: '',
    choices: [...DEFAULT_CHOICES],
    questionType: 'single',
    singleAnswer: null,
    multiAnswers: [],
    explanation: '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [postEmbed, setPostEmbed] = useState(false);
  const [postAssign, setPostAssign] = useState(false);

  useEffect(() => {
    if (!question) {
      setFormState({
        prompt: '',
        choices: [...DEFAULT_CHOICES],
        questionType: 'single',
        singleAnswer: null,
        multiAnswers: [],
        explanation: '',
      });
      setError(null);
      return;
    }

    const choices = [...DEFAULT_CHOICES];
    question.choices.forEach((choice, index) => {
      choices[index] = choice;
    });

    setFormState({
      prompt: question.prompt,
      choices,
      questionType: question.questionType,
      singleAnswer:
        question.questionType === 'single'
          ? (question.answerIndex as number)
          : Array.isArray(question.answerIndex)
          ? question.answerIndex[0] ?? null
          : null,
      multiAnswers:
        question.questionType === 'multiple'
          ? Array.isArray(question.answerIndex)
            ? [...question.answerIndex]
            : []
          : [],
      explanation: question.explanation ?? '',
    });
    setError(null);
  }, [question]);

  const updateChoice = (index: number, value: string) => {
    setFormState((prev) => {
      const nextChoices = [...prev.choices];
      nextChoices[index] = value;
      return { ...prev, choices: nextChoices };
    });
  };

  const toggleMultiAnswer = (index: number) => {
    setFormState((prev) => {
      const exists = prev.multiAnswers.includes(index);
      const nextAnswers = exists
        ? prev.multiAnswers.filter((answer) => answer !== index)
        : [...prev.multiAnswers, index];
      return { ...prev, multiAnswers: nextAnswers };
    });
  };

  const handleSubmit = async () => {
    if (!question) return;

    const trimmedPrompt = formState.prompt.trim();
    if (!trimmedPrompt) {
      setError('Prompt is required.');
      return;
    }

    const trimmedChoices = formState.choices.map((choice) => choice.trim());
    const firstFour = trimmedChoices.slice(0, 4);

    if (firstFour.some((choice) => choice.length === 0)) {
      setError('Options A-D are required.');
      return;
    }

    let effectiveAnswers: number[];
    if (formState.questionType === 'single') {
      if (formState.singleAnswer === null) {
        setError('Select the correct answer.');
        return;
      }
      effectiveAnswers = [formState.singleAnswer];
    } else {
      if (formState.multiAnswers.length === 0) {
        setError('Select at least one correct answer.');
        return;
      }
      effectiveAnswers = [...formState.multiAnswers].sort();
    }

    const normalizedChoices = [...firstFour];
    const fifth = trimmedChoices[4];
    if (fifth) {
      normalizedChoices.push(fifth);
    }

    const updatedQuestion: NormalizedQuestion = {
      ...question,
      prompt: trimmedPrompt,
      choices:
        normalizedChoices.length === 5
          ? [
              normalizedChoices[0],
              normalizedChoices[1],
              normalizedChoices[2],
              normalizedChoices[3],
              normalizedChoices[4],
            ]
          : [
              normalizedChoices[0],
              normalizedChoices[1],
              normalizedChoices[2],
              normalizedChoices[3],
            ],
      questionType: formState.questionType,
      answerIndex:
        formState.questionType === 'single'
          ? (effectiveAnswers[0] as 0 | 1 | 2 | 3 | 4)
          : (effectiveAnswers as (0 | 1 | 2 | 3 | 4)[]),
      explanation: formState.explanation.trim() || undefined,
    };

    setError(null);
    try {
      await onSave(updatedQuestion);
      if (showPostOptions && (postEmbed || postAssign) && onPostProcess) {
        await onPostProcess(updatedQuestion, { embed: postEmbed, assign: postAssign });
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save question.';
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
          <DialogDescription>
            Update the prompt, options, and correct answers. Changes are saved to the shared exam
            bank.
          </DialogDescription>
        </DialogHeader>

        {!question && <div className="text-sm text-muted-foreground">No question selected.</div>}

        {question && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="prompt">
                  Prompt
                </label>
                <textarea
                  id="prompt"
                  className="w-full min-h-[110px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={formState.prompt}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, prompt: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium">Answer Options</span>
                <div className="grid gap-4 sm:grid-cols-2">
                  {ANSWER_LABELS.map((label, index) => (
                    <div key={label} className={`space-y-1 ${index >= 4 ? 'sm:col-span-2' : ''}`}>
                      <div className="flex items-center justify-between text-sm font-medium">
                        <label htmlFor={`option-${label}`}>Option {label}</label>
                        {index >= 4 && formState.choices[index]?.trim() && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() => updateChoice(index, '')}
                          >
                            Clear option
                          </button>
                        )}
                      </div>
                      <input
                        id={`option-${label}`}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={formState.choices[index] ?? ''}
                        placeholder={index < 4 ? `Enter option ${label}` : 'Optional fifth option'}
                        onChange={(event) => updateChoice(index, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="explanation">
                  Explanation (optional)
                </label>
                <textarea
                  id="explanation"
                  className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={formState.explanation}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, explanation: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="question-type">
                  Question Type
                </label>
                <select
                  id="question-type"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={formState.questionType}
                  onChange={(event) => {
                    const nextType = event.target.value as 'single' | 'multiple';
                    setFormState((prev) => {
                      if (nextType === 'single') {
                        return {
                          ...prev,
                          questionType: 'single',
                          singleAnswer: prev.singleAnswer ?? prev.multiAnswers[0] ?? null,
                          multiAnswers: [],
                        };
                      }

                      const seedAnswers = prev.multiAnswers.length
                        ? prev.multiAnswers
                        : prev.singleAnswer !== null
                        ? [prev.singleAnswer]
                        : [];

                      return {
                        ...prev,
                        questionType: 'multiple',
                        multiAnswers: seedAnswers,
                      };
                    });
                  }}
                >
                  <option value="single">Single Select</option>
                  <option value="multiple">Multiple Select</option>
                </select>
              </div>

              <div className="space-y-3">
                <span className="text-sm font-medium">
                  Correct Answer{formState.questionType === 'multiple' ? 's' : ''}
                </span>
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                  {ANSWER_LABELS.map((label, index) => {
                    const choice = formState.choices[index]?.trim();
                    if (index >= 4 && !choice) {
                      return null;
                    }

                    if (formState.questionType === 'single') {
                      return (
                        <label key={label} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="correct-answer"
                            checked={formState.singleAnswer === index}
                            onChange={() =>
                              setFormState((prev) => ({ ...prev, singleAnswer: index }))
                            }
                          />
                          <span>
                            {label}. {choice}
                          </span>
                        </label>
                      );
                    }

                    const isSelected = formState.multiAnswers.includes(index);
                    return (
                      <label key={label} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMultiAnswer(index)}
                        />
                        <span>
                          {label}. {choice}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {showPostOptions && (
                <div className="space-y-2 border-t pt-4">
                  <span className="text-sm font-medium">Post-save processing (optional)</span>
                  <div className="flex items-start gap-2">
                    <input
                      id="post-embed"
                      type="checkbox"
                      className="h-4 w-4 mt-0.5"
                      checked={postEmbed}
                      onChange={(e) => setPostEmbed(e.target.checked)}
                      disabled={saving}
                    />
                    <label htmlFor="post-embed" className="text-sm">
                      <div className="font-medium">Generate embeddings</div>
                      <div className="text-xs text-muted-foreground">Create or refresh the question&rsquo;s vector embedding</div>
                    </label>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      id="post-assign"
                      type="checkbox"
                      className="h-4 w-4 mt-0.5"
                      checked={postAssign}
                      onChange={(e) => setPostAssign(e.target.checked)}
                      disabled={saving}
                    />
                    <label htmlFor="post-assign" className="text-sm">
                      <div className="font-medium">Auto-assign competencies</div>
                      <div className="text-xs text-muted-foreground">Use vector similarity to assign related competencies</div>
                    </label>
                  </div>

                  {(processing?.embedding && processing.embedding.status !== 'idle') && (
                    <div className="mt-2">
                      <div className="text-xs text-muted-foreground mb-1">Embedding</div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className={`h-full ${processing.embedding.status === 'error' ? 'bg-red-500' : processing.embedding.status === 'success' ? 'bg-emerald-500' : 'bg-primary'} transition-all`} style={{ width: `${Math.max(5, Math.min(100, Math.round(processing.embedding.progress)))}%` }} />
                      </div>
                    </div>
                  )}
                  {(processing?.competency && processing.competency.status !== 'idle') && (
                    <div className="mt-2">
                      <div className="text-xs text-muted-foreground mb-1">Competency Assignment</div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className={`h-full ${processing.competency.status === 'error' ? 'bg-red-500' : processing.competency.status === 'success' ? 'bg-emerald-500' : 'bg-blue-500'} transition-all`} style={{ width: `${Math.max(5, Math.min(100, Math.round(processing.competency.progress)))}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
