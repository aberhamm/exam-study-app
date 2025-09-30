"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { QuizApp } from "@/components/QuizApp";
import { useQuestions } from "@/app/useQuestions";
import { prepareQuestionsForTest } from "@/lib/question-utils";
import { loadExamState, isExamStateValid, type ExamState } from "@/lib/exam-state";
import { loadTestSettings, type TestSettings } from "@/lib/test-settings";

export default function ExamPage() {
  const params = useParams<{ examId: string }>();
  const examId = typeof params?.examId === 'string' ? params.examId : 'sitecore-xmc';
  const router = useRouter();
  const { data: allQuestions, examMetadata, error, loading } = useQuestions(examId);
  const [initialExamState, setInitialExamState] = useState<ExamState | null>(null);
  const [testSettings, setTestSettings] = useState<TestSettings | null>(null);

  // Load any saved exam state scoped to this exam, else fall back to saved test settings
  useEffect(() => {
    const existingExamState = loadExamState();
    if (
      existingExamState &&
      isExamStateValid(existingExamState) &&
      (!existingExamState.examId || existingExamState.examId === examId)
    ) {
      setInitialExamState(existingExamState);
      setTestSettings(existingExamState.testSettings);
    } else {
      setInitialExamState(null);
      setTestSettings(loadTestSettings());
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

  if (loading || !testSettings) {
    return null;
  }
  if (error) {
    return null;
  }

  return (
    <QuizApp
      questions={preparedQuestions}
      testSettings={testSettings}
      onBackToSettings={handleBackToSettings}
      initialExamState={initialExamState}
      examId={examMetadata?.examId ?? examId}
      examTitle={examMetadata?.examTitle}
    />
  );
}

