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
import { loadExamState, isExamStateValid, saveExamState, createExamState, clearExamState, type ExamState } from "@/lib/exam-state";
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
    } else {
      // Ensure we land on the home config when no active exam exists
      setRedirectingToExam(false);
      setResumeExamState(null);
      setCurrentView('config');
    }
  }, [router]);

  // Handle bfcache restores: ensure we don't auto-redirect if no active exam exists
  useEffect(() => {
    const handlePageShow = () => {
      const active = loadExamState();
      // When restored from bfcache, event.persisted can be true; regardless, reset if no active exam
      if (!active || !isExamStateValid(active) || active.showResult) {
        setRedirectingToExam(false);
        setResumeExamState(null);
        setCurrentView('config');
      }
    };
    window.addEventListener('pageshow', handlePageShow as EventListener);
    return () => window.removeEventListener('pageshow', handlePageShow as EventListener);
  }, []);

  // If resuming, navigate to the correct exam route, but don't override Back/Forward navigations
  useEffect(() => {
    if (!resumeExamState || currentView !== 'quiz') return;
    const navEntries = (typeof performance !== 'undefined'
      ? (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])
      : []);
    const navType = navEntries[0]?.type;
    const isBackForward = navType === 'back_forward';
    if (isBackForward) return;

    // Double-check there is still an active exam persisted; if not, avoid redirect
    const active = loadExamState();
    if (!active || !isExamStateValid(active) || active.showResult) {
      setRedirectingToExam(false);
      setResumeExamState(null);
      setCurrentView('config');
      return;
    }

    const targetExamId = resumeExamState.examId || (examMetadata?.examId ?? 'sitecore-xmc');
    try {
      router.push(`/${encodeURIComponent(targetExamId)}/exam`);
    } catch {}
  }, [resumeExamState, currentView, router, examMetadata]);

  const handleStartTest = async (settings: TestSettings, options?: { overrideQuestions?: NormalizedQuestion[] }) => {
    setTestSettings(settings);
    if (!options?.overrideQuestions) {
      // Persist chosen settings so the exam page can pick them up immediately
      saveTestSettings(settings);
    }
    // Clear any existing exam state for a fresh start to ensure new settings apply
    try { clearExamState(); } catch {}
    setResumeExamState(null);

    // If starting a targeted session (e.g., missed questions), pre-seed local state
    if (options?.overrideQuestions && options.overrideQuestions.length > 0) {
      const prepared = shuffleArray(options.overrideQuestions);
      const targetExamId = examMetadata?.examId ?? 'sitecore-xmc';
      const state = createExamState(prepared, settings, targetExamId, examMetadata?.examTitle);
      saveExamState(state);
      setOverrideQuestions(prepared);
    } else {
      setOverrideQuestions(null);
      // Do not fetch questions here; navigate immediately and let the exam route load data
    }

    // Update view state and navigate right away
    setCurrentView('quiz');
    setRedirectingToExam(true);
    try {
      const targetExamId = examMetadata?.examId ?? 'sitecore-xmc';
      router.push(`/${encodeURIComponent(targetExamId)}/exam`);
    } catch {}
  };

  const handleBackToSettings = () => {
    setOverrideQuestions(null);
    setCurrentView('config');
    // Return URL to the home state
    try {
      const targetExamId = examMetadata?.examId ?? 'sitecore-xmc';
      router.push(`/${encodeURIComponent(targetExamId)}`);
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

  // Avoid rendering the heavy QuizApp on the home route when redirecting to /{examId}/exam to prevent flashes.
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
