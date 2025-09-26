// Test settings configuration constants
export const TEST_SETTINGS = {
  DEFAULT_QUESTION_COUNT: 50,
  MAX_QUESTION_COUNT: 100,
  MIN_QUESTION_COUNT: 5,
  DEFAULT_TIMER_DURATION: 90, // minutes
  TIMER_DURATION_PRESETS: [30, 60, 90, 120, 180], // minutes
  MAX_TIMER_DURATION: 300, // 5 hours
  MIN_TIMER_DURATION: 5, // 5 minutes
  QUESTION_TYPE_OPTIONS: [
    { value: 'all', label: 'All Question Types' },
    { value: 'single', label: 'Single Select Only' },
    { value: 'multiple', label: 'Multiple Select Only' }
  ],
  QUESTION_COUNT_PRESETS: [10, 25, 50, 75, 100],
  EXPLANATION_FILTER_OPTIONS: [
    { value: 'all', label: 'All Questions' },
    { value: 'with-explanations', label: 'Questions with Explanations' },
    { value: 'without-explanations', label: 'Questions without Explanations' }
  ],
  SESSION_STORAGE_KEY: 'scxmcl-test-settings'
} as const;

export type QuestionTypeFilter = 'all' | 'single' | 'multiple';
export type ExplanationFilter = 'all' | 'with-explanations' | 'without-explanations';

export type TestSettings = {
  questionCount: number;
  questionType: QuestionTypeFilter;
  timerDuration: number; // in minutes
  explanationFilter: ExplanationFilter;
};

export const DEFAULT_TEST_SETTINGS: TestSettings = {
  questionCount: TEST_SETTINGS.DEFAULT_QUESTION_COUNT,
  questionType: 'all',
  timerDuration: TEST_SETTINGS.DEFAULT_TIMER_DURATION,
  explanationFilter: 'all'
};

// Utility functions for test settings
export function validateTestSettings(settings: Partial<TestSettings>): TestSettings {
  return {
    questionCount: Math.max(
      TEST_SETTINGS.MIN_QUESTION_COUNT,
      Math.min(
        TEST_SETTINGS.MAX_QUESTION_COUNT,
        settings.questionCount || TEST_SETTINGS.DEFAULT_QUESTION_COUNT
      )
    ),
    questionType: settings.questionType || 'all',
    timerDuration: Math.max(
      TEST_SETTINGS.MIN_TIMER_DURATION,
      Math.min(
        TEST_SETTINGS.MAX_TIMER_DURATION,
        settings.timerDuration || TEST_SETTINGS.DEFAULT_TIMER_DURATION
      )
    ),
    explanationFilter: settings.explanationFilter || 'all'
  };
}

export function saveTestSettings(settings: TestSettings): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TEST_SETTINGS.SESSION_STORAGE_KEY, JSON.stringify(settings));
  }
}

export function loadTestSettings(): TestSettings {
  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem(TEST_SETTINGS.SESSION_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return validateTestSettings(parsed);
      } catch {
        // Fall back to defaults if parsing fails
      }
    }
  }
  return DEFAULT_TEST_SETTINGS;
}

export function clearTestSettings(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TEST_SETTINGS.SESSION_STORAGE_KEY);
  }
}

export function resetToDefaults(): TestSettings {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TEST_SETTINGS.SESSION_STORAGE_KEY);
  }
  return DEFAULT_TEST_SETTINGS;
}