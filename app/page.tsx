"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QuizApp } from "@/components/QuizApp";
import { TestConfigPage } from "@/components/TestConfigPage";
import { useQuestions } from "@/app/useQuestions";
import {
  TestSettings,
  DEFAULT_TEST_SETTINGS,
  loadTestSettings,
  saveTestSettings
} from "@/lib/test-settings";
import { prepareQuestionsForTest, shuffleArray } from "@/lib/question-utils";
import { loadExamState, isExamStateValid, saveExamState, createExamState, type ExamState } from "@/lib/exam-state";
import type { NormalizedQuestion } from "@/types/normalized";

type AppView = 'config' | 'quiz';

export default function Home() {
  const router = useRouter();
  const { data: allQuestions, examMetadata, error, loading } = useQuestions();
  const [currentView, setCurrentView] = useState<AppView>('config');
  const [testSettings, setTestSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);
  const [resumeExamState, setResumeExamState] = useState<ExamState | null>(null);
  const [overrideQuestions, setOverrideQuestions] = useState<NormalizedQuestion[] | null>(null);

  // Load saved settings and check for existing exam state on mount
  useEffect(() => {
    const savedSettings = loadTestSettings();
    setTestSettings(savedSettings);

    // Check for existing exam state
    const existingExamState = loadExamState();
    if (existingExamState && isExamStateValid(existingExamState)) {
      setResumeExamState(existingExamState);
      setTestSettings(existingExamState.testSettings);
      setCurrentView('quiz');
    }
  }, [router]);

  // If resuming, navigate to the correct exam route, but don't override Back/Forward navigations
  useEffect(() => {
    if (!resumeExamState || currentView !== 'quiz') return;
    const navEntries = (typeof performance !== 'undefined'
      ? (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])
      : []);
    const navType = navEntries[0]?.type;
    const isBackForward = navType === 'back_forward';
    if (isBackForward) return;

    const targetExamId = resumeExamState.examId || (examMetadata?.examId ?? 'sitecore-xmc');
    try {
      router.push(`/exam/${encodeURIComponent(targetExamId)}`);
    } catch {}
  }, [resumeExamState, currentView, router, examMetadata]);

  const handleStartTest = (settings: TestSettings, options?: { overrideQuestions?: NormalizedQuestion[] }) => {
    setTestSettings(settings);
    if (!options?.overrideQuestions) {
      saveTestSettings(settings);
    }
    setResumeExamState(null); // Clear any existing exam state for new exam
    if (options?.overrideQuestions && options.overrideQuestions.length > 0) {
      setOverrideQuestions(shuffleArray(options.overrideQuestions));
    } else {
      setOverrideQuestions(null);
    }
    // Pre-create and save the exam state so the /exam route can resume it
    const prepared = options?.overrideQuestions && options.overrideQuestions.length > 0
      ? shuffleArray(options.overrideQuestions)
      : (allQuestions ? prepareQuestionsForTest(allQuestions, settings) : []);
    try {
      const targetExamId = examMetadata?.examId ?? 'sitecore-xmc';
      const state = createExamState(prepared, settings, targetExamId);
      saveExamState(state);
    } catch {}

    setCurrentView('quiz');
    // Navigate to the dedicated exam route
    try {
      const targetExamId = examMetadata?.examId ?? 'sitecore-xmc';
      router.push(`/exam/${encodeURIComponent(targetExamId)}`);
    } catch {}
  };

  const handleBackToSettings = () => {
    setOverrideQuestions(null);
    setCurrentView('config');
    // Return URL to the home state
    try {
      router.push('/');
    } catch {}
  };

  if (currentView === 'config') {
    return (
      <TestConfigPage
        questions={allQuestions}
        examMetadata={examMetadata}
        onStartTest={handleStartTest}
        loading={loading}
        error={error}
      />
    );
  }

  // Prepare questions for the quiz based on settings
  const preparedQuestions = overrideQuestions
    ? overrideQuestions
    : allQuestions
      ? prepareQuestionsForTest(allQuestions, testSettings)
      : [];

  // Note: Quiz now runs on the /exam route. Keep fallback here for safety.
  return (
    <QuizApp
      questions={preparedQuestions}
      testSettings={testSettings}
      onBackToSettings={handleBackToSettings}
      initialExamState={resumeExamState}
      examId={examMetadata?.examId ?? 'sitecore-xmc'}
      examTitle={examMetadata?.examTitle}
    />
  );
}
