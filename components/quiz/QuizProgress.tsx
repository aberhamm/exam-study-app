'use client';

import { Timer } from '@/components/Timer';
import type { TestSettings } from '@/lib/test-settings';

type Props = {
  testSettings: TestSettings;
  currentQuestionIndex: number;
  totalQuestions: number;
  timerRunning: boolean;
  timeElapsed: number;
  onTimeUp: () => void;
  onTimeUpdate: (remainingSeconds: number) => void;
};

export function QuizProgress({
  testSettings,
  currentQuestionIndex,
  totalQuestions,
  timerRunning,
  timeElapsed,
  onTimeUp,
  onTimeUpdate,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-6">
      {/* Timer (1/4 width) */}
      <div className="flex-shrink-0 w-1/4">
        <Timer
          initialMinutes={testSettings.timerDuration}
          isRunning={timerRunning}
          onTimeUp={onTimeUp}
          onTimeUpdate={onTimeUpdate}
          timeElapsed={timeElapsed}
        />
      </div>

      {/* Progress Indicator (3/4 width) */}
      <div className="flex-grow text-center">
        <div className="text-lg font-medium">
          Question {currentQuestionIndex + 1} of {totalQuestions}
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{
              width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}