'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StudyPanel } from '@/components/StudyPanel';
import { MarkdownContent } from '@/components/ui/markdown';
import type { NormalizedQuestion } from '@/types/normalized';
import { useSession } from 'next-auth/react';
import { Sparkles, Save, Loader2, Trash2, Flag, FlagOff } from 'lucide-react';

type Props = {
  question: NormalizedQuestion;
  selectedAnswers: number | number[] | null;
  showFeedback: boolean;
  isCurrentAnswerCorrect: boolean;
  onSelectAnswer: (answerIndex: number) => void;
  onSubmitMultipleAnswer: () => void;
  showCompetencies?: boolean;
  // Admin features for question editing
  isSavingQuestion?: boolean;
  onOpenQuestionEditor?: () => void;
  // Admin features for flagging
  onFlagQuestion?: () => void;
  onUnflagQuestion?: () => void;
  isFlaggingQuestion?: boolean;
  // Admin features for explanation generation
  onGenerateExplanation?: () => void;
  onSaveExplanation?: () => void;
  onDeleteExplanation?: () => void;
  isGeneratingExplanation?: boolean;
  isSavingExplanation?: boolean;
  isDeletingExplanation?: boolean;
  aiExplanation?: string | null;
};

export function QuestionCard({
  question,
  selectedAnswers,
  showFeedback,
  isCurrentAnswerCorrect,
  onSelectAnswer,
  onSubmitMultipleAnswer,
  showCompetencies,
  isSavingQuestion = false,
  onOpenQuestionEditor,
  onFlagQuestion,
  onUnflagQuestion,
  isFlaggingQuestion = false,
  onGenerateExplanation,
  onSaveExplanation,
  onDeleteExplanation,
  isGeneratingExplanation = false,
  isSavingExplanation = false,
  isDeletingExplanation = false,
  aiExplanation,
}: Props) {
  // Get competencies directly from the question
  const competencies = question.competencies || [];
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  return (
    <Card className="p-6">
      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold flex-1" role="heading" aria-level={2}>
            {question.prompt}
          </h2>
          <div className="flex flex-col items-end gap-2">
            {isAdmin && (
              <div className="flex gap-2">
                {onOpenQuestionEditor && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenQuestionEditor}
                    disabled={isSavingQuestion}
                  >
                    Edit Question
                  </Button>
                )}
                {question.flaggedForReview ? (
                  onUnflagQuestion && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onUnflagQuestion}
                      disabled={isFlaggingQuestion}
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-950/50"
                      title={question.flaggedReason || 'Flagged for review'}
                    >
                      {isFlaggingQuestion ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <FlagOff className="h-4 w-4 mr-1" />
                          Unflag
                        </>
                      )}
                    </Button>
                  )
                ) : (
                  onFlagQuestion && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onFlagQuestion}
                      disabled={isFlaggingQuestion}
                    >
                      {isFlaggingQuestion ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Flag className="h-4 w-4 mr-1" />
                          Flag
                        </>
                      )}
                    </Button>
                  )
                )}
              </div>
            )}
            {showFeedback && (
              <div className="flex-shrink-0 mt-1">
                {isCurrentAnswerCorrect ? (
                  <div className="flex items-center text-green-600 dark:text-green-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="sr-only">Correct answer</span>
                  </div>
                ) : (
                  <div className="flex items-center text-red-600 dark:text-red-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="sr-only">Incorrect answer</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-base font-medium text-foreground">
            {question.questionType === 'multiple' ? 'Select all that apply.' : 'Select one answer.'}
          </div>
          {showCompetencies && competencies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {competencies.map((competency) => (
                <span
                  key={competency.id}
                  className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                >
                  {competency.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="space-y-3"
        role={question.questionType === 'multiple' ? 'group' : 'radiogroup'}
        aria-label="Answer choices"
        aria-required="true"
      >
        {question.choices.map((choice, index) => {
          let isSelected = false;
          if (question.questionType === 'single') {
            isSelected = selectedAnswers === index;
          } else {
            const selectedArray = Array.isArray(selectedAnswers) ? selectedAnswers : [];
            isSelected = selectedArray.includes(index);
          }

          let showCorrect = false;
          if (showFeedback) {
            if (question.questionType === 'single') {
              showCorrect = index === question.answerIndex;
            } else {
              // For multiple choice, only show green if the answer is both correct AND selected
              const correctArray = Array.isArray(question.answerIndex) ? question.answerIndex : [];
              const isCorrectAnswer = correctArray.includes(index as 0 | 1 | 2 | 3 | 4);
              showCorrect = isCorrectAnswer && isSelected;
            }
          }

          const showIncorrect = showFeedback && isSelected && !showCorrect;

          // For multiple choice, show missed correct answers in a subtle way
          let showMissedCorrect = false;
          if (showFeedback && question.questionType === 'multiple') {
            const correctArray = Array.isArray(question.answerIndex) ? question.answerIndex : [];
            const isCorrectAnswer = correctArray.includes(index as 0 | 1 | 2 | 3);
            showMissedCorrect = isCorrectAnswer && !isSelected;
          }

          return (
            <button
              key={index}
              onClick={() => onSelectAnswer(index)}
              disabled={showFeedback}
              className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                showCorrect
                  ? 'border-green-600 bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100'
                  : showIncorrect
                  ? 'border-red-600 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100'
                  : showMissedCorrect
                  ? 'border-green-300 bg-green-25 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-dashed'
                  : showFeedback
                  ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  : isSelected
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              } ${showFeedback ? 'cursor-default' : 'cursor-pointer'}`}
              role={question.questionType === 'multiple' ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              aria-readonly={showFeedback}
              aria-describedby={showFeedback ? `answer-${index}-feedback` : undefined}
              tabIndex={0}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{String.fromCharCode(65 + index)}.</span>
                  <span>{choice}</span>
                </div>
                {question.questionType === 'multiple' && (
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? 'bg-primary border-primary'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground"></div>
                    )}
                  </div>
                )}
              </div>
              {/* Screen reader only feedback */}
              {showCorrect && <span className="sr-only">Correct answer, selected</span>}
              {showIncorrect && <span className="sr-only">Incorrect answer, selected</span>}
              {showMissedCorrect && <span className="sr-only">Correct answer, not selected</span>}
            </button>
          );
        })}
      </div>

      {/* Submit button for multiple select questions */}
      {question.questionType === 'multiple' && !showFeedback && (
        <div className="mt-6">
          <Button
            onClick={onSubmitMultipleAnswer}
            size="lg"
            className="w-full"
            disabled={
              !selectedAnswers || (Array.isArray(selectedAnswers) && selectedAnswers.length === 0)
            }
          >
            Submit Answer
          </Button>
        </div>
      )}

      {showFeedback && (
        <div className="mt-6 space-y-4">
          {/* Auto-generating explanation loading state */}
          {!question.explanation && isGeneratingExplanation && (
            <div className="p-4 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="flex items-center gap-2 text-purple-800 dark:text-purple-200">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-medium">Generating explanation...</span>
              </div>
              <p className="mt-2 text-sm text-purple-700 dark:text-purple-300">
                Please wait while we create a detailed explanation for this question.
              </p>
            </div>
          )}

          {/* Current/Default Explanation */}
          {question.explanation && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-blue-800 dark:text-blue-200">Explanation:</div>
                  {question.explanationGeneratedByAI && (
                    <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                          clipRule="evenodd"
                        />
                      </svg>
                      AI Generated
                    </div>
                  )}
                </div>
                {isAdmin && onDeleteExplanation && (
                  <Button
                    onClick={onDeleteExplanation}
                    disabled={isDeletingExplanation}
                    variant="ghost"
                    size="sm"
                    className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50"
                  >
                    {isDeletingExplanation ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </>
                    )}
                  </Button>
                )}
              </div>
              <MarkdownContent variant="explanation">{question.explanation}</MarkdownContent>
            </div>
          )}

          {/* Admin: AI Explanation Management */}
          {isAdmin && onGenerateExplanation && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              {/* Admin section header */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Sparkles className="h-4 w-4" />
                <span>AI Explanation Generator</span>
              </div>

              {/* Generate button and AI preview */}
              <div className="space-y-3">
                {/* AI-generated explanation preview */}
                {aiExplanation ? (
                  <>
                    <div className="p-4 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <span className="font-medium text-purple-800 dark:text-purple-200">
                          AI-Generated Preview:
                        </span>
                      </div>
                      <MarkdownContent variant="explanation">{aiExplanation}</MarkdownContent>
                    </div>

                    {/* Action buttons when AI explanation exists */}
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={onGenerateExplanation}
                        disabled={isGeneratingExplanation || isSavingExplanation}
                        variant="outline"
                        size="sm"
                      >
                        {isGeneratingExplanation ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate New
                          </>
                        )}
                      </Button>

                      {onSaveExplanation && (
                        <Button
                          onClick={onSaveExplanation}
                          disabled={isSavingExplanation}
                          size="sm"
                          variant="default"
                        >
                          {isSavingExplanation ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              {question.explanation ? 'Replace Current' : 'Save Explanation'}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  /* Generate button when no AI explanation exists */
                  <Button
                    onClick={onGenerateExplanation}
                    disabled={isGeneratingExplanation || isSavingExplanation}
                    variant="default"
                    size="sm"
                  >
                    {isGeneratingExplanation ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating explanation...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate {question.explanation ? 'New' : ''} Explanation with AI
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {question.study && <StudyPanel study={question.study} />}
        </div>
      )}
    </Card>
  );
}
