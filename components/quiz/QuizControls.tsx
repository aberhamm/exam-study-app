'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { NormalizedQuestion } from '@/types/normalized';

type Props = {
  question: NormalizedQuestion;
  showFeedback: boolean;
  isLastQuestion: boolean;
  isFirstQuestion: boolean;
  onNextQuestion: () => void;
  onPreviousQuestion: () => void;
};

export function QuizControls({
  question,
  showFeedback,
  isLastQuestion,
  isFirstQuestion,
  onNextQuestion,
  onPreviousQuestion,
}: Props) {
  return (
    <>
      {showFeedback && (
        <div className="mt-6 flex gap-3">
          <Button
            onClick={onPreviousQuestion}
            disabled={isFirstQuestion}
            size="lg"
            variant="outline"
            className="flex-1"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            Previous
          </Button>
          <Button onClick={onNextQuestion} size="lg" className="flex-1">
            {isLastQuestion ? 'Finish Quiz' : 'Next Question'}
            {!isLastQuestion && <ChevronRight className="h-5 w-5 ml-2" />}
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
