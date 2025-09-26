"use client";

import { useState, useEffect } from "react";
import { QuizApp } from "@/components/QuizApp";
import { TestConfigPage } from "@/components/TestConfigPage";
import { useQuestions } from "@/app/useQuestions";
import {
  TestSettings,
  DEFAULT_TEST_SETTINGS,
  loadTestSettings,
  saveTestSettings
} from "@/lib/test-settings";
import { prepareQuestionsForTest } from "@/lib/question-utils";
import { loadExamState, isExamStateValid, type ExamState } from "@/lib/exam-state";

type AppView = 'config' | 'quiz';

export default function Home() {
  const { data: allQuestions, examMetadata, error, loading } = useQuestions();
  const [currentView, setCurrentView] = useState<AppView>('config');
  const [testSettings, setTestSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);
  const [resumeExamState, setResumeExamState] = useState<ExamState | null>(null);

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
  }, []);

  const handleStartTest = (settings: TestSettings) => {
    setTestSettings(settings);
    saveTestSettings(settings);
    setResumeExamState(null); // Clear any existing exam state for new exam
    setCurrentView('quiz');
  };

  const handleBackToSettings = () => {
    setCurrentView('config');
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
  const preparedQuestions = allQuestions
    ? prepareQuestionsForTest(allQuestions, testSettings)
    : [];

  return (
    <QuizApp
      questions={preparedQuestions}
      testSettings={testSettings}
      onBackToSettings={handleBackToSettings}
      initialExamState={resumeExamState}
    />
  );
}
