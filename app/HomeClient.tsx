"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QuizApp } from "@/components/QuizApp";
import { TestConfigPage } from "@/components/TestConfigPage";
import {
  TestSettings,
  DEFAULT_TEST_SETTINGS,
  loadTestSettings,
  saveTestSettings
} from "@/lib/test-settings";
import { shuffleArray } from "@/lib/question-utils";
import { loadExamState, isExamStateValid, saveExamState, createExamState, type ExamState } from "@/lib/exam-state";
import type { NormalizedQuestion, ExamMetadata } from "@/types/normalized";
import type { ExamStatsResponse } from "@/types/api";

type AppView = 'config' | 'quiz';

type Props = {
  examMetadata: ExamMetadata | null;
  stats: ExamStatsResponse['stats'] | null;
};

export default function HomeClient({ examMetadata, stats }: Props) {
  const router = useRouter();
  const [currentView, setCurrentView] = useState<AppView>('config');
  const [testSettings, setTestSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);
  const [resumeExamState, setResumeExamState] = useState<ExamState | null>(null);
  const [overrideQuestions, setOverrideQuestions] = useState<NormalizedQuestion[] | null>(null);
  const [redirectingToExam, setRedirectingToExam] = useState(false);

  // Load saved settings and check for existing exam state on mount
  useEffect(() => {
    const savedSettings = loadTestSettings();
    setTestSettings(savedSettings);

    const existingExamState = loadExamState();

    // Detect back/forward navigation to avoid auto-resume when the user intends to go Home
    const navEntries = (typeof performance !== 'undefined'
      ? (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])
      : []);
    const navType = navEntries[0]?.type;
    const isBackForward = navType === 'back_forward';

    if (
      existingExamState &&
      isExamStateValid(existingExamState) &&
      !existingExamState.showResult &&
      !isBackForward
    ) {
      setRedirectingToExam(true);
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

  const handleStartTest = async (settings: TestSettings, options?: { overrideQuestions?: NormalizedQuestion[] }) => {
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
    // Load questions on-demand at start and persist state for the /exam route
    try {
      let prepared: NormalizedQuestion[] = [];
      if (options?.overrideQuestions && options.overrideQuestions.length > 0) {
        prepared = shuffleArray(options.overrideQuestions);
      } else {
        const targetExamId = examMetadata?.examId ?? 'sitecore-xmc';
        const body = JSON.stringify({
          questionType: settings.questionType,
          explanationFilter: settings.explanationFilter,
          questionCount: settings.questionCount,
        });
        const res = await fetch(`/api/exams/${encodeURIComponent(targetExamId)}/questions/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          cache: 'no-store',
        });
        if (!res.ok) {
          const details: unknown = await res.json().catch(() => ({}));
          let message = `HTTP ${res.status}: ${res.statusText}`;
          if (details && typeof details === 'object' && 'error' in details) {
            const errVal = (details as { error?: unknown }).error;
            if (typeof errVal === 'string') {
              message = errVal;
            }
          }
          throw new Error(message);
        }
        const json = (await res.json()) as { questions: NormalizedQuestion[] };
        prepared = shuffleArray(json.questions);
      }
      const targetExamId = examMetadata?.examId ?? 'sitecore-xmc';
      const state = createExamState(prepared, settings, targetExamId, examMetadata?.examTitle);
      saveExamState(state);
    } catch {}

    setCurrentView('quiz');
    setRedirectingToExam(true);
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
        questions={null}
        examMetadata={examMetadata}
        onStartTest={handleStartTest}
        loading={false}
        error={null}
        stats={stats || undefined}
      />
    );
  }

  // Prepare questions for the quiz based on settings
  const preparedQuestions = overrideQuestions
    ? overrideQuestions
    : [];

  // Avoid rendering the heavy QuizApp on the home route when redirecting to /exam to prevent flashes.
  if (currentView === 'quiz' && redirectingToExam) {
    return null;
  }

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
