import {
  saveExamState,
  loadExamState,
  clearExamState,
  hasActiveExam,
  createExamState,
  updateExamState,
  isExamStateValid,
} from '@/lib/exam-state';
import type { ExamState } from '@/lib/exam-state';
import type { NormalizedQuestion } from '@/types/normalized';
import type { TestSettings } from '@/lib/test-settings';

describe('exam-state', () => {
  const mockQuestions: NormalizedQuestion[] = [
    {
      id: 'q1',
      prompt: 'Question 1',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: 0,
      questionType: 'single',
    },
    {
      id: 'q2',
      prompt: 'Question 2',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: 1,
      questionType: 'single',
    },
  ];

  const mockTestSettings: TestSettings = {
    questionCount: 10,
    questionType: 'all',
    timerDuration: 90,
    explanationFilter: 'all',
  };

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('saveExamState', () => {
    it('saves exam state to localStorage', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      saveExamState(state);

      const saved = localStorage.getItem('scxmcl-exam-state');
      expect(saved).toBeTruthy();

      const parsed = JSON.parse(saved!);
      expect(parsed.id).toBe(state.id);
      expect(parsed.questions).toEqual(mockQuestions);
      expect(parsed.testSettings).toEqual(mockTestSettings);
    });

    it('updates lastUpdated timestamp when saving', async () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      const initialTimestamp = state.lastUpdated;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      saveExamState(state);

      const saved = JSON.parse(localStorage.getItem('scxmcl-exam-state')!);
      expect(saved.lastUpdated).toBeGreaterThanOrEqual(initialTimestamp);
    });

    it('handles localStorage errors gracefully', () => {
      const state = createExamState(mockQuestions, mockTestSettings);

      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(() => saveExamState(state)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save exam state:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      setItemSpy.mockRestore();
    });
  });

  describe('loadExamState', () => {
    it('loads saved exam state from localStorage', () => {
      const state = createExamState(mockQuestions, mockTestSettings, 'exam-123', 'Test Exam');
      saveExamState(state);

      const loaded = loadExamState();

      expect(loaded).toBeTruthy();
      expect(loaded?.id).toBe(state.id);
      expect(loaded?.examId).toBe('exam-123');
      expect(loaded?.examTitle).toBe('Test Exam');
      expect(loaded?.questions).toEqual(mockQuestions);
    });

    it('returns null when no state is saved', () => {
      const loaded = loadExamState();
      expect(loaded).toBeNull();
    });

    it('returns null and clears state when expired', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      // Set lastUpdated to 25 hours ago
      const expiredState = {
        ...state,
        lastUpdated: Date.now() - 25 * 60 * 60 * 1000,
      };

      localStorage.setItem('scxmcl-exam-state', JSON.stringify(expiredState));

      const loaded = loadExamState();
      expect(loaded).toBeNull();
      expect(localStorage.getItem('scxmcl-exam-state')).toBeNull();
    });

    it('loads state that is not expired', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      // Set lastUpdated to 23 hours ago (within 24 hour window)
      const validState = {
        ...state,
        lastUpdated: Date.now() - 23 * 60 * 60 * 1000,
      };

      localStorage.setItem('scxmcl-exam-state', JSON.stringify(validState));

      const loaded = loadExamState();
      expect(loaded).toBeTruthy();
      expect(loaded?.id).toBe(state.id);
    });

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('scxmcl-exam-state', 'invalid json{');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const loaded = loadExamState();
      expect(loaded).toBeNull();
      expect(localStorage.getItem('scxmcl-exam-state')).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('returns null in server-side environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      const loaded = loadExamState();
      expect(loaded).toBeNull();

      global.window = originalWindow;
    });
  });

  describe('clearExamState', () => {
    it('removes exam state from localStorage', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      saveExamState(state);

      expect(localStorage.getItem('scxmcl-exam-state')).toBeTruthy();

      clearExamState();

      expect(localStorage.getItem('scxmcl-exam-state')).toBeNull();
    });

    it('handles errors gracefully', () => {
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(() => clearExamState()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('hasActiveExam', () => {
    it('returns true when active exam exists', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      saveExamState(state);

      expect(hasActiveExam()).toBe(true);
    });

    it('returns false when no exam exists', () => {
      expect(hasActiveExam()).toBe(false);
    });

    it('returns false when exam is completed', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      state.showResult = true;
      saveExamState(state);

      expect(hasActiveExam()).toBe(false);
    });

    it('returns false when exam is expired', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      const expiredState = {
        ...state,
        lastUpdated: Date.now() - 25 * 60 * 60 * 1000,
      };

      localStorage.setItem('scxmcl-exam-state', JSON.stringify(expiredState));

      expect(hasActiveExam()).toBe(false);
    });
  });

  describe('createExamState', () => {
    it('creates initial exam state with required fields', () => {
      const startTime = Date.now();
      const state = createExamState(mockQuestions, mockTestSettings);

      expect(state.id).toMatch(/^exam-\d+$/);
      expect(state.startTime).toBeGreaterThanOrEqual(startTime);
      expect(state.currentQuestionIndex).toBe(0);
      expect(state.selectedAnswers).toEqual([]);
      expect(state.showResult).toBe(false);
      expect(state.showFeedback).toBe(false);
      expect(state.score).toBe(0);
      expect(state.incorrectAnswers).toEqual([]);
      expect(state.timerRunning).toBe(true);
      expect(state.timeElapsed).toBe(0);
      expect(state.questions).toEqual(mockQuestions);
      expect(state.testSettings).toEqual(mockTestSettings);
      expect(state.lastUpdated).toBeGreaterThanOrEqual(startTime);
    });

    it('includes examId and examTitle when provided', () => {
      const state = createExamState(
        mockQuestions,
        mockTestSettings,
        'exam-123',
        'Test Exam Title'
      );

      expect(state.examId).toBe('exam-123');
      expect(state.examTitle).toBe('Test Exam Title');
    });

    it('creates unique IDs for different exams', async () => {
      const state1 = createExamState(mockQuestions, mockTestSettings);
      await new Promise(resolve => setTimeout(resolve, 10));
      const state2 = createExamState(mockQuestions, mockTestSettings);

      expect(state1.id).not.toBe(state2.id);
    });
  });

  describe('updateExamState', () => {
    it('updates state with new values', () => {
      const initialState = createExamState(mockQuestions, mockTestSettings);

      const updated = updateExamState(initialState, {
        currentQuestionIndex: 1,
        selectedAnswers: [0],
        showFeedback: true,
      });

      expect(updated.currentQuestionIndex).toBe(1);
      expect(updated.selectedAnswers).toEqual([0]);
      expect(updated.showFeedback).toBe(true);
    });

    it('updates lastUpdated timestamp', async () => {
      const initialState = createExamState(mockQuestions, mockTestSettings);
      const initialTimestamp = initialState.lastUpdated;

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = updateExamState(initialState, { currentQuestionIndex: 1 });

      expect(updated.lastUpdated).toBeGreaterThan(initialTimestamp);
    });

    it('preserves unchanged fields', () => {
      const initialState = createExamState(mockQuestions, mockTestSettings);

      const updated = updateExamState(initialState, { currentQuestionIndex: 1 });

      expect(updated.id).toBe(initialState.id);
      expect(updated.questions).toBe(initialState.questions);
      expect(updated.testSettings).toBe(initialState.testSettings);
      expect(updated.score).toBe(initialState.score);
    });

    it('handles empty updates', () => {
      const initialState = createExamState(mockQuestions, mockTestSettings);

      const updated = updateExamState(initialState, {});

      expect(updated.currentQuestionIndex).toBe(initialState.currentQuestionIndex);
      expect(updated.lastUpdated).toBeGreaterThanOrEqual(initialState.lastUpdated);
    });
  });

  describe('isExamStateValid', () => {
    it('validates correct exam state', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      expect(isExamStateValid(state)).toBe(true);
    });

    it('rejects null state', () => {
      expect(isExamStateValid(null)).toBe(false);
    });

    it('rejects state without questions', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      // @ts-expect-error - Testing invalid state
      const invalidState = { ...state, questions: undefined };

      // isExamStateValid returns falsy (undefined from && chain) for invalid state
      expect(isExamStateValid(invalidState as ExamState)).toBeFalsy();
    });

    it('rejects state with empty questions array', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      state.questions = [];

      expect(isExamStateValid(state)).toBeFalsy();
    });

    it('rejects state without test settings', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      // @ts-expect-error - Testing invalid state
      const invalidState = { ...state, testSettings: undefined };

      expect(isExamStateValid(invalidState as ExamState)).toBeFalsy();
    });

    it('rejects state with invalid currentQuestionIndex', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      state.currentQuestionIndex = -1;

      expect(isExamStateValid(state)).toBe(false);
    });

    it('rejects state with currentQuestionIndex >= questions.length', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      state.currentQuestionIndex = mockQuestions.length;

      expect(isExamStateValid(state)).toBe(false);
    });

    it('rejects state without selectedAnswers array', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      // @ts-expect-error - Testing invalid state
      const invalidState = { ...state, selectedAnswers: undefined };

      expect(isExamStateValid(invalidState as ExamState)).toBe(false);
    });

    it('rejects state with non-array selectedAnswers', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      // @ts-expect-error - Testing edge case
      const invalidState = { ...state, selectedAnswers: 'not an array' };

      expect(isExamStateValid(invalidState as ExamState)).toBe(false);
    });

    it('accepts valid state at last question index', () => {
      const state = createExamState(mockQuestions, mockTestSettings);
      state.currentQuestionIndex = mockQuestions.length - 1;

      expect(isExamStateValid(state)).toBe(true);
    });
  });
});
