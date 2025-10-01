'use client';

import { Button } from '@/components/ui/button';
import type { NormalizedQuestion } from '@/types/normalized';

type Props = {
  question: NormalizedQuestion;
  showFeedback: boolean;
  isLastQuestion: boolean;
  onNextQuestion: () => void;
};

export function QuizControls({
  question,
  showFeedback,
  isLastQuestion,
  onNextQuestion,
}: Props) {
  return (
    <>
      {showFeedback && (
        <div className="mt-6">
          <Button onClick={onNextQuestion} size="lg" className="w-full">
            {isLastQuestion ? 'Finish Quiz' : 'Next Question'}
          </Button>
        </div>
      )}

      {/* Keyboard Instructions */}
      <div className="text-center text-sm text-muted-foreground">
        {question.questionType === 'multiple'
          ? showFeedback
            ? 'Use Enter/Space to continue to next question'
            : 'Use keys 1-5 to toggle selections, Enter/Space to submit'
          : 'Use keys 1-5 to select answers, Enter/Space to continue'}
      </div>
    </>
  );
}