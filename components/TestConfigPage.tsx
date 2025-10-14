'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { Card, CardHeader, CardFooter, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { MarkdownContent } from '@/components/ui/markdown';
import { History, BookOpen } from 'lucide-react';
import {
  TEST_SETTINGS,
  TestSettings,
  QuestionTypeFilter,
  ExplanationFilter,
  DEFAULT_TEST_SETTINGS,
  validateTestSettings,
  loadTestSettings,
  saveTestSettings,
} from '@/lib/test-settings';
import type { NormalizedQuestion, ExamMetadata } from '@/types/normalized';
import { getMissedQuestionIds, getAllQuestionMetrics, clearIncorrect } from '@/lib/question-metrics';
import type { ExamStatsResponse } from '@/types/api';

type StartTestOptions = {
  overrideQuestions?: NormalizedQuestion[];
};

type Props = {
  questions: NormalizedQuestion[] | null;
  examMetadata?: ExamMetadata | null;
  onStartTest: (settings: TestSettings, options?: StartTestOptions) => Promise<void> | void;
  loading: boolean;
  error: string | null;
  stats?: ExamStatsResponse['stats'];
};

export function TestConfigPage({ questions, examMetadata, onStartTest, loading, error, stats }: Props) {
  const [settings, setSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);
  const { setConfig } = useHeader();
  const [customQuestionCount, setCustomQuestionCount] = useState<string>('');
  const [useCustomCount, setUseCustomCount] = useState(false);
  const [customTimerDuration, setCustomTimerDuration] = useState<string>('');
  const [useCustomTimer, setUseCustomTimer] = useState(false);
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [missedQuestionIds, setMissedQuestionIds] = useState<string[]>([]);
  const [missedThreshold, setMissedThreshold] = useState<number>(1);
  const [seenQuestionIds, setSeenQuestionIds] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [competencies, setCompetencies] = useState<Array<{ id: string; title: string; questionCount?: number }>>([]);

  // Configure header on mount and when exam title loads
  useEffect(() => {
    setConfig({
      variant: 'full',
      title: examMetadata?.examTitle || 'Study Utility',
      leftContent: null,
      rightContent: null,
      visible: true,
    });
  }, [setConfig, examMetadata]);

  // Load saved settings on mount
  useEffect(() => {
    const savedSettings = loadTestSettings();
    // Ensure the question count is at least the default if no valid saved settings
    if (savedSettings.questionCount < TEST_SETTINGS.DEFAULT_QUESTION_COUNT) {
      const correctedSettings = {
        ...savedSettings,
        questionCount: TEST_SETTINGS.DEFAULT_QUESTION_COUNT,
      };
      setSettings(correctedSettings);
      saveTestSettings(correctedSettings);
    } else {
      setSettings(savedSettings);
    }

    // Use the final settings for preset checking
    const finalSettings =
      savedSettings.questionCount < TEST_SETTINGS.DEFAULT_QUESTION_COUNT
        ? { ...savedSettings, questionCount: TEST_SETTINGS.DEFAULT_QUESTION_COUNT }
        : savedSettings;

    // Check if final count is a preset or custom
    const isPreset = (TEST_SETTINGS.QUESTION_COUNT_PRESETS as readonly number[]).includes(
      finalSettings.questionCount
    );
    if (!isPreset) {
      setUseCustomCount(true);
      setCustomQuestionCount(finalSettings.questionCount.toString());
    }

    // Check if saved timer is a preset or custom
    const isTimerPreset = (TEST_SETTINGS.TIMER_DURATION_PRESETS as readonly number[]).includes(
      finalSettings.timerDuration
    );
    if (!isTimerPreset) {
      setUseCustomTimer(true);
      setCustomTimerDuration(finalSettings.timerDuration.toString());
    }
  }, []);

  const { questionType, questionCount } = settings;

  // Load missed question IDs on mount and when returning to this page
  useEffect(() => {
    const ids = getMissedQuestionIds(missedThreshold);
    setMissedQuestionIds(ids);

    // Load seen question IDs
    const allMetrics = getAllQuestionMetrics();
    const seenIds = Object.entries(allMetrics)
      .filter(([, metrics]) => metrics.seen > 0)
      .map(([questionId]) => questionId);
    setSeenQuestionIds(seenIds);

    // Also refresh when the page becomes visible (user returns from exam)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const updatedIds = getMissedQuestionIds(missedThreshold);
        setMissedQuestionIds(updatedIds);

        const updatedMetrics = getAllQuestionMetrics();
        const updatedSeenIds = Object.entries(updatedMetrics)
          .filter(([, metrics]) => metrics.seen > 0)
          .map(([questionId]) => questionId);
        setSeenQuestionIds(updatedSeenIds);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [questions, missedThreshold]);

  // Fetch competencies for this exam
  useEffect(() => {
    if (!examMetadata?.examId) return;

    const fetchCompetencies = async () => {
      try {
        const response = await fetch(`/api/exams/${examMetadata.examId}/competencies?includeStats=true`);
        if (response.ok) {
          const data = await response.json();
          setCompetencies(data.competencies || []);
        }
      } catch (err) {
        console.error('Failed to fetch competencies:', err);
      }
    };

    fetchCompetencies();
  }, [examMetadata?.examId]);

  // Validate and adjust settings when questions load
  useEffect(() => {
    if (questions) {
      const counts = {
        all: questions.length,
        single: questions.filter((q) => q.questionType === 'single').length,
        multiple: questions.filter((q) => q.questionType === 'multiple').length,
      };

      const availableForType = counts[questionType];

      // If saved settings are invalid for available questions, adjust them
      if (questionCount > availableForType && availableForType > 0) {
        const adjustedCount = Math.min(availableForType, TEST_SETTINGS.DEFAULT_QUESTION_COUNT);
        setSettings((prev) => ({ ...prev, questionCount: adjustedCount }));

        // Update UI state if it was a custom count
        if (useCustomCount) {
          setCustomQuestionCount(adjustedCount.toString());
        }
      }
    }
  }, [questions, questionType, questionCount, useCustomCount]);

  // Calculate available questions by type and explanation filter
  const questionCounts = useMemo(() => {
    if (stats) {
      return {
        all: stats.total,
        single: stats.byType.single,
        multiple: stats.byType.multiple,
        'with-explanations': stats.byExplanation.with,
        'without-explanations': stats.byExplanation.without,
      } as const;
    }
    if (questions) {
      return {
        all: questions.length,
        single: questions.filter((q) => q.questionType === 'single').length,
        multiple: questions.filter((q) => q.questionType === 'multiple').length,
        'with-explanations': questions.filter((q) => q.explanation && q.explanation.trim().length > 0)
          .length,
        'without-explanations': questions.filter(
          (q) => !q.explanation || q.explanation.trim().length === 0
        ).length,
      } as const;
    }
    return {
      all: 0,
      single: 0,
      multiple: 0,
      'with-explanations': 0,
      'without-explanations': 0,
    } as const;
  }, [questions, stats]);

  // Get filtered questions based on current explanation filter
  const filteredQuestionCounts = useMemo(() => {
    if (stats) {
      if (settings.explanationFilter === 'all') {
        return {
          all: stats.total,
          single: stats.byType.single,
          multiple: stats.byType.multiple,
        } as const;
      }
      if (settings.explanationFilter === 'with-explanations') {
        return {
          all: stats.byExplanation.with,
          single: stats.matrix.single.with,
          multiple: stats.matrix.multiple.with,
        } as const;
      }
      return {
        all: stats.byExplanation.without,
        single: stats.matrix.single.without,
        multiple: stats.matrix.multiple.without,
      } as const;
    }
    // fallback to client-side questions if present
    const q = questions || [];
    const filtered = (() => {
      if (settings.explanationFilter === 'all') return q;
      if (settings.explanationFilter === 'with-explanations') return q.filter((x) => x.explanation && x.explanation.trim().length > 0);
      return q.filter((x) => !x.explanation || x.explanation.trim().length === 0);
    })();
    return {
      all: filtered.length,
      single: filtered.filter((x) => x.questionType === 'single').length,
      multiple: filtered.filter((x) => x.questionType === 'multiple').length,
    } as const;
  }, [stats, settings.explanationFilter, questions]);

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
    const newFilteredQuestions = questions
      ? (() => {
          if (explanationFilter === 'all') return questions;
          if (explanationFilter === 'with-explanations') {
            return questions.filter((q) => q.explanation && q.explanation.trim().length > 0);
          }
          return questions.filter((q) => !q.explanation || q.explanation.trim().length === 0);
        })()
      : [];

    const newFilteredQuestionCounts = {
      all: newFilteredQuestions.length,
      single: newFilteredQuestions.filter((q) => q.questionType === 'single').length,
      multiple: newFilteredQuestions.filter((q) => q.questionType === 'multiple').length,
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
    const validatedCount = Math.max(1, Math.min(maxAllowedQuestions, count));
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

  const handleStartTest = async () => {
    const finalSettings = validateTestSettings(settings);
    saveTestSettings(finalSettings);
    try {
      setStarting(true);
      await onStartTest(finalSettings);
    } finally {
      setStarting(false);
    }
  };

  const handleStartMissedQuestions = async () => {
    if (!examMetadata?.examId || missedQuestionIds.length === 0) return;

    try {
      setStarting(true);

      // Fetch the missed questions from the API
      const idsParam = encodeURIComponent(JSON.stringify(missedQuestionIds));
      const response = await fetch(`/api/exams/${examMetadata.examId}/questions?ids=${idsParam}`);

      if (!response.ok) {
        console.error('Failed to fetch missed questions');
        return;
      }

      const rawQuestions = await response.json();

      // Normalize the questions
      const { normalizeQuestions } = await import('@/lib/normalize');
      const missedQuestions = normalizeQuestions(rawQuestions);

      const practiceSettings: TestSettings = {
        ...settings,
        questionType: 'all',
        explanationFilter: 'all',
        questionCount: missedQuestions.length,
      };

      await onStartTest(practiceSettings, { overrideQuestions: missedQuestions });
    } catch (err) {
      console.error('Failed to start missed questions review:', err);
    } finally {
      setStarting(false);
    }
  };

  const getValidationState = () => {
    if (availableQuestions === 0) {
      return {
        valid: false,
        message: `No questions available for ${
          settings.questionType === 'all' ? 'any' : settings.questionType
        } question type`,
      };
    }

    // Check if new questions only filter is enabled but all questions have been seen
    if (settings.newQuestionsOnly && seenQuestionIds.length >= questionCounts.all) {
      return {
        valid: false,
        message: `You've seen all ${questionCounts.all} questions already. Try disabling "Show only new questions" to review questions.`,
      };
    }

    if (settings.questionCount > maxAllowedQuestions) {
      return {
        valid: false,
        message: `Only ${maxAllowedQuestions} questions available for this type`,
      };
    }

    if (settings.questionCount < 1) {
      return {
        valid: false,
        message: `At least 1 question is required`,
      };
    }

    // Allow configurations with fewer than the ideal minimum if that's all that's available
    if (
      availableQuestions < TEST_SETTINGS.MIN_QUESTION_COUNT &&
      settings.questionCount > availableQuestions
    ) {
      return {
        valid: false,
        message: `Only ${availableQuestions} questions available for this type`,
      };
    }

    return { valid: true, message: null };
  };

  const validationState = getValidationState();
  const isValidConfiguration = validationState.valid;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-lg">Loading exam info...</div>
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
    <div className="space-y-10">
      {/* Page Header - Exam Title */}
      {examMetadata?.examTitle && (
        <div className="text-center lg:text-left">
          <h1 className="text-4xl font-bold text-primary">{examMetadata.examTitle}</h1>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Welcome Section */}
        <section className="space-y-6">
          <div className="space-y-4 text-center lg:text-left">
            <div className="mx-auto w-full lg:mx-0 lg:max-w-3xl">
              {(examMetadata?.welcomeConfig?.showDefaultSubtitle ?? true) && (
                <h2 className="text-2xl font-semibold mb-2">
                  {examMetadata?.welcomeConfig?.title || 'Welcome to Your Study Session'}
                </h2>
              )}
              {examMetadata?.welcomeConfig?.description ? (
                <div className="text-lg text-muted-foreground space-y-4 text-left">
                  <MarkdownContent variant="welcome">
                    {examMetadata.welcomeConfig.description}
                  </MarkdownContent>
                </div>
              ) : (
                <p className="text-lg text-muted-foreground">
                  Get ready to test your knowledge and improve your understanding. Configure your
                  exam settings below and start when you&apos;re ready.
                </p>
              )}
            </div>
          </div>

          {/* Quick Start Button or Configuration Toggle */}
          <div className="space-y-2" aria-live="polite">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start">
              <Button
                onClick={handleStartTest}
                size="lg"
                className="px-8 py-3 text-lg"
                disabled={!isValidConfiguration || starting}
              >
                {starting
                  ? 'Loading questions…'
                  : (
                    examMetadata?.welcomeConfig?.ctaText ||
                    `Start Exam (${settings.questionCount} ${
                      settings.questionType === 'all' ? '' : settings.questionType
                    } ${
                      settings.explanationFilter === 'all'
                        ? ''
                        : settings.explanationFilter === 'with-explanations'
                        ? 'explained '
                        : 'non-explained '
                    }questions)`
                  )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowConfiguration((current) => !current)}
                size="lg"
                className="px-8 py-3 text-lg"
              >
                {showConfiguration ? 'Hide settings' : 'Adjust settings'}
              </Button>
            </div>
            {!isValidConfiguration && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {validationState.message || 'Please adjust your exam settings before starting.'}
              </p>
            )}
          </div>
        </section>

        {/* Quick Actions */}
        <aside className="space-y-4 lg:pl-8">
          <Card className="border-dashed bg-muted/30">
            <CardHeader className="pt-4 sm:pt-5 pb-2 sm:pb-3">
              <CardTitle className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <span>Practice missed questions</span>
              </CardTitle>
              <CardDescription>
                {missedQuestionIds.length > 0
                  ? `You have ${missedQuestionIds.length} question${
                      missedQuestionIds.length === 1 ? '' : 's'
                    } you missed before.`
                  : "No missed questions yet. We'll track any incorrect answers for review."}
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-2 sm:pt-3 pb-4 sm:pb-5">
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="missed-threshold" className="text-sm text-muted-foreground">
                    Min incorrect
                  </label>
                  <input
                    id="missed-threshold"
                    type="number"
                    min={1}
                    value={missedThreshold}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || '1', 10);
                      setMissedThreshold(Number.isNaN(v) ? 1 : Math.max(1, v));
                    }}
                    className="w-24 rounded-lg border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="Minimum incorrect attempts required to include in review"
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={handleStartMissedQuestions}
                    disabled={missedQuestionIds.length === 0 || starting}
                    className="flex-1"
                  >
                    {starting ? 'Loading questions…' : 'Review missed questions'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      if (confirm('Reset missed counters? This will clear incorrect counts but keep seen/correct.')) {
                        clearIncorrect();
                        const refreshed = getMissedQuestionIds(missedThreshold);
                        setMissedQuestionIds(refreshed);
                      }
                    }}
                  >
                    Reset missed
                  </Button>
                </div>
              </div>
            </CardFooter>
          </Card>

          <Card className="border-dashed bg-muted/30">
            <CardHeader className="pt-4 sm:pt-5 pb-2 sm:pb-3">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" />
                <span>View all questions</span>
              </CardTitle>
              <CardDescription>
                Browse and review all {questionCounts.all} questions in the exam bank.
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-2 sm:pt-3 pb-4 sm:pb-5">
              <Link
                href={`/admin/questions/${examMetadata?.examId || 'sitecore-xmc'}`}
                className="w-full inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                View all questions
              </Link>
            </CardFooter>
          </Card>
        </aside>
      </div>

      {/* Test Configuration - Collapsible */}
      {showConfiguration && (
        <Card className="p-6 sm:p-8 space-y-10">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold">Configure Your Test</h2>
            <p className="text-sm text-muted-foreground">
              Fine-tune the mix of questions and timing before you jump in.
            </p>
          </div>

          <div className="space-y-10">
            {/* Question Type Selection */}
            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Question Type</h3>
                <p className="text-sm text-muted-foreground">
                  Choose whether to see every question or focus on a specific format.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {TEST_SETTINGS.QUESTION_TYPE_OPTIONS.map((option) => {
                  const isActive = settings.questionType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleQuestionTypeChange(option.value as QuestionTypeFilter)}
                      className={`p-4 rounded-lg border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        isActive
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-border hover:border-muted-foreground/40'
                      }`}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {
                          filteredQuestionCounts[
                            option.value as keyof typeof filteredQuestionCounts
                          ]
                        }{' '}
                        questions available
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Explanation Filter Selection */}
            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Explanation Filter</h3>
                <p className="text-sm text-muted-foreground">
                  Control whether you want to study questions with explanations, without them, or
                  both.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {TEST_SETTINGS.EXPLANATION_FILTER_OPTIONS.map((option) => {
                  const isActive = settings.explanationFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() =>
                        handleExplanationFilterChange(option.value as ExplanationFilter)
                      }
                      className={`p-4 rounded-lg border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        isActive
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-border hover:border-muted-foreground/40'
                      }`}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {questionCounts[option.value as keyof typeof questionCounts]} questions
                        available
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Competency Filter Selection */}
            {competencies.length > 0 && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Competency Filter</h3>
                  <p className="text-sm text-muted-foreground">
                    Filter questions by competency area, or see all competencies.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={!settings.competencyFilter || settings.competencyFilter === 'all'}
                      onClick={() => setSettings({ ...settings, competencyFilter: 'all' })}
                      className={`p-4 rounded-lg border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        !settings.competencyFilter || settings.competencyFilter === 'all'
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-border hover:border-muted-foreground/40'
                      }`}
                    >
                      <div className="font-medium">All Competencies</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        No filtering
                      </div>
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2 border border-border rounded-lg p-3">
                    {competencies.map((competency) => {
                      const isActive = settings.competencyFilter === competency.id;
                      return (
                        <button
                          key={competency.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setSettings({ ...settings, competencyFilter: competency.id })}
                          className={`w-full p-3 rounded-md border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                            isActive
                              ? 'border-primary bg-primary/5 dark:bg-primary/10'
                              : 'border-transparent hover:border-border hover:bg-muted/50'
                          }`}
                        >
                          <div className="font-medium text-sm">{competency.title}</div>
                          {competency.questionCount !== undefined && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {competency.questionCount} question{competency.questionCount !== 1 ? 's' : ''}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Show Competencies Checkbox */}
            <section className="space-y-4">
              <div className="flex items-start gap-3">
                <input
                  id="show-competencies"
                  type="checkbox"
                  checked={settings.showCompetencies ?? false}
                  onChange={(e) => setSettings({ ...settings, showCompetencies: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-border focus:ring-2 focus:ring-primary focus:ring-offset-2"
                />
                <label htmlFor="show-competencies" className="flex-1 cursor-pointer">
                  <div className="font-medium">Show competencies on questions</div>
                  <p className="text-sm text-muted-foreground">
                    Display competency tags on each question during the exam
                  </p>
                </label>
              </div>
            </section>

            {/* New Questions Only Filter */}
            <section className="space-y-4">
              <div className="flex items-start gap-3">
                <input
                  id="new-questions-only"
                  type="checkbox"
                  checked={settings.newQuestionsOnly ?? false}
                  onChange={(e) => setSettings({ ...settings, newQuestionsOnly: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-border focus:ring-2 focus:ring-primary focus:ring-offset-2"
                />
                <label htmlFor="new-questions-only" className="flex-1 cursor-pointer">
                  <div className="font-medium">Show only new questions</div>
                  <p className="text-sm text-muted-foreground">
                    Only include questions you haven&apos;t seen before in this exam.
                    {seenQuestionIds.length > 0 && (
                      <> You&apos;ve seen {seenQuestionIds.length} question{seenQuestionIds.length === 1 ? '' : 's'} so far.</>
                    )}
                  </p>
                </label>
              </div>
            </section>

            {/* Question Count Selection */}
            <section className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Number of Questions</h3>
                <p className="text-sm text-muted-foreground">
                  Use a preset or enter your own count (up to {maxAllowedQuestions}).
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-sm font-medium">Quick select</div>
                  <div className="flex flex-wrap gap-2">
                    {TEST_SETTINGS.QUESTION_COUNT_PRESETS.filter(
                      (preset) => preset <= maxAllowedQuestions
                    ).map((preset) => {
                      const isActive = !useCustomCount && settings.questionCount === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => handlePresetSelect(preset)}
                          className={`px-4 py-2 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                            isActive
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:border-muted-foreground/40'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <label className="text-sm font-medium" htmlFor="custom-question-count">
                    Custom amount
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="custom-question-count"
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
                      className="w-28 rounded-lg border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <span className="text-sm text-muted-foreground">
                      Using {settings.questionCount} questions
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Timer Duration Selection */}
            <section className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Timer Duration</h3>
                <p className="text-sm text-muted-foreground">
                  Select a preset or enter a custom time between {TEST_SETTINGS.MIN_TIMER_DURATION}{' '}
                  and {TEST_SETTINGS.MAX_TIMER_DURATION} minutes.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-sm font-medium">Quick select</div>
                  <div className="flex flex-wrap gap-2">
                    {TEST_SETTINGS.TIMER_DURATION_PRESETS.map((preset) => {
                      const isActive = !useCustomTimer && settings.timerDuration === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => handleTimerPresetSelect(preset)}
                          className={`px-4 py-2 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                            isActive
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:border-muted-foreground/40'
                          }`}
                        >
                          {preset} min
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <label className="text-sm font-medium" htmlFor="custom-timer-duration">
                    Custom duration
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="custom-timer-duration"
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
                      className="w-28 rounded-lg border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <span className="text-sm text-muted-foreground">
                      Using {settings.timerDuration} minutes (
                      {Math.floor(settings.timerDuration / 60)}h {settings.timerDuration % 60}m)
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Configuration Summary */}
            <section className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium">Current summary</h4>
                <div className="mt-2 space-y-1 text-sm">
                  <div>
                    Question type:{' '}
                    <span className="font-medium">
                      {
                        TEST_SETTINGS.QUESTION_TYPE_OPTIONS.find(
                          (opt) => opt.value === settings.questionType
                        )?.label
                      }
                    </span>
                  </div>
                  <div>
                    Explanation filter:{' '}
                    <span className="font-medium">
                      {
                        TEST_SETTINGS.EXPLANATION_FILTER_OPTIONS.find(
                          (opt) => opt.value === settings.explanationFilter
                        )?.label
                      }
                    </span>
                  </div>
                  <div>
                    Question count: <span className="font-medium">{settings.questionCount}</span>
                  </div>
                  <div>
                    Timer duration:{' '}
                    <span className="font-medium">{settings.timerDuration} minutes</span>
                  </div>
                  <div>
                    Available questions: <span className="font-medium">{availableQuestions}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                {!isValidConfiguration && validationState.message && (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    {validationState.message}
                  </span>
                )}
                <Button
                  onClick={handleStartTest}
                  disabled={!isValidConfiguration || starting}
                  size="lg"
                  className="px-8"
                >
                  {starting
                    ? 'Loading questions…'
                    : isValidConfiguration
                      ? 'Start with these settings'
                      : 'Check configuration'}
                </Button>
              </div>
            </section>
          </div>
        </Card>
      )}
    </div>
  );
}
