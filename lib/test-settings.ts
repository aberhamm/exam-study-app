// Test settings configuration constants
export const TEST_SETTINGS = {
  DEFAULT_QUESTION_COUNT: 50,
  MAX_QUESTION_COUNT: 100,
  MIN_QUESTION_COUNT: 5,
  QUESTION_TYPE_OPTIONS: [
    { value: 'all', label: 'All Question Types' },
    { value: 'single', label: 'Single Select Only' },
    { value: 'multiple', label: 'Multiple Select Only' }
  ],
  QUESTION_COUNT_PRESETS: [10, 25, 50, 75, 100],
  SESSION_STORAGE_KEY: 'scxmcl-test-settings'
} as const;

export type QuestionTypeFilter = 'all' | 'single' | 'multiple';

export type TestSettings = {
  questionCount: number;
  questionType: QuestionTypeFilter;
};

export const DEFAULT_TEST_SETTINGS: TestSettings = {
  questionCount: TEST_SETTINGS.DEFAULT_QUESTION_COUNT,
  questionType: 'all'
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
    questionType: settings.questionType || 'all'
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