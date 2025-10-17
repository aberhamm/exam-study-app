'use client';

import { Button } from '@/components/ui/button';
import type { TestSettings } from '@/lib/test-settings';

type Props = {
  examTitle?: string;
  testSettings: TestSettings;
  onQuit: () => void;
};

export function QuizHeader({ examTitle, testSettings, onQuit }: Props) {
  return (
    <>
      {/* Page Header - Exam Title */}
      {examTitle && (
        <div className="text-center lg:text-left">
          <h1 className="text-2xl font-bold">{examTitle}</h1>
        </div>
      )}

      {/* Header Actions (all breakpoints) */}
      <div className="flex justify-between items-center text-sm">
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
          <Button variant="outline" size="sm" onClick={onQuit}>
            Quit and go Home
          </Button>
        </div>
      </div>
    </>
  );
}
