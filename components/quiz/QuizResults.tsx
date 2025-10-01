'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StudyPanel } from '@/components/StudyPanel';
import { MarkdownContent } from '@/components/ui/markdown';
import type { NormalizedQuestion } from '@/types/normalized';

type IncorrectAnswer = {
  question: NormalizedQuestion;
  selectedIndex: number | number[];
  correctIndex: number | number[];
};

type Props = {
  score: number;
  totalQuestions: number;
  timeElapsed: number;
  incorrectAnswers: IncorrectAnswer[];
  onResetQuiz: () => void;
  onGoHome: () => void;
};

export function QuizResults({
  score,
  totalQuestions,
  timeElapsed,
  incorrectAnswers,
  onResetQuiz,
  onGoHome,
}: Props) {
  const percentage = Math.round((score / totalQuestions) * 100);
  const timeElapsedMinutes = Math.floor(timeElapsed / 60);
  const timeElapsedSeconds = timeElapsed % 60;
  const formattedElapsedTime = `${timeElapsedMinutes}:${timeElapsedSeconds
    .toString()
    .padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Quiz Complete!</h2>
          <div className="text-4xl font-bold text-primary">
            {score}/{totalQuestions} ({percentage}%)
          </div>
          <div className="text-lg text-muted-foreground">Time taken: {formattedElapsedTime}</div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={onResetQuiz} size="lg">
              Start New Quiz
            </Button>
            <Button
              onClick={onGoHome}
              variant="outline"
              size="lg"
            >
              Home
            </Button>
          </div>
        </div>
      </Card>

      {incorrectAnswers.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Review Incorrect Answers</h2>
          <div className="space-y-6">
            {incorrectAnswers.map(({ question, selectedIndex, correctIndex }) => (
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