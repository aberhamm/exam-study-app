"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuizApp } from "@/components/QuizApp";
import { useQuestions } from "@/app/useQuestions";
import { prepareQuestionsForTest } from "@/lib/question-utils";
import { loadExamState, isExamStateValid, type ExamState } from "@/lib/exam-state";
import { loadTestSettings, type TestSettings } from "@/lib/test-settings";

type Props = {
  examId: string;
  examTitle?: string;
};

export default function ExamClient({ examId, examTitle }: Props) {
  const router = useRouter();
  const [enabledFetch, setEnabledFetch] = useState<boolean>(false);
  const { data: allQuestions, examMetadata: fetchedMetadata, error } = useQuestions(examId, { enabled: enabledFetch });
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

  if (!testSettings && !initialExamState) {
    return null;
  }
  if (error) {
    return null;
  }

  const effectiveExamId = (fetchedMetadata?.examId ?? initialExamState?.examId) || examId;
  const effectiveExamTitle = initialExamState?.examTitle ?? fetchedMetadata?.examTitle ?? examTitle;

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

