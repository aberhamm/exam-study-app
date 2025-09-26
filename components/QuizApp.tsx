"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuestions } from "@/app/useQuestions";
import { StudyPanel } from "@/components/StudyPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { NormalizedQuestion } from "@/types/normalized";

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
};

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function QuizApp() {
  const { data: originalQuestions, error, loading } = useQuestions();
  const [questions, setQuestions] = useState<NormalizedQuestion[] | null>(null);
  const [quizState, setQuizState] = useState<QuizState>({
    currentQuestionIndex: 0,
    selectedAnswers: [],
    showResult: false,
    showFeedback: false,
    score: 0,
    incorrectAnswers: [],
  });

  // Randomize questions when original questions load
  useEffect(() => {
    if (originalQuestions) {
      setQuestions(shuffleArray(originalQuestions));
    }
  }, [originalQuestions]);

  const currentQuestion = questions?.[quizState.currentQuestionIndex];
  const totalQuestions = questions?.length || 0;
  const isLastQuestion = quizState.currentQuestionIndex === totalQuestions - 1;

  // Note: Disabled localStorage persistence since questions are randomized
  // Loading a saved state wouldn't match the current question order

  const finishQuiz = useCallback(() => {
    if (!questions) return;

    let score = 0;
    const incorrectAnswers: QuizState["incorrectAnswers"] = [];

    questions.forEach((question, index) => {
      const selectedIndex = quizState.selectedAnswers[index];
      const correctIndex = question.answerIndex;

      let isCorrect = false;

      if (question.questionType === 'single') {
        isCorrect = selectedIndex === correctIndex;
      } else {
        // For multiple select, check if arrays match exactly
        const selectedArray = Array.isArray(selectedIndex) ? selectedIndex : [];
        const correctArray = Array.isArray(correctIndex) ? correctIndex : [];

        isCorrect = selectedArray.length === correctArray.length &&
                   selectedArray.every(val => correctArray.includes(val as 0 | 1 | 2 | 3));
      }

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

  const selectAnswer = useCallback((answerIndex: number) => {
    if (!questions || quizState.showFeedback) return;

    const currentQuestion = questions[quizState.currentQuestionIndex];
    const newSelectedAnswers = [...quizState.selectedAnswers];

    if (currentQuestion.questionType === 'single') {
      newSelectedAnswers[quizState.currentQuestionIndex] = answerIndex;

      const newState = {
        ...quizState,
        selectedAnswers: newSelectedAnswers,
        showFeedback: true,
      };
      setQuizState(newState);
    } else {
      // For multiple select, toggle the selection
      const currentSelections = newSelectedAnswers[quizState.currentQuestionIndex] as number[] || [];
      const isSelected = currentSelections.includes(answerIndex);

      if (isSelected) {
        newSelectedAnswers[quizState.currentQuestionIndex] = currentSelections.filter(i => i !== answerIndex);
      } else {
        newSelectedAnswers[quizState.currentQuestionIndex] = [...currentSelections, answerIndex].sort();
      }

      const newState = {
        ...quizState,
        selectedAnswers: newSelectedAnswers,
        // Don't show feedback immediately for multiple select - wait for user to submit
      };
      setQuizState(newState);
    }
  }, [questions, quizState]);

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
    if (originalQuestions) {
      setQuestions(shuffleArray(originalQuestions));
    }
    
    const resetState = {
      currentQuestionIndex: 0,
      selectedAnswers: [],
      showResult: false,
      showFeedback: false,
      score: 0,
      incorrectAnswers: [],
    };
    
    setQuizState(resetState);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!currentQuestion || quizState.showResult) return;

    if (e.key >= "1" && e.key <= "4") {
      const answerIndex = parseInt(e.key) - 1;
      if (answerIndex < currentQuestion.choices.length) {
        selectAnswer(answerIndex);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      if (quizState.showFeedback) {
        e.preventDefault();
        nextQuestion();
      } else if (currentQuestion.questionType === 'multiple') {
        // For multiple select, Enter/Space submits the current selections
        e.preventDefault();
        submitMultipleAnswer();
      }
    }
  }, [currentQuestion, quizState.showFeedback, quizState.showResult, selectAnswer, nextQuestion, submitMultipleAnswer]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">SCXMCL Study Utility</h1>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-center py-20">
            <div className="text-lg">Loading questions...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">SCXMCL Study Utility</h1>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-center py-20">
            <Card className="p-6">
              <div className="text-red-600 dark:text-red-400 text-center">
                <h2 className="text-xl font-semibold mb-2">Error Loading Questions</h2>
                <p>{error}</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">SCXMCL Study Utility</h1>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-center py-20">
            <Card className="p-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">No Questions Available</h2>
                <p>No questions found to display.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (quizState.showResult) {
    const percentage = Math.round((quizState.score / totalQuestions) * 100);
    
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          {/* Header with Theme Toggle */}
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">SCXMCL Study Utility</h1>
            <ThemeToggle />
          </div>

          <Card className="p-6">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold">Quiz Complete!</h2>
              <div className="text-4xl font-bold text-primary">
                {quizState.score}/{totalQuestions} ({percentage}%)
              </div>
              <Button onClick={resetQuiz} size="lg">
                Start New Quiz
              </Button>
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

                        if (question.questionType === 'single') {
                          isCorrect = choiceIndex === correctIndex;
                          isSelected = choiceIndex === selectedIndex;
                        } else {
                          const correctArray = Array.isArray(correctIndex) ? correctIndex : [];
                          const selectedArray = Array.isArray(selectedIndex) ? selectedIndex : [];
                          isCorrect = correctArray.includes(choiceIndex);
                          isSelected = selectedArray.includes(choiceIndex);
                        }

                        return (
                          <div
                            key={choiceIndex}
                            className={`p-3 rounded-lg border-2 ${
                              isCorrect
                                ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200"
                                : isSelected && !isCorrect
                                ? "border-red-500 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"
                                : "border-gray-200 dark:border-gray-700"
                            }`}
                          >
                            <span className="font-medium">
                              {String.fromCharCode(65 + choiceIndex)}.
                            </span>{" "}
                            {choice}
                            {isCorrect && (
                              <span className="ml-2 text-green-600 dark:text-green-400 font-semibold">✓ Correct</span>
                            )}
                            {isSelected && !isCorrect && (
                              <span className="ml-2 text-red-600 dark:text-red-400 font-semibold">✗ Your answer</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {question.explanation && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">Explanation:</div>
                        <div className="text-blue-700 dark:text-blue-300">{question.explanation}</div>
                      </div>
                    )}

                    {question.study && <StudyPanel study={question.study} />}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const selectedAnswerIndex = quizState.selectedAnswers[quizState.currentQuestionIndex];

  let isCorrect = false;
  if (currentQuestion) {
    if (currentQuestion.questionType === 'single') {
      isCorrect = selectedAnswerIndex === currentQuestion.answerIndex;
    } else {
      const selectedArray = Array.isArray(selectedAnswerIndex) ? selectedAnswerIndex : [];
      const correctArray = Array.isArray(currentQuestion.answerIndex) ? currentQuestion.answerIndex : [];
      isCorrect = selectedArray.length === correctArray.length &&
                 selectedArray.every(val => correctArray.includes(val as 0 | 1 | 2 | 3));
    }
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-6 space-y-6">
        {/* Header with Theme Toggle */}
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">SCXMCL Study Utility</h1>
          <ThemeToggle />
        </div>

        {/* Progress Indicator */}
        <div className="text-center">
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

      {/* Question */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-semibold" role="heading" aria-level={2}>
            {currentQuestion?.prompt}
          </h2>
          <div className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
            {currentQuestion?.questionType === 'multiple' ? 'Select all that apply' : 'Select one'}
          </div>
        </div>

        <div
          className="space-y-3"
          role={currentQuestion?.questionType === 'multiple' ? "group" : "radiogroup"}
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
                const correctArray = Array.isArray(currentQuestion.answerIndex) ? currentQuestion.answerIndex : [];
                showCorrect = correctArray.includes(index as 0 | 1 | 2 | 3);
              }
            }

            const showIncorrect = quizState.showFeedback && isSelected && !showCorrect;

            return (
              <button
                key={index}
                onClick={() => selectAnswer(index)}
                disabled={quizState.showFeedback}
                className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                  showCorrect
                    ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200"
                    : showIncorrect
                    ? "border-red-500 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"
                    : isSelected
                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                } ${quizState.showFeedback ? "cursor-default" : "cursor-pointer"}`}
                role={currentQuestion.questionType === 'multiple' ? "checkbox" : "radio"}
                aria-checked={isSelected}
                aria-describedby={quizState.showFeedback ? `answer-${index}-feedback` : undefined}
                tabIndex={0}
              >
                <span className="font-medium">
                  {String.fromCharCode(65 + index)}.
                </span>{" "}
                {choice}
                {showCorrect && (
                  <span id={`answer-${index}-feedback`} className="ml-2 text-green-600 dark:text-green-400 font-semibold">
                    ✓ Correct
                  </span>
                )}
                {showIncorrect && (
                  <span id={`answer-${index}-feedback`} className="ml-2 text-red-600 dark:text-red-400 font-semibold">
                    ✗ Incorrect
                  </span>
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
              disabled={!selectedAnswerIndex || (Array.isArray(selectedAnswerIndex) && selectedAnswerIndex.length === 0)}
            >
              Submit Answer
            </Button>
          </div>
        )}

        {quizState.showFeedback && (
          <div className="mt-6 space-y-4">
            <div
              className={`p-4 rounded-lg ${
                isCorrect 
                  ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800" 
                  : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
              }`}
            >
              <div className={`font-semibold ${
                isCorrect 
                  ? "text-green-800 dark:text-green-200" 
                  : "text-red-800 dark:text-red-200"
              }`}>
                {isCorrect ? "Correct!" : "Incorrect"}
              </div>
            </div>

            {currentQuestion?.explanation && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="font-medium text-blue-800 dark:text-blue-200 mb-2">Explanation:</div>
                <div className="text-blue-700 dark:text-blue-300">{currentQuestion.explanation}</div>
              </div>
            )}

            {currentQuestion?.study && <StudyPanel study={currentQuestion.study} />}

            <Button onClick={nextQuestion} size="lg" className="w-full">
              {isLastQuestion ? "Finish Quiz" : "Next Question"}
            </Button>
          </div>
        )}
      </Card>

        {/* Keyboard Instructions */}
        <div className="text-center text-sm text-muted-foreground">
          {currentQuestion?.questionType === 'multiple'
            ? quizState.showFeedback
              ? "Use Enter/Space to continue to next question"
              : "Use keys 1-4 to toggle selections, Enter/Space to submit"
            : "Use keys 1-4 to select answers, Enter/Space to continue"
          }
        </div>
      </div>
    </div>
  );
}