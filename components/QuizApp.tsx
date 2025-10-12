'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { QuestionEditorDialog } from '@/components/QuestionEditorDialog';
import { QuizHeader } from '@/components/quiz/QuizHeader';
import { QuizProgress } from '@/components/quiz/QuizProgress';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { QuizResults } from '@/components/quiz/QuizResults';
import { QuizControls } from '@/components/quiz/QuizControls';
import { QuitDialog } from '@/components/quiz/QuitDialog';
import type { NormalizedQuestion } from '@/types/normalized';
import type { TestSettings } from '@/lib/test-settings';
import { shuffleArray } from '@/lib/question-utils';
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
import { toast } from 'sonner';

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

  // AI Explanation state
  const [isGeneratingExplanation, setIsGeneratingExplanation] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isSavingExplanation, setIsSavingExplanation] = useState(false);
  const [isDeletingExplanation, setIsDeletingExplanation] = useState(false);

  // Separate timeElapsed state to prevent re-renders every second
  const [timeElapsed, setTimeElapsed] = useState(initialExamState?.timeElapsed || 0);
  const timeElapsedRef = useRef(initialExamState?.timeElapsed || 0);

  const [quizState, setQuizState] = useState<QuizState>({
    currentQuestionIndex: initialExamState?.currentQuestionIndex || 0,
    selectedAnswers: initialExamState?.selectedAnswers || [],
    showResult: initialExamState?.showResult || false,
    showFeedback: initialExamState?.showFeedback || false,
    score: initialExamState?.score || 0,
    incorrectAnswers: initialExamState?.incorrectAnswers || [],
    timerRunning: initialExamState?.timerRunning ?? true,
  });
  const seenQuestionsRef = useRef<Set<string>>(new Set());
  const scoredQuestionsRef = useRef<Set<string>>(new Set());
  const persistEnabledRef = useRef<boolean>(true);

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
  // Note: timeElapsed is tracked separately and read from ref to avoid re-renders
  useEffect(() => {
    if (!persistEnabledRef.current) return;
    if (!quizState.showResult && questions.length > 0) {
      const examState = createExamState(questions, testSettings, examId, examTitle);
      const updatedState = updateExamState(examState, {
        currentQuestionIndex: quizState.currentQuestionIndex,
        selectedAnswers: quizState.selectedAnswers,
        showResult: quizState.showResult,
        showFeedback: quizState.showFeedback,
        score: quizState.score,
        incorrectAnswers: quizState.incorrectAnswers,
        timerRunning: quizState.timerRunning,
        timeElapsed: timeElapsedRef.current, // Read from ref instead of state
      });
      saveExamState(updatedState);
    }
  }, [quizState, questions, testSettings, examId, examTitle]);

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

  // Note: Question results are now tracked immediately in selectAnswer() and submitMultipleAnswer()
  // This ensures the metrics are recorded as soon as the user answers, not in a delayed effect

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

    // Update timeElapsed state from ref before finishing
    setTimeElapsed(timeElapsedRef.current);

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

        // Record the result immediately
        if (!scoredQuestionsRef.current.has(currentQuestion.id)) {
          const outcome = evaluateAnswer(currentQuestion, answerIndex);
          if (outcome === 'correct' || outcome === 'incorrect') {
            recordQuestionResult(currentQuestion.id, outcome);
            scoredQuestionsRef.current.add(currentQuestion.id);
          }
        }

        const newState = {
          ...quizState,
          selectedAnswers: newSelectedAnswers,
          showFeedback: true,
        };
        setQuizState(newState);
      }
    },
    [questions, quizState, evaluateAnswer]
  );

  const submitMultipleAnswer = useCallback(() => {
    if (!questions || quizState.showFeedback) return;

    const currentQuestion = questions[quizState.currentQuestionIndex];
    const selected = quizState.selectedAnswers[quizState.currentQuestionIndex] ?? null;

    // Record the result immediately
    if (!scoredQuestionsRef.current.has(currentQuestion.id)) {
      const outcome = evaluateAnswer(currentQuestion, selected);
      if (outcome === 'correct' || outcome === 'incorrect') {
        recordQuestionResult(currentQuestion.id, outcome);
        scoredQuestionsRef.current.add(currentQuestion.id);
      }
    }

    const newState = {
      ...quizState,
      showFeedback: true,
    };
    setQuizState(newState);
  }, [questions, quizState, evaluateAnswer]);

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
      // Clear AI explanation when moving to next question
      setAiExplanation(null);
    }
  }, [isLastQuestion, quizState, finishQuiz]);

  const resetQuiz = () => {
    // Clear exam state from localStorage
    clearExamState();

    // Randomize questions again on reset
    setQuestions(shuffleArray(preparedQuestions));
    seenQuestionsRef.current = new Set();
    scoredQuestionsRef.current = new Set();

    // Reset timer state
    setTimeElapsed(0);
    timeElapsedRef.current = 0;

    const resetState = {
      currentQuestionIndex: 0,
      selectedAnswers: [],
      showResult: false,
      showFeedback: false,
      score: 0,
      incorrectAnswers: [],
      timerRunning: true,
    };

    setQuizState(resetState);

    // Clear AI explanation state
    setAiExplanation(null);
  };

  const generateExplanation = useCallback(async () => {
    if (!currentQuestion || !examId) return;

    setIsGeneratingExplanation(true);

    try {
      const response = await fetch(`/api/exams/${examId}/questions/${currentQuestion.id}/explain`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to generate explanation`);
      }

      const data = await response.json();

      // If auto-saved (no existing explanation), update questions state
      if (data.savedAsDefault) {
        const updatedQuestions = questions.map(q =>
          q.id === currentQuestion.id
            ? { ...q, explanation: data.explanation, explanationGeneratedByAI: true }
            : q
        );
        setQuestions(updatedQuestions);
        setAiExplanation(null); // Clear AI explanation since it's now the default
        toast.success('Explanation generated and saved!');
      } else {
        // Has existing explanation, show in AI section for user to decide
        setAiExplanation(data.explanation);
        toast.success('Explanation generated! Click "Replace Default" to save.');
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate explanation';
      toast.error(message);
      console.error('Failed to generate explanation:', error);
    } finally {
      setIsGeneratingExplanation(false);
    }
  }, [currentQuestion, examId, questions]);

  const saveExplanation = useCallback(async () => {
    if (!currentQuestion || !examId || !aiExplanation) return;

    setIsSavingExplanation(true);

    try {
      // Build updated question with new explanation and AI flag
      const updatedQuestion: NormalizedQuestion = {
        ...currentQuestion,
        explanation: aiExplanation,
        explanationGeneratedByAI: true,
      };

      // Use PATCH endpoint to update the question
      const payload = denormalizeQuestion(updatedQuestion);
      const response = await fetch(`/api/exams/${examId}/questions/${currentQuestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to save explanation`);
      }

      // Update the current question with the explanation and AI flag
      const updatedQuestions = questions.map(q =>
        q.id === currentQuestion.id
          ? { ...q, explanation: aiExplanation, explanationGeneratedByAI: true }
          : q
      );
      setQuestions(updatedQuestions);

      // Clear AI explanation state since it's now the default
      setAiExplanation(null);

      toast.success('Explanation saved as default!');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save explanation';
      toast.error(message);
      console.error('Failed to save explanation:', error);
    } finally {
      setIsSavingExplanation(false);
    }
  }, [currentQuestion, examId, aiExplanation, questions]);

  const deleteExplanation = useCallback(async () => {
    if (!currentQuestion || !examId) return;

    // Confirm before deleting
    if (!confirm('Are you sure you want to delete this explanation? This action cannot be undone.')) {
      return;
    }

    setIsDeletingExplanation(true);

    try {
      const response = await fetch(`/api/exams/${examId}/questions/${currentQuestion.id}/explanation`, {
        method: 'DELETE',
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to delete explanation`);
      }

      // Update the questions state to remove the explanation
      const updatedQuestions = questions.map(q =>
        q.id === currentQuestion.id
          ? { ...q, explanation: undefined, explanationGeneratedByAI: undefined }
          : q
      );
      setQuestions(updatedQuestions);

      toast.success('Explanation deleted successfully!');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete explanation';
      toast.error(message);
      console.error('Failed to delete explanation:', error);
    } finally {
      setIsDeletingExplanation(false);
    }
  }, [currentQuestion, examId, questions]);

  // Auto-generate explanation when user selects an answer and question doesn't have one
  useEffect(() => {
    if (!currentQuestion || !quizState.showFeedback) return;

    // Check if question has no explanation
    const hasExplanation = currentQuestion.explanation && currentQuestion.explanation.trim().length > 0;
    if (hasExplanation) return;

    // Check if already generating or already have AI explanation
    if (isGeneratingExplanation || aiExplanation) return;

    // Auto-generate explanation
    console.log('[QuizApp] Auto-generating explanation for question without one:', currentQuestion.id);
    generateExplanation();
  }, [quizState.showFeedback, currentQuestion, isGeneratingExplanation, aiExplanation, generateExplanation]);

  const handleTimeUp = useCallback(() => {
    finishQuiz();
  }, [finishQuiz]);

  const handleTimeUpdate = useCallback(
    (remainingSeconds: number) => {
      const totalTime = testSettings.timerDuration * 60;
      const elapsed = totalTime - remainingSeconds;
      // Update ref only - this prevents re-renders every second
      timeElapsedRef.current = elapsed;
      // Only update state occasionally (this state is only used for display in results)
      // We'll update it when the quiz finishes
    },
    [testSettings.timerDuration]
  );

  const openQuestionEditor = () => {
    if (!currentQuestion) return;
    setEditingQuestion(currentQuestion);
    setEditDialogOpen(true);
  };

  const handleQuestionSave = async (updatedQuestion: NormalizedQuestion) => {
    if (!examId) {
      const message = 'Exam ID is required to save edits.';
      toast.error(message);
      throw new Error(message);
    }

    setIsSavingQuestion(true);

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
      toast.success('Question updated successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save question.';
      toast.error(message);
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
                persistEnabledRef.current = false;
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
    return (
      <QuizResults
        score={quizState.score}
        totalQuestions={totalQuestions}
        timeElapsed={timeElapsed}
        incorrectAnswers={quizState.incorrectAnswers}
        onResetQuiz={resetQuiz}
        onGoHome={() => {
          persistEnabledRef.current = false;
          clearExamState();
          onBackToSettings();
        }}
      />
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
      <QuizHeader
        examTitle={examTitle}
        testSettings={testSettings}
        onQuit={() => setShowQuitDialog(true)}
      />

      <QuizProgress
        testSettings={testSettings}
        currentQuestionIndex={quizState.currentQuestionIndex}
        totalQuestions={totalQuestions}
        timerRunning={quizState.timerRunning && !quizState.showResult}
        timeElapsed={timeElapsed}
        onTimeUp={handleTimeUp}
        onTimeUpdate={handleTimeUpdate}
      />

      {currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          selectedAnswers={selectedAnswerIndex}
          showFeedback={quizState.showFeedback}
          isCurrentAnswerCorrect={isCurrentAnswerCorrect}
          onSelectAnswer={selectAnswer}
          onSubmitMultipleAnswer={submitMultipleAnswer}
          showCompetencies={testSettings.showCompetencies}
          isSavingQuestion={isSavingQuestion}
          onOpenQuestionEditor={openQuestionEditor}
          onGenerateExplanation={generateExplanation}
          onSaveExplanation={saveExplanation}
          onDeleteExplanation={deleteExplanation}
          isGeneratingExplanation={isGeneratingExplanation}
          isSavingExplanation={isSavingExplanation}
          isDeletingExplanation={isDeletingExplanation}
          aiExplanation={aiExplanation}
        />
      )}

      {currentQuestion && (
        <QuizControls
          question={currentQuestion}
          showFeedback={quizState.showFeedback}
          isLastQuestion={isLastQuestion}
          onNextQuestion={nextQuestion}
        />
      )}

      <QuitDialog
        open={showQuitDialog}
        onOpenChange={setShowQuitDialog}
        onConfirmQuit={() => {
          persistEnabledRef.current = false;
          clearExamState();
          onBackToSettings();
        }}
      />

      <QuestionEditorDialog
        open={editDialogOpen}
        question={editingQuestion}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingQuestion(null);
          }
        }}
        onSave={handleQuestionSave}
        saving={isSavingQuestion}
      />
    </div>
  );
}
