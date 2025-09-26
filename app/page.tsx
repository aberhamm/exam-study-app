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

type AppView = 'config' | 'quiz';

export default function Home() {
  const { data: allQuestions, error, loading } = useQuestions();
  const [currentView, setCurrentView] = useState<AppView>('config');
  const [testSettings, setTestSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);

  // Load saved settings on mount
  useEffect(() => {
    const savedSettings = loadTestSettings();
    setTestSettings(savedSettings);
  }, []);

  const handleStartTest = (settings: TestSettings) => {
    setTestSettings(settings);
    saveTestSettings(settings);
    setCurrentView('quiz');
  };

  const handleBackToSettings = () => {
    setCurrentView('config');
  };

  if (currentView === 'config') {
    return (
      <TestConfigPage
        questions={allQuestions}
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
    />
  );
}
