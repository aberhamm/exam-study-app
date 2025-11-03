'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuizApp } from '@/components/QuizApp';
import { usePreparedQuestions } from '@/app/usePreparedQuestions';
import { loadExamState, isExamStateValid, clearExamState, type ExamState } from '@/lib/exam-state';
import { loadTestSettings, type TestSettings } from '@/lib/test-settings';
import ExamSkeleton from '@/components/ExamSkeleton';

type Props = {
  examId: string;
  examTitle?: string;
};

export default function ExamClient({ examId, examTitle }: Props) {
  const router = useRouter();
  // Mount guard: keep server/client markup identical during hydration
  // by rendering the lightweight skeleton on the first client paint.
  // This avoids SSR vs client differences caused by localStorage/state
  // rehydration and other browser-only effects.
  const [mounted, setMounted] = useState(false);
  const [enabledFetch, setEnabledFetch] = useState<boolean>(false);
  const [initialExamState, setInitialExamState] = useState<ExamState | null>(() => {
    const existingExamState = loadExamState();
    if (
      existingExamState &&
      isExamStateValid(existingExamState) &&
      (!existingExamState.examId || existingExamState.examId === examId)
    ) {
      return existingExamState;
    }
    return null;
  });
  const [testSettings, setTestSettings] = useState<TestSettings>(() => {
    const existingExamState = loadExamState();
    if (
      existingExamState &&
      isExamStateValid(existingExamState) &&
      (!existingExamState.examId || existingExamState.examId === examId)
    ) {
      return existingExamState.testSettings;
    }
    return loadTestSettings();
  });
  const {
    data: preparedData,
    error: preparedError,
    loading: preparedLoading,
  } = usePreparedQuestions(examId, testSettings, { enabled: enabledFetch });

  // Ensure initial SSR/client render matches by showing skeleton until mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  // Enable data fetch only if no saved state exists.
  // We defer reading localStorage to the client and update initial state
  // accordingly to prevent hydration mismatches.
  useEffect(() => {
    const existingExamState = loadExamState();
    if (
      existingExamState &&
      isExamStateValid(existingExamState) &&
      (!existingExamState.examId || existingExamState.examId === examId)
    ) {
      setInitialExamState(existingExamState);
      setTestSettings(existingExamState.testSettings);
      setEnabledFetch(false);
    } else {
      setInitialExamState(null);
      setTestSettings(loadTestSettings());
      setEnabledFetch(true);
    }
  }, [examId]);

  const preparedQuestions = useMemo(() => {
    if (initialExamState) return initialExamState.questions;
    return preparedData ?? [];
  }, [initialExamState, preparedData]);

  // Clear exam session when user navigates back/forward from the exam route
  useEffect(() => {
    const handlePopState = () => {
      try {
        clearExamState();
      } catch {}
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleBackToSettings = () => {
    try {
      clearExamState();
      const targetExamId = initialExamState?.examId || examId;
      router.push(`/${encodeURIComponent(targetExamId)}`);
    } catch {}
  };

  // Show skeleton while loading questions for a fresh session
  if (!initialExamState && preparedLoading) {
    return <ExamSkeleton examTitle={examTitle} />;
  }
  if (preparedError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-red-600 dark:text-red-400">
          <h2 className="text-xl font-semibold mb-2">Error loading exam</h2>
          <p className="text-sm opacity-90">{String(preparedError)}</p>
        </div>
      </div>
    );
  }

  const effectiveExamId = initialExamState?.examId || examId;
  const effectiveExamTitle = initialExamState?.examTitle ?? examTitle;

  // If we still don't have questions prepared for a fresh session, or we
  // haven't mounted yet, keep showing the skeleton so server and client
  // render the same markup.
  if (!mounted || (!initialExamState && (!preparedQuestions || preparedQuestions.length === 0))) {
    return <ExamSkeleton examTitle={examTitle} />;
  }

  return (
    <QuizApp
      questions={preparedQuestions}
      testSettings={testSettings}
      onBackToSettings={handleBackToSettings}
      initialExamState={initialExamState}
      examId={effectiveExamId}
      examTitle={effectiveExamTitle}
    />
  );
}
