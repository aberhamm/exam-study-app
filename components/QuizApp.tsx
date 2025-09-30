'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StudyPanel } from '@/components/StudyPanel';
import { useHeader } from '@/contexts/HeaderContext';
import { Timer } from '@/components/Timer';
import { QuestionEditorDialog } from '@/components/QuestionEditorDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { MarkdownContent } from '@/components/ui/markdown';
import type { NormalizedQuestion } from '@/types/normalized';
import type { TestSettings } from '@/lib/test-settings';
import { shuffleArray } from '@/lib/question-utils';
import { APP_CONFIG } from '@/lib/app-config';
import { denormalizeQuestion, normalizeQuestions } from '@/lib/normalize';
import {
  saveExamState,
  clearExamState,
  createExamState,
  updateExamState,
  type ExamState,
} from '@/lib/exam-state';
import {
  recordQuestionSeen,
  recordQuestionResult,
} from '@/lib/question-metrics';

type QuizState = {
  currentQuestionIndex: number;
  selectedAnswers: (number | number[] | null)[];
  showResult: boolean;
  showFeedback: boolean;
  score: number;
  incorrectAnswers: Array<{
    question: NormalizedQuestion;
    selectedIndex: number | number[];
    correctIndex: number | number[];
  }>;
  timerRunning: boolean;
  timeElapsed: number; // in seconds
};

type Props = {
  questions: NormalizedQuestion[];
  testSettings: TestSettings;
  onBackToSettings: () => void;
  initialExamState?: ExamState | null;
  examId: string;
  examTitle?: string;
};

export function QuizApp({
  questions: preparedQuestions,
  testSettings,
  onBackToSettings,
  initialExamState,
  examId,
  examTitle,
}: Props) {
  const [questions, setQuestions] = useState<NormalizedQuestion[]>(
    initialExamState?.questions || preparedQuestions
  );
  const { setConfig } = useHeader();
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<NormalizedQuestion | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const successTimeoutRef = useRef<number | null>(null);
  const [quizState, setQuizState] = useState<QuizState>({
    currentQuestionIndex: initialExamState?.currentQuestionIndex || 0,
    selectedAnswers: initialExamState?.selectedAnswers || [],
    showResult: initialExamState?.showResult || false,
    showFeedback: initialExamState?.showFeedback || false,
    score: initialExamState?.score || 0,
    incorrectAnswers: initialExamState?.incorrectAnswers || [],
    timerRunning: initialExamState?.timerRunning ?? true,
    timeElapsed: initialExamState?.timeElapsed || 0,
  });
  const seenQuestionsRef = useRef<Set<string>>(new Set());
  const scoredQuestionsRef = useRef<Set<string>>(new Set());

  const evaluateAnswer = useCallback(
    (question: NormalizedQuestion, selected: number | number[] | null): 'correct' | 'incorrect' | 'unanswered' => {
      if (selected === null || (Array.isArray(selected) && selected.length === 0)) {
        return 'unanswered';
      }

      const correctIndex = question.answerIndex;

      if (Array.isArray(correctIndex)) {
        if (!Array.isArray(selected)) {
          return 'incorrect';
        }
        if (correctIndex.length !== selected.length) {
          return 'incorrect';
        }

        const sortedCorrect = [...correctIndex].sort();
        const sortedSelected = [...selected].sort();
        for (let i = 0; i < sortedCorrect.length; i++) {
          if (sortedCorrect[i] !== sortedSelected[i]) {
            return 'incorrect';
          }
        }
        return 'correct';
      }

      if (Array.isArray(selected)) {
        return 'incorrect';
      }

      return selected === correctIndex ? 'correct' : 'incorrect';
    },
    []
  );

  // Ensure questions are set when component mounts or props change
  useEffect(() => {
    if (!initialExamState) {
      setQuestions(preparedQuestions);
    }
  }, [preparedQuestions, initialExamState]);

  // Save exam state to localStorage whenever quiz state changes
  useEffect(() => {
    if (!quizState.showResult && questions.length > 0) {
      const examState = createExamState(questions, testSettings, examId);
      const updatedState = updateExamState(examState, {
        currentQuestionIndex: quizState.currentQuestionIndex,
        selectedAnswers: quizState.selectedAnswers,
        showResult: quizState.showResult,
        showFeedback: quizState.showFeedback,
        score: quizState.score,
        incorrectAnswers: quizState.incorrectAnswers,
        timerRunning: quizState.timerRunning,
        timeElapsed: quizState.timeElapsed,
      });
      saveExamState(updatedState);
    }
  }, [quizState, questions, testSettings, examId]);

  // Configure header based on quiz state
  useEffect(() => {
    if (quizState.showResult) {
      // Results page - simple header
      setConfig({
        variant: 'short',
        title: examTitle,
        leftContent: null,
        rightContent: null,
        visible: true,
      });
    } else if (!questions || questions.length === 0) {
      // No questions - simple header
      setConfig({
        variant: 'short',
        title: examTitle,
        leftContent: null,
        rightContent: null,
        visible: true,
      });
    } else {
      // Main quiz - compact header with a single quit button
      setConfig({
        variant: 'short',
        title: examTitle,
        leftContent: (
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="bg-muted px-2 py-1 rounded">
              {testSettings.questionType === 'all'
                ? 'All Types'
                : testSettings.questionType === 'single'
                ? 'Single Select'
                : 'Multiple Select'}
            </span>
            <span>•</span>
            <span>{testSettings.questionCount} questions</span>
          </div>
        ),
        rightContent: (
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQuitDialog(true)}
            >
              Quit and go Home
            </Button>
          </div>
        ),
        visible: true,
      });
    }
  }, [quizState.showResult, questions, testSettings, onBackToSettings, setConfig, examTitle]);

  const currentQuestion = questions?.[quizState.currentQuestionIndex];
  const totalQuestions = questions?.length || 0;
  const isLastQuestion = quizState.currentQuestionIndex === totalQuestions - 1;

  useEffect(() => {
    if (!currentQuestion) return;
    if (!seenQuestionsRef.current.has(currentQuestion.id)) {
      recordQuestionSeen(currentQuestion.id);
      seenQuestionsRef.current.add(currentQuestion.id);
    }
  }, [currentQuestion]);

  useEffect(() => {
    if (!currentQuestion || !quizState.showFeedback) {
      return;
    }

    if (scoredQuestionsRef.current.has(currentQuestion.id)) {
      return;
    }

    const selected = quizState.selectedAnswers[quizState.currentQuestionIndex] ?? null;
    const outcome = evaluateAnswer(currentQuestion, selected);
    if (outcome === 'correct' || outcome === 'incorrect') {
      recordQuestionResult(currentQuestion.id, outcome);
      scoredQuestionsRef.current.add(currentQuestion.id);
    }
  }, [currentQuestion, quizState.showFeedback, quizState.selectedAnswers, quizState.currentQuestionIndex, evaluateAnswer]);

  // Note: Disabled localStorage persistence since questions are randomized
  // Loading a saved state wouldn't match the current question order

  const finishQuiz = useCallback(() => {
    if (!questions) return;

    let score = 0;
    const incorrectAnswers: QuizState['incorrectAnswers'] = [];

    questions.forEach((question, index) => {
      const selected = quizState.selectedAnswers[index] ?? null;
      const correctIndex = question.answerIndex;
      const outcome = evaluateAnswer(question, selected);

      if (outcome === 'correct') {
        score++;
      } else if (outcome === 'incorrect' && selected !== null) {
        incorrectAnswers.push({
          question,
          selectedIndex: selected,
          correctIndex,
        });
      }

      if ((outcome === 'correct' || outcome === 'incorrect') && !scoredQuestionsRef.current.has(question.id)) {
        recordQuestionResult(question.id, outcome);
        scoredQuestionsRef.current.add(question.id);
      }
    });

    const finalState = {
      ...quizState,
      showResult: true,
      score,
      incorrectAnswers,
    };

    setQuizState(finalState);
  }, [questions, quizState, evaluateAnswer]);

  const selectAnswer = useCallback(
    (answerIndex: number) => {
      if (!questions || quizState.showFeedback) return;

      const currentQuestion = questions[quizState.currentQuestionIndex];
      const newSelectedAnswers = [...quizState.selectedAnswers];

      if (currentQuestion.questionType === 'multiple') {
        // For multiple choice, toggle selection and don't show feedback until submit
        const currentSelected = newSelectedAnswers[quizState.currentQuestionIndex];
        const selectedArray = Array.isArray(currentSelected) ? currentSelected : [];

        if (selectedArray.includes(answerIndex)) {
          // Remove if already selected
          newSelectedAnswers[quizState.currentQuestionIndex] = selectedArray.filter(
            (idx) => idx !== answerIndex
          );
        } else {
          // Add to selection
          newSelectedAnswers[quizState.currentQuestionIndex] = [...selectedArray, answerIndex];
        }

        const newState = {
          ...quizState,
          selectedAnswers: newSelectedAnswers,
          // Don't show feedback for multiple choice until submit is pressed
        };
        setQuizState(newState);
      } else {
        // For single choice, show feedback immediately
        newSelectedAnswers[quizState.currentQuestionIndex] = answerIndex;

        const newState = {
          ...quizState,
          selectedAnswers: newSelectedAnswers,
          showFeedback: true,
        };
        setQuizState(newState);
      }
    },
    [questions, quizState]
  );

  const submitMultipleAnswer = useCallback(() => {
    if (!questions || quizState.showFeedback) return;

    const newState = {
      ...quizState,
      showFeedback: true,
    };
    setQuizState(newState);
  }, [questions, quizState]);

  const nextQuestion = useCallback(() => {
    if (isLastQuestion) {
      finishQuiz();
    } else {
      const newState = {
        ...quizState,
        currentQuestionIndex: quizState.currentQuestionIndex + 1,
        showFeedback: false,
      };
      setQuizState(newState);
    }
  }, [isLastQuestion, quizState, finishQuiz]);

  const resetQuiz = () => {
    // Clear exam state from localStorage
    clearExamState();

    // Randomize questions again on reset
    setQuestions(shuffleArray(preparedQuestions));
    seenQuestionsRef.current = new Set();
    scoredQuestionsRef.current = new Set();

    const resetState = {
      currentQuestionIndex: 0,
      selectedAnswers: [],
      showResult: false,
      showFeedback: false,
      score: 0,
      incorrectAnswers: [],
      timerRunning: true,
      timeElapsed: 0,
    };

    setQuizState(resetState);
  };
  const handleTimeUp = useCallback(() => {
    finishQuiz();
  }, [finishQuiz]);

  const handleTimeUpdate = useCallback(
    (remainingSeconds: number) => {
      const totalTime = testSettings.timerDuration * 60;
      const elapsed = totalTime - remainingSeconds;
      setQuizState((prev) => ({ ...prev, timeElapsed: elapsed }));
    },
    [testSettings.timerDuration]
  );

  const openQuestionEditor = () => {
    if (!currentQuestion) return;
    setEditingQuestion(currentQuestion);
    setEditError(null);
    setEditDialogOpen(true);
  };

  const handleQuestionSave = async (updatedQuestion: NormalizedQuestion) => {
    if (!examId) {
      const message = 'Exam ID is required to save edits.';
      setEditError(message);
      throw new Error(message);
    }

    setIsSavingQuestion(true);
    setEditError(null);
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }

    try {
      const payload = denormalizeQuestion(updatedQuestion);
      const response = await fetch(`/api/exams/${examId}/questions/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const message = typeof details?.error === 'string'
          ? details.error
          : `Failed to save question (HTTP ${response.status})`;
        throw new Error(message);
      }

      const json = await response.json();
      const [normalized] = normalizeQuestions([json]);

      setQuestions((prev) =>
        prev.map((question) => (question.id === normalized.id ? normalized : question))
      );

      setQuizState((prev) => ({
        ...prev,
        incorrectAnswers: prev.incorrectAnswers.map((entry) =>
          entry.question.id === normalized.id
            ? { ...entry, question: normalized }
            : entry
        ),
      }));

      setEditingQuestion(normalized);
      setEditDialogOpen(false);
      setEditSuccess('Question updated successfully.');
      successTimeoutRef.current = window.setTimeout(() => {
        setEditSuccess(null);
        successTimeoutRef.current = null;
      }, 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save question.';
      setEditError(message);
      throw new Error(message);
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!currentQuestion || quizState.showResult) return;
      // Disable global shortcuts while any dialog is open
      if (editDialogOpen || showQuitDialog) return;

      if (e.key >= '1' && e.key <= '5') {
        const answerIndex = parseInt(e.key) - 1;
        if (answerIndex < currentQuestion.choices.length) {
          selectAnswer(answerIndex);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (quizState.showFeedback) {
          e.preventDefault();
          nextQuestion();
        } else if (currentQuestion.questionType === 'multiple') {
          // For multiple choice, Enter/Space should submit the answer
          e.preventDefault();
          submitMultipleAnswer();
        }
      }
    },
    [
      currentQuestion,
      quizState.showFeedback,
      quizState.showResult,
      editDialogOpen,
      showQuitDialog,
      selectAnswer,
      nextQuestion,
      submitMultipleAnswer,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle page visibility changes to pause/resume timer
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!quizState.showResult) {
        setQuizState((prev) => ({
          ...prev,
          timerRunning: !document.hidden,
        }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [quizState.showResult]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Early return if no questions available (should not happen with proper setup)
  if (!questions || questions.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">No Questions Available</h2>
            <p>No questions found to display.</p>
            <Button
              onClick={() => {
                clearExamState();
                onBackToSettings();
              }}
              className="mt-4"
            >
              Home
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (quizState.showResult) {
    const percentage = Math.round((quizState.score / totalQuestions) * 100);
    const timeElapsedMinutes = Math.floor(quizState.timeElapsed / 60);
    const timeElapsedSeconds = quizState.timeElapsed % 60;
    const formattedElapsedTime = `${timeElapsedMinutes}:${timeElapsedSeconds
      .toString()
      .padStart(2, '0')}`;

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">Quiz Complete!</h2>
            <div className="text-4xl font-bold text-primary">
              {quizState.score}/{totalQuestions} ({percentage}%)
            </div>
            <div className="text-lg text-muted-foreground">Time taken: {formattedElapsedTime}</div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={resetQuiz} size="lg">
                Start New Quiz
              </Button>
              <Button
                onClick={() => {
                  clearExamState();
                  onBackToSettings();
                }}
                variant="outline"
                size="lg"
              >
                Home
              </Button>
            </div>
          </div>
        </Card>

        {quizState.incorrectAnswers.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Review Incorrect Answers</h2>
            <div className="space-y-6">
              {quizState.incorrectAnswers.map(({ question, selectedIndex, correctIndex }) => (
                <div key={question.id} className="border-b pb-4 last:border-b-0">
                  <div className="font-medium mb-3">{question.prompt}</div>

                  <div className="space-y-2 mb-4">
                    {question.choices.map((choice, choiceIndex) => {
                      let isCorrect = false;
                      let isSelected = false;

                      isCorrect = choiceIndex === correctIndex;
                      isSelected = choiceIndex === selectedIndex;

                      return (
                        <div
                          key={choiceIndex}
                          className={`p-3 rounded-lg border-2 ${
                            isCorrect
                              ? 'border-green-500 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200'
                              : isSelected && !isCorrect
                              ? 'border-red-500 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <span className="font-medium">
                            {String.fromCharCode(65 + choiceIndex)}.
                          </span>{' '}
                          {choice}
                          {isCorrect && (
                            <span className="ml-2 text-green-600 dark:text-green-400 font-semibold">
                              ✓ Correct
                            </span>
                          )}
                          {isSelected && !isCorrect && (
                            <span className="ml-2 text-red-600 dark:text-red-400 font-semibold">
                              ✗ Your answer
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {question.explanation && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                        Explanation:
                      </div>
                      <MarkdownContent variant="explanation">
                        {question.explanation}
                      </MarkdownContent>
                    </div>
                  )}

                  {question.study && <StudyPanel study={question.study} />}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  const selectedAnswerIndex = quizState.selectedAnswers[quizState.currentQuestionIndex];

  // Determine if current answer is correct for border styling
  let isCurrentAnswerCorrect = false;
  if (currentQuestion && quizState.showFeedback) {
    if (currentQuestion.questionType === 'single') {
      isCurrentAnswerCorrect = selectedAnswerIndex === currentQuestion.answerIndex;
    } else {
      // For multiple choice, check if all selected answers are correct and no correct answers are missed
      const selectedArray = Array.isArray(selectedAnswerIndex) ? selectedAnswerIndex : [];
      const correctArray = Array.isArray(currentQuestion.answerIndex)
        ? currentQuestion.answerIndex
        : [];

      const allSelectedAreCorrect = selectedArray.every((idx) =>
        correctArray.includes(idx as 0 | 1 | 2 | 3)
      );
      const allCorrectAreSelected = correctArray.every((idx) => selectedArray.includes(idx));

      isCurrentAnswerCorrect =
        allSelectedAreCorrect && allCorrectAreSelected && selectedArray.length > 0;
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header - Exam Title */}
      {examTitle && (
        <div className="text-center lg:text-left">
          <h1 className="text-2xl font-bold">{examTitle}</h1>
        </div>
      )}
      {/* Mobile Header Actions */}
      <div className="md:hidden flex justify-between items-center text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="bg-muted px-2 py-1 rounded">
            {testSettings.questionType === 'all'
              ? 'All Types'
              : testSettings.questionType === 'single'
              ? 'Single Select'
              : 'Multiple Select'}
          </span>
          <span>•</span>
          <span>{testSettings.questionCount} questions</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQuitDialog(true)}
          >
            Quit and go Home
          </Button>
        </div>
      </div>

      {/* Timer and Progress Indicator */}
      <div className="flex items-center justify-between gap-6">
        {/* Timer (1/4 width) */}
        <div className="flex-shrink-0 w-1/4">
          <Timer
            initialMinutes={testSettings.timerDuration}
            isRunning={quizState.timerRunning && !quizState.showResult}
            onTimeUp={handleTimeUp}
            onTimeUpdate={handleTimeUpdate}
            timeElapsed={quizState.timeElapsed}
          />
        </div>

        {/* Progress Indicator (3/4 width) */}
        <div className="flex-grow text-center">
          <div className="text-lg font-medium">
            Question {quizState.currentQuestionIndex + 1} of {totalQuestions}
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((quizState.currentQuestionIndex + 1) / totalQuestions) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Question */}
      {editError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {editError}
        </div>
      )}

      {editSuccess && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/40 dark:text-green-200">
          {editSuccess}
        </div>
      )}

      <Card className="p-6">
        <div>
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold flex-1" role="heading" aria-level={2}>
              {currentQuestion?.prompt}
            </h2>
            <div className="flex flex-col items-end gap-2">
              {APP_CONFIG.DEV_FEATURES_ENABLED && (
              <Button
                variant="outline"
                size="sm"
                onClick={openQuestionEditor}
                disabled={!currentQuestion || isSavingQuestion}
              >
                Edit Question
              </Button>
              )}
              {quizState.showFeedback && (
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
          <div className="text-base font-medium text-foreground">
            {currentQuestion?.questionType === 'multiple'
              ? 'Select all that apply.'
              : 'Select one answer.'}
          </div>
        </div>

        <div
          className="space-y-3"
          role={currentQuestion?.questionType === 'multiple' ? 'group' : 'radiogroup'}
          aria-label="Answer choices"
          aria-required="true"
        >
          {currentQuestion?.choices.map((choice, index) => {
            let isSelected = false;
            if (currentQuestion.questionType === 'single') {
              isSelected = selectedAnswerIndex === index;
            } else {
              const selectedArray = Array.isArray(selectedAnswerIndex) ? selectedAnswerIndex : [];
              isSelected = selectedArray.includes(index);
            }

            let showCorrect = false;
            if (quizState.showFeedback) {
              if (currentQuestion.questionType === 'single') {
                showCorrect = index === currentQuestion.answerIndex;
              } else {
                // For multiple choice, only show green if the answer is both correct AND selected
                const correctArray = Array.isArray(currentQuestion.answerIndex)
                  ? currentQuestion.answerIndex
                  : [];
                const isCorrectAnswer = correctArray.includes(index as 0 | 1 | 2 | 3 | 4);
                showCorrect = isCorrectAnswer && isSelected;
              }
            }

            const showIncorrect = quizState.showFeedback && isSelected && !showCorrect;

            // For multiple choice, show missed correct answers in a subtle way
            let showMissedCorrect = false;
            if (quizState.showFeedback && currentQuestion.questionType === 'multiple') {
              const correctArray = Array.isArray(currentQuestion.answerIndex)
                ? currentQuestion.answerIndex
                : [];
              const isCorrectAnswer = correctArray.includes(index as 0 | 1 | 2 | 3);
              showMissedCorrect = isCorrectAnswer && !isSelected;
            }

            return (
              <button
                key={index}
                onClick={() => selectAnswer(index)}
                disabled={quizState.showFeedback}
                className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                  showCorrect
                    ? 'border-green-600 bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100'
                    : showIncorrect
                    ? 'border-red-600 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100'
                    : showMissedCorrect
                    ? 'border-green-300 bg-green-25 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-dashed'
                    : quizState.showFeedback
                    ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    : isSelected
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                } ${quizState.showFeedback ? 'cursor-default' : 'cursor-pointer'}`}
                role={currentQuestion.questionType === 'multiple' ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                aria-readonly={quizState.showFeedback}
                aria-describedby={quizState.showFeedback ? `answer-${index}-feedback` : undefined}
                tabIndex={0}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{String.fromCharCode(65 + index)}.</span>
                    <span>{choice}</span>
                  </div>
                  {currentQuestion.questionType === 'multiple' && (
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
        {currentQuestion?.questionType === 'multiple' && !quizState.showFeedback && (
          <div className="mt-6">
            <Button
              onClick={submitMultipleAnswer}
              size="lg"
              className="w-full"
              disabled={
                !selectedAnswerIndex ||
                (Array.isArray(selectedAnswerIndex) && selectedAnswerIndex.length === 0)
              }
            >
              Submit Answer
            </Button>
          </div>
        )}

        {quizState.showFeedback && (
          <div className="mt-6 space-y-4">
            {currentQuestion?.explanation && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                  Explanation:
                </div>
                <MarkdownContent variant="explanation">
                  {currentQuestion.explanation}
                </MarkdownContent>
              </div>
            )}

            {currentQuestion?.study && <StudyPanel study={currentQuestion.study} />}

            <Button onClick={nextQuestion} size="lg" className="w-full">
              {isLastQuestion ? 'Finish Quiz' : 'Next Question'}
            </Button>
          </div>
        )}
      </Card>

      {/* Keyboard Instructions */}
      <div className="text-center text-sm text-muted-foreground">
        {currentQuestion?.questionType === 'multiple'
          ? quizState.showFeedback
            ? 'Use Enter/Space to continue to next question'
            : 'Use keys 1-5 to toggle selections, Enter/Space to submit'
          : 'Use keys 1-5 to select answers, Enter/Space to continue'}
      </div>

      {/* Quit Confirmation Dialog */}
      <Dialog open={showQuitDialog} onOpenChange={setShowQuitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quit Exam</DialogTitle>
            <DialogDescription>
              Are you sure you want to quit and go home? This will lose your current progress.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuitDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowQuitDialog(false);
                clearExamState();
                onBackToSettings();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Quit and go Home
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuestionEditorDialog
        open={editDialogOpen}
        question={editingQuestion}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingQuestion(null);
            setEditError(null);
          }
        }}
        onSave={handleQuestionSave}
        saving={isSavingQuestion}
      />
    </div>
  );
}
