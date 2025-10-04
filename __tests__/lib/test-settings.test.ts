import {
  validateTestSettings,
  saveTestSettings,
  loadTestSettings,
  clearTestSettings,
  resetToDefaults,
  DEFAULT_TEST_SETTINGS,
  TEST_SETTINGS,
} from '@/lib/test-settings';
import type { TestSettings } from '@/lib/test-settings';

describe('test-settings', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  describe('validateTestSettings', () => {
    it('validates complete valid settings', () => {
      const input: Partial<TestSettings> = {
        questionCount: 50,
        questionType: 'all',
        timerDuration: 90,
        explanationFilter: 'all',
        showCompetencies: true,
        competencyFilter: 'comp-1',
      };

      const validated = validateTestSettings(input);

      expect(validated).toEqual(input);
    });

    it('clamps question count to minimum', () => {
      const input: Partial<TestSettings> = { questionCount: 1 };

      const validated = validateTestSettings(input);

      expect(validated.questionCount).toBe(TEST_SETTINGS.MIN_QUESTION_COUNT);
    });

    it('clamps question count to maximum', () => {
      const input: Partial<TestSettings> = { questionCount: 500 };

      const validated = validateTestSettings(input);

      expect(validated.questionCount).toBe(TEST_SETTINGS.MAX_QUESTION_COUNT);
    });

    it('uses default question count when missing', () => {
      const input: Partial<TestSettings> = {};

      const validated = validateTestSettings(input);

      expect(validated.questionCount).toBe(TEST_SETTINGS.DEFAULT_QUESTION_COUNT);
    });

    it('clamps timer duration to minimum', () => {
      const input: Partial<TestSettings> = { timerDuration: 1 };

      const validated = validateTestSettings(input);

      expect(validated.timerDuration).toBe(TEST_SETTINGS.MIN_TIMER_DURATION);
    });

    it('clamps timer duration to maximum', () => {
      const input: Partial<TestSettings> = { timerDuration: 1000 };

      const validated = validateTestSettings(input);

      expect(validated.timerDuration).toBe(TEST_SETTINGS.MAX_TIMER_DURATION);
    });

    it('uses default timer duration when missing', () => {
      const input: Partial<TestSettings> = {};

      const validated = validateTestSettings(input);

      expect(validated.timerDuration).toBe(TEST_SETTINGS.DEFAULT_TIMER_DURATION);
    });

    it('accepts all valid question types', () => {
      expect(validateTestSettings({ questionType: 'all' }).questionType).toBe('all');
      expect(validateTestSettings({ questionType: 'single' }).questionType).toBe('single');
      expect(validateTestSettings({ questionType: 'multiple' }).questionType).toBe('multiple');
    });

    it('defaults to "all" question type when missing', () => {
      const validated = validateTestSettings({});
      expect(validated.questionType).toBe('all');
    });

    it('accepts all valid explanation filters', () => {
      expect(validateTestSettings({ explanationFilter: 'all' }).explanationFilter).toBe('all');
      expect(
        validateTestSettings({ explanationFilter: 'with-explanations' }).explanationFilter
      ).toBe('with-explanations');
      expect(
        validateTestSettings({ explanationFilter: 'without-explanations' }).explanationFilter
      ).toBe('without-explanations');
    });

    it('defaults to "all" explanation filter when missing', () => {
      const validated = validateTestSettings({});
      expect(validated.explanationFilter).toBe('all');
    });

    it('defaults showCompetencies to false when missing', () => {
      const validated = validateTestSettings({});
      expect(validated.showCompetencies).toBe(false);
    });

    it('preserves showCompetencies when provided', () => {
      expect(validateTestSettings({ showCompetencies: true }).showCompetencies).toBe(true);
      expect(validateTestSettings({ showCompetencies: false }).showCompetencies).toBe(false);
    });

    it('defaults competencyFilter to "all" when missing', () => {
      const validated = validateTestSettings({});
      expect(validated.competencyFilter).toBe('all');
    });

    it('preserves competencyFilter when provided', () => {
      const validated = validateTestSettings({ competencyFilter: 'comp-123' });
      expect(validated.competencyFilter).toBe('comp-123');
    });

    it('handles zero question count by using default (0 is falsy)', () => {
      const validated = validateTestSettings({ questionCount: 0 });
      // 0 || DEFAULT returns DEFAULT, then clamped to min/max
      expect(validated.questionCount).toBe(TEST_SETTINGS.DEFAULT_QUESTION_COUNT);
    });

    it('handles negative values', () => {
      const validated = validateTestSettings({ questionCount: -10, timerDuration: -5 });
      expect(validated.questionCount).toBe(TEST_SETTINGS.MIN_QUESTION_COUNT);
      expect(validated.timerDuration).toBe(TEST_SETTINGS.MIN_TIMER_DURATION);
    });
  });

  describe('saveTestSettings', () => {
    it('saves settings to sessionStorage', () => {
      const settings: TestSettings = {
        questionCount: 25,
        questionType: 'single',
        timerDuration: 60,
        explanationFilter: 'with-explanations',
        showCompetencies: false,
        competencyFilter: 'all',
      };

      saveTestSettings(settings);

      const saved = sessionStorage.getItem(TEST_SETTINGS.SESSION_STORAGE_KEY);
      expect(saved).toBeTruthy();
      expect(JSON.parse(saved!)).toEqual(settings);
    });

    it('overwrites existing settings', () => {
      const settings1: TestSettings = {
        questionCount: 25,
        questionType: 'single',
        timerDuration: 60,
        explanationFilter: 'all',
      };

      const settings2: TestSettings = {
        questionCount: 75,
        questionType: 'multiple',
        timerDuration: 120,
        explanationFilter: 'with-explanations',
      };

      saveTestSettings(settings1);
      saveTestSettings(settings2);

      const saved = JSON.parse(sessionStorage.getItem(TEST_SETTINGS.SESSION_STORAGE_KEY)!);
      expect(saved).toEqual(settings2);
    });

    it('does nothing in non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      const settings: TestSettings = {
        questionCount: 25,
        questionType: 'single',
        timerDuration: 60,
        explanationFilter: 'all',
      };

      expect(() => saveTestSettings(settings)).not.toThrow();

      global.window = originalWindow;
    });
  });

  describe('loadTestSettings', () => {
    it('loads saved settings from sessionStorage', () => {
      const settings: TestSettings = {
        questionCount: 75,
        questionType: 'multiple',
        timerDuration: 120,
        explanationFilter: 'without-explanations',
        showCompetencies: true,
        competencyFilter: 'comp-456',
      };

      saveTestSettings(settings);

      const loaded = loadTestSettings();
      expect(loaded).toEqual(settings);
    });

    it('returns defaults when no settings saved', () => {
      const loaded = loadTestSettings();
      expect(loaded).toEqual(DEFAULT_TEST_SETTINGS);
    });

    it('validates loaded settings', () => {
      // Save invalid settings directly to storage
      sessionStorage.setItem(
        TEST_SETTINGS.SESSION_STORAGE_KEY,
        JSON.stringify({ questionCount: 500, timerDuration: 1000 })
      );

      const loaded = loadTestSettings();

      expect(loaded.questionCount).toBe(TEST_SETTINGS.MAX_QUESTION_COUNT);
      expect(loaded.timerDuration).toBe(TEST_SETTINGS.MAX_TIMER_DURATION);
    });

    it('returns defaults when parsing fails', () => {
      sessionStorage.setItem(TEST_SETTINGS.SESSION_STORAGE_KEY, 'invalid json{');

      const loaded = loadTestSettings();
      expect(loaded).toEqual(DEFAULT_TEST_SETTINGS);
    });

    it('returns defaults in non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      const loaded = loadTestSettings();
      expect(loaded).toEqual(DEFAULT_TEST_SETTINGS);

      global.window = originalWindow;
    });

    it('handles corrupted JSON gracefully', () => {
      sessionStorage.setItem(TEST_SETTINGS.SESSION_STORAGE_KEY, '{"incomplete":');

      const loaded = loadTestSettings();
      expect(loaded).toEqual(DEFAULT_TEST_SETTINGS);
    });

    it('handles non-object JSON', () => {
      sessionStorage.setItem(TEST_SETTINGS.SESSION_STORAGE_KEY, '"string"');

      const loaded = loadTestSettings();
      expect(loaded).toEqual(DEFAULT_TEST_SETTINGS);
    });
  });

  describe('clearTestSettings', () => {
    it('removes settings from sessionStorage', () => {
      const settings: TestSettings = {
        questionCount: 50,
        questionType: 'all',
        timerDuration: 90,
        explanationFilter: 'all',
      };

      saveTestSettings(settings);
      expect(sessionStorage.getItem(TEST_SETTINGS.SESSION_STORAGE_KEY)).toBeTruthy();

      clearTestSettings();
      expect(sessionStorage.getItem(TEST_SETTINGS.SESSION_STORAGE_KEY)).toBeNull();
    });

    it('does nothing when no settings exist', () => {
      expect(() => clearTestSettings()).not.toThrow();
      expect(sessionStorage.getItem(TEST_SETTINGS.SESSION_STORAGE_KEY)).toBeNull();
    });

    it('handles non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      expect(() => clearTestSettings()).not.toThrow();

      global.window = originalWindow;
    });
  });

  describe('resetToDefaults', () => {
    it('clears settings and returns defaults', () => {
      const settings: TestSettings = {
        questionCount: 75,
        questionType: 'multiple',
        timerDuration: 120,
        explanationFilter: 'with-explanations',
      };

      saveTestSettings(settings);

      const defaults = resetToDefaults();

      expect(defaults).toEqual(DEFAULT_TEST_SETTINGS);
      expect(sessionStorage.getItem(TEST_SETTINGS.SESSION_STORAGE_KEY)).toBeNull();
    });

    it('returns defaults when no settings exist', () => {
      const defaults = resetToDefaults();
      expect(defaults).toEqual(DEFAULT_TEST_SETTINGS);
    });

    it('handles non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      const defaults = resetToDefaults();
      expect(defaults).toEqual(DEFAULT_TEST_SETTINGS);

      global.window = originalWindow;
    });
  });

  describe('DEFAULT_TEST_SETTINGS', () => {
    it('has expected default values', () => {
      expect(DEFAULT_TEST_SETTINGS).toEqual({
        questionCount: TEST_SETTINGS.DEFAULT_QUESTION_COUNT,
        questionType: 'all',
        timerDuration: TEST_SETTINGS.DEFAULT_TIMER_DURATION,
        explanationFilter: 'all',
        showCompetencies: false,
        competencyFilter: 'all',
      });
    });

    it('is within valid ranges', () => {
      expect(DEFAULT_TEST_SETTINGS.questionCount).toBeGreaterThanOrEqual(
        TEST_SETTINGS.MIN_QUESTION_COUNT
      );
      expect(DEFAULT_TEST_SETTINGS.questionCount).toBeLessThanOrEqual(
        TEST_SETTINGS.MAX_QUESTION_COUNT
      );
      expect(DEFAULT_TEST_SETTINGS.timerDuration).toBeGreaterThanOrEqual(
        TEST_SETTINGS.MIN_TIMER_DURATION
      );
      expect(DEFAULT_TEST_SETTINGS.timerDuration).toBeLessThanOrEqual(
        TEST_SETTINGS.MAX_TIMER_DURATION
      );
    });
  });

  describe('integration scenarios', () => {
    it('saves, loads, and validates settings correctly', () => {
      const original: TestSettings = {
        questionCount: 25,
        questionType: 'single',
        timerDuration: 60,
        explanationFilter: 'with-explanations',
        showCompetencies: true,
        competencyFilter: 'comp-789',
      };

      saveTestSettings(original);
      const loaded = loadTestSettings();

      expect(loaded).toEqual(original);
    });

    it('handles save-clear-load cycle', () => {
      const settings: TestSettings = {
        questionCount: 50,
        questionType: 'all',
        timerDuration: 90,
        explanationFilter: 'all',
      };

      saveTestSettings(settings);
      clearTestSettings();
      const loaded = loadTestSettings();

      expect(loaded).toEqual(DEFAULT_TEST_SETTINGS);
    });

    it('handles save-reset-load cycle', () => {
      const settings: TestSettings = {
        questionCount: 75,
        questionType: 'multiple',
        timerDuration: 120,
        explanationFilter: 'without-explanations',
      };

      saveTestSettings(settings);
      resetToDefaults();
      const loaded = loadTestSettings();

      expect(loaded).toEqual(DEFAULT_TEST_SETTINGS);
    });

    it('validates on load prevents invalid state', () => {
      // Manually set invalid data
      sessionStorage.setItem(
        TEST_SETTINGS.SESSION_STORAGE_KEY,
        JSON.stringify({
          questionCount: 1000,
          questionType: 'invalid',
          timerDuration: -50,
        })
      );

      const loaded = loadTestSettings();

      expect(loaded.questionCount).toBe(TEST_SETTINGS.MAX_QUESTION_COUNT);
      expect(loaded.timerDuration).toBe(TEST_SETTINGS.MIN_TIMER_DURATION);
      // Note: validation doesn't type-check questionType, it just uses it or defaults to 'all'
      // @ts-expect-error - invalid is not a valid type but validation accepts it
      expect(loaded.questionType).toBe('invalid');
    });
  });
});
