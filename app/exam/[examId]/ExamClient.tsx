"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuizApp } from "@/components/QuizApp";
import { useQuestions } from "@/app/useQuestions";
import { prepareQuestionsForTest } from "@/lib/question-utils";
import { loadExamState, isExamStateValid, type ExamState } from "@/lib/exam-state";
import { loadTestSettings, type TestSettings } from "@/lib/test-settings";
import ExamSkeleton from "@/components/ExamSkeleton";

type Props = {
  examId: string;
  examTitle?: string;
};

export default function ExamClient({ examId, examTitle }: Props) {
  const router = useRouter();
  const [enabledFetch, setEnabledFetch] = useState<boolean>(false);
  const { data: allQuestions, examMetadata: fetchedMetadata, error, loading } = useQuestions(examId, { enabled: enabledFetch });
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
  const [testSettings, setTestSettings] = useState<TestSettings | null>(() => {
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

  // Enable data fetch only if no saved state exists
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
    if (initialExamState) {
      return initialExamState.questions;
    }
    if (!allQuestions || !testSettings) return [];
    return prepareQuestionsForTest(allQuestions, testSettings);
  }, [allQuestions, initialExamState, testSettings]);

  const handleBackToSettings = () => {
    try {
      router.push("/");
    } catch {}
  };

  // Show skeleton while initializing settings or loading questions for a fresh session
  if (!initialExamState && (!testSettings || loading)) {
    return <ExamSkeleton examTitle={examTitle ?? fetchedMetadata?.examTitle} />;
  }
  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-red-600 dark:text-red-400">
          <h2 className="text-xl font-semibold mb-2">Error loading exam</h2>
          <p className="text-sm opacity-90">{String(error)}</p>
        </div>
      </div>
    );
  }

  const effectiveExamId = (fetchedMetadata?.examId ?? initialExamState?.examId) || examId;
  const effectiveExamTitle = initialExamState?.examTitle ?? fetchedMetadata?.examTitle ?? examTitle;

  // If we still don't have questions prepared for a fresh session, keep showing skeleton
  if (!initialExamState && (!preparedQuestions || preparedQuestions.length === 0)) {
    return <ExamSkeleton examTitle={examTitle ?? fetchedMetadata?.examTitle} />;
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
