import {
  recordQuestionSeen,
  recordQuestionResult,
  getQuestionMetrics,
  getAllQuestionMetrics,
  resetQuestionMetrics,
  getMissedQuestionIds,
} from '@/lib/question-metrics';

describe('question-metrics', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('recordQuestionSeen', () => {
    it('increments seen count for new question', () => {
      const metrics = recordQuestionSeen('q1');

      expect(metrics.seen).toBe(1);
      expect(metrics.correct).toBe(0);
      expect(metrics.incorrect).toBe(0);
    });

    it('increments seen count for existing question', () => {
      recordQuestionSeen('q1');
      const metrics = recordQuestionSeen('q1');

      expect(metrics.seen).toBe(2);
    });

    it('persists to localStorage', () => {
      recordQuestionSeen('q1');

      const stored = JSON.parse(localStorage.getItem('scxmcl-question-metrics')!);
      expect(stored.q1.seen).toBe(1);
    });

    it('handles multiple questions independently', () => {
      recordQuestionSeen('q1');
      recordQuestionSeen('q2');
      recordQuestionSeen('q1');

      const metrics1 = getQuestionMetrics('q1');
      const metrics2 = getQuestionMetrics('q2');

      expect(metrics1.seen).toBe(2);
      expect(metrics2.seen).toBe(1);
    });
  });

  describe('recordQuestionResult', () => {
    it('increments correct count when result is correct', () => {
      const metrics = recordQuestionResult('q1', 'correct');

      expect(metrics.correct).toBe(1);
      expect(metrics.incorrect).toBe(0);
    });

    it('increments incorrect count when result is incorrect', () => {
      const metrics = recordQuestionResult('q1', 'incorrect');

      expect(metrics.correct).toBe(0);
      expect(metrics.incorrect).toBe(1);
    });

    it('accumulates correct results', () => {
      recordQuestionResult('q1', 'correct');
      recordQuestionResult('q1', 'correct');
      const metrics = recordQuestionResult('q1', 'correct');

      expect(metrics.correct).toBe(3);
      expect(metrics.incorrect).toBe(0);
    });

    it('accumulates incorrect results', () => {
      recordQuestionResult('q1', 'incorrect');
      recordQuestionResult('q1', 'incorrect');
      const metrics = recordQuestionResult('q1', 'incorrect');

      expect(metrics.correct).toBe(0);
      expect(metrics.incorrect).toBe(3);
    });

    it('tracks mixed results correctly', () => {
      recordQuestionResult('q1', 'correct');
      recordQuestionResult('q1', 'incorrect');
      recordQuestionResult('q1', 'correct');
      const metrics = recordQuestionResult('q1', 'incorrect');

      expect(metrics.correct).toBe(2);
      expect(metrics.incorrect).toBe(2);
    });

    it('persists to localStorage', () => {
      recordQuestionResult('q1', 'correct');
      recordQuestionResult('q1', 'incorrect');

      const stored = JSON.parse(localStorage.getItem('scxmcl-question-metrics')!);
      expect(stored.q1.correct).toBe(1);
      expect(stored.q1.incorrect).toBe(1);
    });
  });

  describe('getQuestionMetrics', () => {
    it('returns zero metrics for new question', () => {
      const metrics = getQuestionMetrics('q1');

      expect(metrics).toEqual({
        seen: 0,
        correct: 0,
        incorrect: 0,
      });
    });

    it('returns stored metrics for existing question', () => {
      recordQuestionSeen('q1');
      recordQuestionResult('q1', 'correct');

      const metrics = getQuestionMetrics('q1');

      expect(metrics.seen).toBe(1);
      expect(metrics.correct).toBe(1);
      expect(metrics.incorrect).toBe(0);
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('scxmcl-question-metrics', 'invalid json{');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const metrics = getQuestionMetrics('q1');

      expect(metrics).toEqual({ seen: 0, correct: 0, incorrect: 0 });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getAllQuestionMetrics', () => {
    it('returns empty object when no metrics exist', () => {
      const allMetrics = getAllQuestionMetrics();
      expect(allMetrics).toEqual({});
    });

    it('returns all stored metrics', () => {
      recordQuestionSeen('q1');
      recordQuestionResult('q1', 'correct');
      recordQuestionSeen('q2');
      recordQuestionResult('q2', 'incorrect');
      recordQuestionResult('q2', 'incorrect');

      const allMetrics = getAllQuestionMetrics();

      expect(allMetrics).toEqual({
        q1: { seen: 1, correct: 1, incorrect: 0 },
        q2: { seen: 1, correct: 0, incorrect: 2 },
      });
    });

    it('handles corrupted data', () => {
      localStorage.setItem('scxmcl-question-metrics', 'not json');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const allMetrics = getAllQuestionMetrics();

      expect(allMetrics).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('handles null value from localStorage', () => {
      localStorage.setItem('scxmcl-question-metrics', 'null');

      const allMetrics = getAllQuestionMetrics();

      expect(allMetrics).toEqual({});
    });

    it('handles non-object value from localStorage', () => {
      localStorage.setItem('scxmcl-question-metrics', '"string"');

      const allMetrics = getAllQuestionMetrics();

      expect(allMetrics).toEqual({});
    });
  });

  describe('resetQuestionMetrics', () => {
    beforeEach(() => {
      recordQuestionSeen('q1');
      recordQuestionResult('q1', 'correct');
      recordQuestionSeen('q2');
      recordQuestionResult('q2', 'incorrect');
    });

    it('resets specific question metrics', () => {
      resetQuestionMetrics('q1');

      const metrics1 = getQuestionMetrics('q1');
      const metrics2 = getQuestionMetrics('q2');

      expect(metrics1).toEqual({ seen: 0, correct: 0, incorrect: 0 });
      expect(metrics2.seen).toBe(1);
      expect(metrics2.incorrect).toBe(1);
    });

    it('resets all metrics when no question ID provided', () => {
      resetQuestionMetrics();

      const metrics1 = getQuestionMetrics('q1');
      const metrics2 = getQuestionMetrics('q2');

      expect(metrics1).toEqual({ seen: 0, correct: 0, incorrect: 0 });
      expect(metrics2).toEqual({ seen: 0, correct: 0, incorrect: 0 });
      expect(localStorage.getItem('scxmcl-question-metrics')).toBeNull();
    });

    it('handles non-existent question gracefully', () => {
      expect(() => resetQuestionMetrics('nonexistent')).not.toThrow();

      const metrics = getQuestionMetrics('nonexistent');
      expect(metrics).toEqual({ seen: 0, correct: 0, incorrect: 0 });
    });

    it('handles localStorage errors gracefully', () => {
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(() => resetQuestionMetrics()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getMissedQuestionIds', () => {
    beforeEach(() => {
      recordQuestionResult('q1', 'correct');
      recordQuestionResult('q2', 'incorrect');
      recordQuestionResult('q3', 'incorrect');
      recordQuestionResult('q3', 'incorrect');
      recordQuestionResult('q4', 'correct');
      recordQuestionResult('q5', 'incorrect');
      recordQuestionResult('q5', 'correct');
    });

    it('returns questions with at least 1 incorrect answer by default', () => {
      const missed = getMissedQuestionIds();

      expect(missed).toHaveLength(3);
      expect(missed).toContain('q2');
      expect(missed).toContain('q3');
      expect(missed).toContain('q5');
    });

    it('filters by minimum incorrect count', () => {
      const missed = getMissedQuestionIds(2);

      expect(missed).toHaveLength(1);
      expect(missed).toContain('q3');
    });

    it('returns empty array when no questions match threshold', () => {
      const missed = getMissedQuestionIds(10);
      expect(missed).toEqual([]);
    });

    it('returns empty array when no metrics exist', () => {
      localStorage.clear();
      const missed = getMissedQuestionIds();
      expect(missed).toEqual([]);
    });

    it('excludes questions with zero incorrect answers', () => {
      const missed = getMissedQuestionIds(1);

      expect(missed).not.toContain('q1');
      expect(missed).not.toContain('q4');
    });

    it('includes questions with exactly the minimum threshold', () => {
      recordQuestionResult('q6', 'incorrect');
      recordQuestionResult('q6', 'incorrect');

      const missed = getMissedQuestionIds(2);

      expect(missed).toContain('q3');
      expect(missed).toContain('q6');
    });

    it('handles zero threshold', () => {
      recordQuestionSeen('q7'); // Seen but never answered

      const missed = getMissedQuestionIds(0);

      expect(missed.length).toBeGreaterThan(0);
      // Should include all questions with any tracking
    });
  });

  describe('server-side behavior', () => {
    it('returns default metrics when not in browser', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      const metrics = getQuestionMetrics('q1');
      expect(metrics).toEqual({ seen: 0, correct: 0, incorrect: 0 });

      global.window = originalWindow;
    });

    it('does not throw when recording in non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      expect(() => recordQuestionSeen('q1')).not.toThrow();
      expect(() => recordQuestionResult('q1', 'correct')).not.toThrow();

      global.window = originalWindow;
    });

    it('handles reset gracefully in non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing server-side behavior
      delete global.window;

      expect(() => resetQuestionMetrics()).not.toThrow();
      expect(() => resetQuestionMetrics('q1')).not.toThrow();

      global.window = originalWindow;
    });
  });

  describe('edge cases', () => {
    it('handles question IDs with special characters', () => {
      const specialId = 'q-123_test.special@id';

      recordQuestionSeen(specialId);
      recordQuestionResult(specialId, 'correct');

      const metrics = getQuestionMetrics(specialId);
      expect(metrics.seen).toBe(1);
      expect(metrics.correct).toBe(1);
    });

    it('handles very long question IDs', () => {
      const longId = 'q' + 'a'.repeat(1000);

      recordQuestionSeen(longId);
      const metrics = getQuestionMetrics(longId);

      expect(metrics.seen).toBe(1);
    });

    it('maintains data integrity across many operations', () => {
      for (let i = 0; i < 100; i++) {
        recordQuestionSeen(`q${i}`);
        recordQuestionResult(`q${i}`, i % 2 === 0 ? 'correct' : 'incorrect');
      }

      const allMetrics = getAllQuestionMetrics();
      expect(Object.keys(allMetrics)).toHaveLength(100);

      const missed = getMissedQuestionIds(1);
      expect(missed).toHaveLength(50); // Half should be incorrect
    });
  });
});
