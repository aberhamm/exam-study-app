"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHeader } from "@/contexts/HeaderContext";
import { MarkdownContent } from '@/components/ui/markdown';
import {
  TEST_SETTINGS,
  TestSettings,
  QuestionTypeFilter,
  ExplanationFilter,
  DEFAULT_TEST_SETTINGS,
  validateTestSettings,
  loadTestSettings,
  saveTestSettings
} from "@/lib/test-settings";
import type { NormalizedQuestion, ExamMetadata } from "@/types/normalized";

type Props = {
  questions: NormalizedQuestion[] | null;
  examMetadata?: ExamMetadata | null;
  onStartTest: (settings: TestSettings) => void;
  loading: boolean;
  error: string | null;
};

export function TestConfigPage({ questions, examMetadata, onStartTest, loading, error }: Props) {
  const [settings, setSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);
  const { setConfig } = useHeader();
  const [customQuestionCount, setCustomQuestionCount] = useState<string>('');
  const [useCustomCount, setUseCustomCount] = useState(false);
  const [customTimerDuration, setCustomTimerDuration] = useState<string>('');
  const [useCustomTimer, setUseCustomTimer] = useState(false);
  const [showConfiguration, setShowConfiguration] = useState(false);

  // Configure header on mount
  useEffect(() => {
    setConfig({
      variant: 'full',
      leftContent: null,
      rightContent: null,
      visible: true,
    });
  }, [setConfig]);

  // Load saved settings on mount
  useEffect(() => {
    const savedSettings = loadTestSettings();
    // Ensure the question count is at least the default if no valid saved settings
    if (savedSettings.questionCount < TEST_SETTINGS.DEFAULT_QUESTION_COUNT) {
      const correctedSettings = { ...savedSettings, questionCount: TEST_SETTINGS.DEFAULT_QUESTION_COUNT };
      setSettings(correctedSettings);
      saveTestSettings(correctedSettings);
    } else {
      setSettings(savedSettings);
    }

    // Use the final settings for preset checking
    const finalSettings = savedSettings.questionCount < TEST_SETTINGS.DEFAULT_QUESTION_COUNT ?
      { ...savedSettings, questionCount: TEST_SETTINGS.DEFAULT_QUESTION_COUNT } : savedSettings;

    // Check if final count is a preset or custom
    const isPreset = (TEST_SETTINGS.QUESTION_COUNT_PRESETS as readonly number[]).includes(finalSettings.questionCount);
    if (!isPreset) {
      setUseCustomCount(true);
      setCustomQuestionCount(finalSettings.questionCount.toString());
    }

    // Check if saved timer is a preset or custom
    const isTimerPreset = (TEST_SETTINGS.TIMER_DURATION_PRESETS as readonly number[]).includes(finalSettings.timerDuration);
    if (!isTimerPreset) {
      setUseCustomTimer(true);
      setCustomTimerDuration(finalSettings.timerDuration.toString());
    }
  }, []);

  // Validate and adjust settings when questions load
  useEffect(() => {
    if (questions && settings) {
      const counts = {
        all: questions.length,
        single: questions.filter(q => q.questionType === 'single').length,
        multiple: questions.filter(q => q.questionType === 'multiple').length
      };

      const availableForType = counts[settings.questionType];

      // If saved settings are invalid for available questions, adjust them
      if (settings.questionCount > availableForType && availableForType > 0) {
        const adjustedCount = Math.min(availableForType, TEST_SETTINGS.DEFAULT_QUESTION_COUNT);
        setSettings(prev => ({ ...prev, questionCount: adjustedCount }));

        // Update UI state if it was a custom count
        if (useCustomCount) {
          setCustomQuestionCount(adjustedCount.toString());
        }
      }
    }
  }, [questions, settings?.questionType, useCustomCount]);

  // Calculate available questions by type and explanation filter
  const questionCounts = questions ? {
    all: questions.length,
    single: questions.filter(q => q.questionType === 'single').length,
    multiple: questions.filter(q => q.questionType === 'multiple').length,
    'with-explanations': questions.filter(q => q.explanation && q.explanation.trim().length > 0).length,
    'without-explanations': questions.filter(q => !q.explanation || q.explanation.trim().length === 0).length
  } : { all: 0, single: 0, multiple: 0, 'with-explanations': 0, 'without-explanations': 0 };

  // Get filtered questions based on current explanation filter
  const getFilteredQuestions = () => {
    if (!questions) return [];
    if (settings.explanationFilter === 'all') return questions;
    if (settings.explanationFilter === 'with-explanations') {
      return questions.filter(q => q.explanation && q.explanation.trim().length > 0);
    }
    return questions.filter(q => !q.explanation || q.explanation.trim().length === 0);
  };

  const filteredQuestions = getFilteredQuestions();
  const filteredQuestionCounts = {
    all: filteredQuestions.length,
    single: filteredQuestions.filter(q => q.questionType === 'single').length,
    multiple: filteredQuestions.filter(q => q.questionType === 'multiple').length
  };

  const availableQuestions = filteredQuestionCounts[settings.questionType];
  const maxAllowedQuestions = Math.min(availableQuestions, TEST_SETTINGS.MAX_QUESTION_COUNT);

  const handleQuestionTypeChange = (questionType: QuestionTypeFilter) => {
    const availableForType = filteredQuestionCounts[questionType];
    let newQuestionCount = settings.questionCount;

    // If no questions available for this type, set to minimum (will be invalid)
    if (availableForType === 0) {
      newQuestionCount = TEST_SETTINGS.MIN_QUESTION_COUNT;
      setUseCustomCount(false);
      setCustomQuestionCount('');
    }
    // If available questions are less than current selection, adjust down
    else if (newQuestionCount > availableForType) {
      newQuestionCount = availableForType;
      setUseCustomCount(false);
      setCustomQuestionCount('');
    }
    // If we have questions but less than minimum required, adjust to what's available
    else if (availableForType > 0 && availableForType < TEST_SETTINGS.MIN_QUESTION_COUNT) {
      newQuestionCount = Math.min(newQuestionCount, availableForType);
    }

    setSettings({ ...settings, questionType, questionCount: newQuestionCount });
  };

  const handleExplanationFilterChange = (explanationFilter: ExplanationFilter) => {
    // Recalculate available questions for the new explanation filter
    const newFilteredQuestions = questions ? (() => {
      if (explanationFilter === 'all') return questions;
      if (explanationFilter === 'with-explanations') {
        return questions.filter(q => q.explanation && q.explanation.trim().length > 0);
      }
      return questions.filter(q => !q.explanation || q.explanation.trim().length === 0);
    })() : [];

    const newFilteredQuestionCounts = {
      all: newFilteredQuestions.length,
      single: newFilteredQuestions.filter(q => q.questionType === 'single').length,
      multiple: newFilteredQuestions.filter(q => q.questionType === 'multiple').length
    };

    const availableForCurrentType = newFilteredQuestionCounts[settings.questionType];
    let newQuestionCount = settings.questionCount;

    // Adjust question count if necessary
    if (availableForCurrentType === 0) {
      newQuestionCount = TEST_SETTINGS.MIN_QUESTION_COUNT;
      setUseCustomCount(false);
      setCustomQuestionCount('');
    } else if (newQuestionCount > availableForCurrentType) {
      newQuestionCount = availableForCurrentType;
      setUseCustomCount(false);
      setCustomQuestionCount('');
    }

    setSettings({ ...settings, explanationFilter, questionCount: newQuestionCount });
  };

  const handleQuestionCountChange = (count: number) => {
    // Allow any count from 1 to the maximum available, but clamp to available range
    const validatedCount = Math.max(
      1,
      Math.min(maxAllowedQuestions, count)
    );
    setSettings({ ...settings, questionCount: validatedCount });
  };

  const handlePresetSelect = (count: number) => {
    setUseCustomCount(false);
    setCustomQuestionCount('');
    handleQuestionCountChange(count);
  };

  const handleCustomCountChange = (value: string) => {
    setCustomQuestionCount(value);
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      handleQuestionCountChange(numValue);
    }
  };

  const handleTimerDurationChange = (duration: number) => {
    const validatedDuration = Math.max(
      TEST_SETTINGS.MIN_TIMER_DURATION,
      Math.min(TEST_SETTINGS.MAX_TIMER_DURATION, duration)
    );
    setSettings({ ...settings, timerDuration: validatedDuration });
  };

  const handleTimerPresetSelect = (duration: number) => {
    setUseCustomTimer(false);
    setCustomTimerDuration('');
    handleTimerDurationChange(duration);
  };

  const handleCustomTimerChange = (value: string) => {
    setCustomTimerDuration(value);
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      handleTimerDurationChange(numValue);
    }
  };

  const handleStartTest = () => {
    const finalSettings = validateTestSettings(settings);
    saveTestSettings(finalSettings);
    onStartTest(finalSettings);
  };

  const getValidationState = () => {
    if (availableQuestions === 0) {
      return {
        valid: false,
        message: `No questions available for ${settings.questionType === 'all' ? 'any' : settings.questionType} question type`
      };
    }

    if (settings.questionCount > maxAllowedQuestions) {
      return {
        valid: false,
        message: `Only ${maxAllowedQuestions} questions available for this type`
      };
    }

    if (settings.questionCount < 1) {
      return {
        valid: false,
        message: `At least 1 question is required`
      };
    }

    // Allow configurations with fewer than the ideal minimum if that's all that's available
    if (availableQuestions < TEST_SETTINGS.MIN_QUESTION_COUNT && settings.questionCount > availableQuestions) {
      return {
        valid: false,
        message: `Only ${availableQuestions} questions available for this type`
      };
    }

    return { valid: true, message: null };
  };

  const validationState = getValidationState();
  const isValidConfiguration = validationState.valid;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-lg">Loading questions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="p-6">
          <div className="text-red-600 dark:text-red-400 text-center">
            <h2 className="text-xl font-semibold mb-2">Error Loading Questions</h2>
            <p>{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="text-center space-y-4">
        {examMetadata?.examTitle && (
          <h1 className="text-4xl font-bold text-primary mb-4">{examMetadata.examTitle}</h1>
        )}
        <div className="max-w-2xl mx-auto">
          {(examMetadata?.welcomeConfig?.showDefaultSubtitle ?? true) && (
            <h2 className="text-2xl font-semibold mb-3">
              {examMetadata?.welcomeConfig?.title || "Welcome to Your Study Session"}
            </h2>
          )}
          {examMetadata?.welcomeConfig?.description ? (
            <div className="text-lg text-muted-foreground mb-6 text-left space-y-4">
              <MarkdownContent variant="welcome">
                {examMetadata.welcomeConfig.description}
              </MarkdownContent>
            </div>
          ) : (
            <p className="text-lg text-muted-foreground mb-6">
              Get ready to test your knowledge and improve your understanding.
              Configure your exam settings below and start when you&apos;re ready.
            </p>
          )}
        </div>

        {/* Quick Start Button or Configuration Toggle */}
        {isValidConfiguration ? (
          <div className="space-y-3">
            <Button onClick={handleStartTest} size="lg" className="px-8 py-3 text-lg">
              {examMetadata?.welcomeConfig?.ctaText || `Start Exam (${settings.questionCount} ${settings.questionType === 'all' ? '' : settings.questionType} ${settings.explanationFilter === 'all' ? '' : settings.explanationFilter === 'with-explanations' ? 'explained ' : 'non-explained '}questions)`}
            </Button>
            <div>
              <Button
                variant="ghost"
                onClick={() => setShowConfiguration(!showConfiguration)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {showConfiguration ? '▲ Hide' : '▼ Show'} Configuration
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-amber-600 dark:text-amber-400 font-medium">
              Please configure your exam settings below
            </p>
            <Button
              variant="outline"
              onClick={() => setShowConfiguration(true)}
              className="px-6"
            >
              Configure Exam
            </Button>
          </div>
        )}
      </div>

      {/* Test Configuration - Collapsible */}
      {showConfiguration && (
        <Card className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Configure Your Test</h2>
            <p className="text-muted-foreground">
              Customize your quiz experience by selecting question types and count
            </p>
          </div>

          <div className="space-y-8">
            {/* Question Type Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Question Type</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TEST_SETTINGS.QUESTION_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleQuestionTypeChange(option.value as QuestionTypeFilter)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      settings.questionType === option.value
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {filteredQuestionCounts[option.value as keyof typeof filteredQuestionCounts]} questions available
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Explanation Filter Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Explanation Filter</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TEST_SETTINGS.EXPLANATION_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleExplanationFilterChange(option.value as ExplanationFilter)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      settings.explanationFilter === option.value
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {questionCounts[option.value as keyof typeof questionCounts]} questions available
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Question Count Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Number of Questions
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (Max {maxAllowedQuestions} available)
                </span>
              </h3>

              {/* Preset Options */}
              <div className="mb-4">
                <div className="text-sm font-medium mb-2">Quick Select:</div>
                <div className="flex flex-wrap gap-2">
                  {TEST_SETTINGS.QUESTION_COUNT_PRESETS
                    .filter(preset => preset <= maxAllowedQuestions)
                    .map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handlePresetSelect(preset)}
                      className={`px-4 py-2 rounded-lg border transition-all ${
                        !useCustomCount && settings.questionCount === preset
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div>
                <div className="text-sm font-medium mb-2">Custom Amount:</div>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={1}
                    max={maxAllowedQuestions}
                    value={useCustomCount ? customQuestionCount : ''}
                    onChange={(e) => {
                      setUseCustomCount(true);
                      handleCustomCountChange(e.target.value);
                    }}
                    onFocus={() => setUseCustomCount(true)}
                    placeholder={`1 - ${maxAllowedQuestions}`}
                    className="w-32 px-3 py-2 border rounded-lg bg-background"
                  />
                  <span className="text-sm text-muted-foreground">
                    Current: {settings.questionCount} questions
                  </span>
                </div>
              </div>
            </div>

            {/* Timer Duration Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Timer Duration
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (5 - 300 minutes)
                </span>
              </h3>

              {/* Timer Preset Options */}
              <div className="mb-4">
                <div className="text-sm font-medium mb-2">Quick Select:</div>
                <div className="flex flex-wrap gap-2">
                  {TEST_SETTINGS.TIMER_DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handleTimerPresetSelect(preset)}
                      className={`px-4 py-2 rounded-lg border transition-all ${
                        !useCustomTimer && settings.timerDuration === preset
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      {preset} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Timer Input */}
              <div>
                <div className="text-sm font-medium mb-2">Custom Duration:</div>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={TEST_SETTINGS.MIN_TIMER_DURATION}
                    max={TEST_SETTINGS.MAX_TIMER_DURATION}
                    value={useCustomTimer ? customTimerDuration : ''}
                    onChange={(e) => {
                      setUseCustomTimer(true);
                      handleCustomTimerChange(e.target.value);
                    }}
                    onFocus={() => setUseCustomTimer(true)}
                    placeholder={`${TEST_SETTINGS.MIN_TIMER_DURATION} - ${TEST_SETTINGS.MAX_TIMER_DURATION}`}
                    className="w-32 px-3 py-2 border rounded-lg bg-background"
                  />
                  <span className="text-sm text-muted-foreground">
                    Current: {settings.timerDuration} minutes ({Math.floor(settings.timerDuration / 60)}h {settings.timerDuration % 60}m)
                  </span>
                </div>
              </div>
            </div>

            {/* Configuration Summary */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Test Summary</h4>
              <div className="text-sm space-y-1">
                <div>Question Type: <span className="font-medium">
                  {TEST_SETTINGS.QUESTION_TYPE_OPTIONS.find(opt => opt.value === settings.questionType)?.label}
                </span></div>
                <div>Explanation Filter: <span className="font-medium">
                  {TEST_SETTINGS.EXPLANATION_FILTER_OPTIONS.find(opt => opt.value === settings.explanationFilter)?.label}
                </span></div>
                <div>Question Count: <span className="font-medium">{settings.questionCount}</span></div>
                <div>Timer Duration: <span className="font-medium">{settings.timerDuration} minutes</span></div>
                <div>Available Questions: <span className="font-medium">{availableQuestions}</span></div>
              </div>
            </div>

            {/* Start Test Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={handleStartTest}
                disabled={!isValidConfiguration}
                size="lg"
                className="px-8"
              >
                {isValidConfiguration ? 'Start Test' : 'Invalid Configuration'}
              </Button>
            </div>

            {!isValidConfiguration && validationState.message && (
              <div className="text-center text-sm text-red-600 dark:text-red-400">
                {validationState.message}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}