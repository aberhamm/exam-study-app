'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StudyPanel } from '@/components/StudyPanel';
import { useHeader } from '@/contexts/HeaderContext';
import { Timer } from '@/components/Timer';
import type { NormalizedQuestion } from '@/types/normalized';
import type { TestSettings } from '@/lib/test-settings';
import { shuffleArray } from '@/lib/question-utils';

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
};

export function QuizApp({ questions: preparedQuestions, testSettings, onBackToSettings }: Props) {
  const [questions, setQuestions] = useState<NormalizedQuestion[]>(preparedQuestions);
  const { setConfig } = useHeader();
  const [quizState, setQuizState] = useState<QuizState>({
    currentQuestionIndex: 0,
    selectedAnswers: [],
    showResult: false,
    showFeedback: false,
    score: 0,
    incorrectAnswers: [],
    timerRunning: true,
    timeElapsed: 0,
  });

  // Ensure questions are set when component mounts or props change
  useEffect(() => {
    setQuestions(preparedQuestions);
  }, [preparedQuestions]);

  // Configure header based on quiz state
  useEffect(() => {
    if (quizState.showResult) {
      // Results page - simple header
      setConfig({
        variant: 'short',
        leftContent: null,
        rightContent: null,
        visible: true,
      });
    } else if (!questions || questions.length === 0) {
      // No questions - simple header
      setConfig({
        variant: 'short',
        leftContent: null,
        rightContent: null,
        visible: true,
      });
    } else {
      // Main quiz - complex header with settings and back button
      setConfig({
        variant: 'short',
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
          <Button
            variant="outline"
            size="sm"
            onClick={onBackToSettings}
            className="hidden md:flex"
          >
            ← Settings
          </Button>
        ),
        visible: true,
      });
    }
  }, [quizState.showResult, questions, testSettings, onBackToSettings, setConfig]);

  const currentQuestion = questions?.[quizState.currentQuestionIndex];
  const totalQuestions = questions?.length || 0;
  const isLastQuestion = quizState.currentQuestionIndex === totalQuestions - 1;

  // Note: Disabled localStorage persistence since questions are randomized
  // Loading a saved state wouldn't match the current question order

  const finishQuiz = useCallback(() => {
    if (!questions) return;

    let score = 0;
    const incorrectAnswers: QuizState['incorrectAnswers'] = [];

    questions.forEach((question, index) => {
      const selectedIndex = quizState.selectedAnswers[index];
      const correctIndex = question.answerIndex;

      let isCorrect = false;

      isCorrect = selectedIndex === correctIndex;

      if (isCorrect) {
        score++;
      } else if (selectedIndex !== null) {
        incorrectAnswers.push({
          question,
          selectedIndex,
          correctIndex,
        });
      }
    });

    const finalState = {
      ...quizState,
      showResult: true,
      score,
      incorrectAnswers,
    };

    setQuizState(finalState);
  }, [questions, quizState]);

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
    // Randomize questions again on reset
    setQuestions(shuffleArray(preparedQuestions));

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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!currentQuestion || quizState.showResult) return;

      if (e.key >= '1' && e.key <= '4') {
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
            <Button onClick={onBackToSettings} className="mt-4">
              Back to Settings
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
              <div className="text-lg text-muted-foreground">
                Time taken: {formattedElapsedTime}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={resetQuiz} size="lg">
                  Start New Quiz
                </Button>
                <Button onClick={onBackToSettings} variant="outline" size="lg">
                  Change Settings
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
                        <div className="text-blue-700 dark:text-blue-300">
                          {question.explanation}
                        </div>
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
      const correctArray = Array.isArray(currentQuestion.answerIndex) ? currentQuestion.answerIndex : [];

      const allSelectedAreCorrect = selectedArray.every(idx => correctArray.includes(idx as 0 | 1 | 2 | 3));
      const allCorrectAreSelected = correctArray.every(idx => selectedArray.includes(idx));

      isCurrentAnswerCorrect = allSelectedAreCorrect && allCorrectAreSelected && selectedArray.length > 0;
    }
  }

  return (
    <div className="space-y-6">
      {/* Mobile Settings Display */}
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
          <Button variant="outline" size="sm" onClick={onBackToSettings}>
            Settings
          </Button>
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
        <Card className="p-6">
          <div className="mb-4">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 className="text-xl font-semibold flex-1" role="heading" aria-level={2}>
                {currentQuestion?.prompt}
              </h2>
              {quizState.showFeedback && (
                <div className="flex-shrink-0 mt-1">
                  {isCurrentAnswerCorrect ? (
                    <div className="flex items-center text-green-600 dark:text-green-400">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="sr-only">Correct answer</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-red-600 dark:text-red-400">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="sr-only">Incorrect answer</span>
                    </div>
                  )}
                </div>
              )}
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
                  const isCorrectAnswer = correctArray.includes(index as 0 | 1 | 2 | 3);
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
                  {showMissedCorrect && (
                    <span className="sr-only">Correct answer, not selected</span>
                  )}
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
                  <div className="text-blue-700 dark:text-blue-300">
                    {currentQuestion.explanation}
                  </div>
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
              : 'Use keys 1-4 to toggle selections, Enter/Space to submit'
            : 'Use keys 1-4 to select answers, Enter/Space to continue'}
        </div>
    </div>
  );
}
