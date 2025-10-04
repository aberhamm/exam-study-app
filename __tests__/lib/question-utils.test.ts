import {
  filterQuestionsByType,
  filterQuestionsByExplanation,
  limitQuestions,
  prepareQuestionsForTest,
  shuffleArray,
  getQuestionCounts,
  getQuestionCountsByTypeAndExplanation,
  validateTestConfiguration,
} from '@/lib/question-utils';
import type { NormalizedQuestion } from '@/types/normalized';
import type { TestSettings } from '@/lib/test-settings';

describe('question-utils', () => {
  const mockQuestions: NormalizedQuestion[] = [
    {
      id: 'q1',
      prompt: 'Single with explanation',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: 0,
      questionType: 'single',
      explanation: 'This is an explanation',
    },
    {
      id: 'q2',
      prompt: 'Single without explanation',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: 1,
      questionType: 'single',
    },
    {
      id: 'q3',
      prompt: 'Multiple with explanation',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: [0, 1],
      questionType: 'multiple',
      explanation: 'Multiple choice explanation',
    },
    {
      id: 'q4',
      prompt: 'Multiple without explanation',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: [2, 3],
      questionType: 'multiple',
    },
    {
      id: 'q5',
      prompt: 'Single with whitespace explanation',
      choices: ['A', 'B', 'C', 'D'],
      answerIndex: 2,
      questionType: 'single',
      explanation: '   ',
    },
  ];

  describe('filterQuestionsByType', () => {
    it('returns all questions when filter is "all"', () => {
      const result = filterQuestionsByType(mockQuestions, 'all');
      expect(result).toHaveLength(5);
      expect(result).toEqual(mockQuestions);
    });

    it('filters single select questions', () => {
      const result = filterQuestionsByType(mockQuestions, 'single');
      expect(result).toHaveLength(3);
      expect(result.every((q) => q.questionType === 'single')).toBe(true);
      expect(result.map((q) => q.id)).toEqual(['q1', 'q2', 'q5']);
    });

    it('filters multiple select questions', () => {
      const result = filterQuestionsByType(mockQuestions, 'multiple');
      expect(result).toHaveLength(2);
      expect(result.every((q) => q.questionType === 'multiple')).toBe(true);
      expect(result.map((q) => q.id)).toEqual(['q3', 'q4']);
    });

    it('handles empty array', () => {
      const result = filterQuestionsByType([], 'single');
      expect(result).toEqual([]);
    });
  });

  describe('filterQuestionsByExplanation', () => {
    it('returns all questions when filter is "all"', () => {
      const result = filterQuestionsByExplanation(mockQuestions, 'all');
      expect(result).toHaveLength(5);
      expect(result).toEqual(mockQuestions);
    });

    it('filters questions with explanations', () => {
      const result = filterQuestionsByExplanation(mockQuestions, 'with-explanations');
      expect(result).toHaveLength(2);
      expect(result.map((q) => q.id)).toEqual(['q1', 'q3']);
    });

    it('filters questions without explanations', () => {
      const result = filterQuestionsByExplanation(mockQuestions, 'without-explanations');
      expect(result).toHaveLength(3);
      expect(result.map((q) => q.id)).toEqual(['q2', 'q4', 'q5']);
    });

    it('treats whitespace-only explanation as no explanation', () => {
      const result = filterQuestionsByExplanation(mockQuestions, 'without-explanations');
      expect(result.some((q) => q.id === 'q5')).toBe(true);
    });

    it('handles questions with undefined explanation', () => {
      const questions: NormalizedQuestion[] = [
        {
          id: 'q1',
          prompt: 'No explanation field',
          choices: ['A', 'B'],
          answerIndex: 0,
          questionType: 'single',
        },
      ];

      const result = filterQuestionsByExplanation(questions, 'without-explanations');
      expect(result).toHaveLength(1);
    });

    it('handles empty array', () => {
      const result = filterQuestionsByExplanation([], 'with-explanations');
      expect(result).toEqual([]);
    });
  });

  describe('limitQuestions', () => {
    it('limits questions to specified count', () => {
      const result = limitQuestions(mockQuestions, 3);
      expect(result).toHaveLength(3);
      expect(result).toEqual(mockQuestions.slice(0, 3));
    });

    it('returns all questions when limit exceeds array length', () => {
      const result = limitQuestions(mockQuestions, 100);
      expect(result).toHaveLength(5);
      expect(result).toEqual(mockQuestions);
    });

    it('returns empty array when limit is 0', () => {
      const result = limitQuestions(mockQuestions, 0);
      expect(result).toEqual([]);
    });

    it('handles empty array', () => {
      const result = limitQuestions([], 5);
      expect(result).toEqual([]);
    });
  });

  describe('shuffleArray', () => {
    it('returns array with same length', () => {
      const result = shuffleArray(mockQuestions);
      expect(result).toHaveLength(mockQuestions.length);
    });

    it('returns array with same elements', () => {
      const result = shuffleArray(mockQuestions);
      const originalIds = mockQuestions.map((q) => q.id).sort();
      const shuffledIds = result.map((q) => q.id).sort();
      expect(shuffledIds).toEqual(originalIds);
    });

    it('does not mutate original array', () => {
      const original = [...mockQuestions];
      shuffleArray(mockQuestions);
      expect(mockQuestions).toEqual(original);
    });

    it('produces different order (probabilistic test)', () => {
      const input = Array.from({ length: 20 }, (_, i) => ({
        id: `q${i}`,
        prompt: `Question ${i}`,
        choices: ['A', 'B'],
        answerIndex: 0,
        questionType: 'single' as const,
      }));

      const result = shuffleArray(input);
      const isSameOrder = result.every((q, i) => q.id === input[i].id);

      // With 20 items, probability of same order is 1/20! which is essentially 0
      expect(isSameOrder).toBe(false);
    });

    it('handles single element array', () => {
      const single = [mockQuestions[0]];
      const result = shuffleArray(single);
      expect(result).toEqual(single);
    });

    it('handles empty array', () => {
      const result = shuffleArray([]);
      expect(result).toEqual([]);
    });
  });

  describe('prepareQuestionsForTest', () => {
    it('applies all filters and limits correctly', () => {
      const settings: TestSettings = {
        questionType: 'single',
        explanationFilter: 'with-explanations',
        questionCount: 1,
        timerDuration: 90,
      };

      const result = prepareQuestionsForTest(mockQuestions, settings);

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe('single');
      expect(result[0].explanation).toBeTruthy();
      expect(result[0].explanation?.trim()).not.toBe('');
    });

    it('shuffles questions', () => {
      const settings: TestSettings = {
        questionType: 'all',
        explanationFilter: 'all',
        questionCount: 5,
        timerDuration: 90,
      };

      const input = Array.from({ length: 20 }, (_, i) => ({
        id: `q${i}`,
        prompt: `Question ${i}`,
        choices: ['A', 'B'],
        answerIndex: 0,
        questionType: 'single' as const,
      }));

      const result = prepareQuestionsForTest(input, settings);
      const isSameOrder = result.every((q, i) => q.id === input[i].id);

      expect(isSameOrder).toBe(false);
    });

    it('respects question count limit', () => {
      const settings: TestSettings = {
        questionType: 'all',
        explanationFilter: 'all',
        questionCount: 2,
        timerDuration: 90,
      };

      const result = prepareQuestionsForTest(mockQuestions, settings);
      expect(result).toHaveLength(2);
    });

    it('handles case where filters result in fewer questions than requested', () => {
      const settings: TestSettings = {
        questionType: 'multiple',
        explanationFilter: 'with-explanations',
        questionCount: 10,
        timerDuration: 90,
      };

      const result = prepareQuestionsForTest(mockQuestions, settings);
      expect(result).toHaveLength(1); // Only q3 matches
      expect(result[0].id).toBe('q3');
    });

    it('handles empty filtered result', () => {
      const questions: NormalizedQuestion[] = [
        {
          id: 'q1',
          prompt: 'Single question',
          choices: ['A', 'B'],
          answerIndex: 0,
          questionType: 'single',
        },
      ];

      const settings: TestSettings = {
        questionType: 'multiple',
        explanationFilter: 'all',
        questionCount: 5,
        timerDuration: 90,
      };

      const result = prepareQuestionsForTest(questions, settings);
      expect(result).toEqual([]);
    });
  });

  describe('getQuestionCounts', () => {
    it('returns correct counts for all categories', () => {
      const counts = getQuestionCounts(mockQuestions);

      expect(counts).toEqual({
        all: 5,
        single: 3,
        multiple: 2,
        'with-explanations': 2,
        'without-explanations': 3,
      });
    });

    it('handles empty array', () => {
      const counts = getQuestionCounts([]);

      expect(counts).toEqual({
        all: 0,
        single: 0,
        multiple: 0,
        'with-explanations': 0,
        'without-explanations': 0,
      });
    });

    it('counts whitespace explanation as without explanation', () => {
      const counts = getQuestionCounts(mockQuestions);
      expect(counts['without-explanations']).toBe(3);
    });
  });

  describe('getQuestionCountsByTypeAndExplanation', () => {
    it('returns counts for all explanation filter', () => {
      const counts = getQuestionCountsByTypeAndExplanation(mockQuestions, 'all');

      expect(counts).toEqual({
        all: 5,
        single: 3,
        multiple: 2,
      });
    });

    it('returns counts for with-explanations filter', () => {
      const counts = getQuestionCountsByTypeAndExplanation(mockQuestions, 'with-explanations');

      expect(counts).toEqual({
        all: 2,
        single: 1,
        multiple: 1,
      });
    });

    it('returns counts for without-explanations filter', () => {
      const counts = getQuestionCountsByTypeAndExplanation(mockQuestions, 'without-explanations');

      expect(counts).toEqual({
        all: 3,
        single: 2,
        multiple: 1,
      });
    });

    it('handles empty array', () => {
      const counts = getQuestionCountsByTypeAndExplanation([], 'all');

      expect(counts).toEqual({
        all: 0,
        single: 0,
        multiple: 0,
      });
    });
  });

  describe('validateTestConfiguration', () => {
    it('validates valid configuration', () => {
      const settings: TestSettings = {
        questionType: 'all',
        questionCount: 3,
        timerDuration: 90,
        explanationFilter: 'all',
      };

      const result = validateTestConfiguration(mockQuestions, settings);
      expect(result.valid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('rejects when no questions available for type', () => {
      const questions: NormalizedQuestion[] = [
        {
          id: 'q1',
          prompt: 'Single only',
          choices: ['A', 'B'],
          answerIndex: 0,
          questionType: 'single',
        },
      ];

      const settings: TestSettings = {
        questionType: 'multiple',
        questionCount: 1,
        timerDuration: 90,
        explanationFilter: 'all',
      };

      const result = validateTestConfiguration(questions, settings);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('No questions available for type: multiple');
    });

    it('rejects when requested count exceeds available', () => {
      const settings: TestSettings = {
        questionType: 'single',
        questionCount: 10,
        timerDuration: 90,
        explanationFilter: 'all',
      };

      const result = validateTestConfiguration(mockQuestions, settings);
      expect(result.valid).toBe(false);
      expect(result.message).toBe(
        'Requested 10 questions but only 3 available for type: single'
      );
    });

    it('validates when requested count equals available', () => {
      const settings: TestSettings = {
        questionType: 'single',
        questionCount: 3,
        timerDuration: 90,
        explanationFilter: 'all',
      };

      const result = validateTestConfiguration(mockQuestions, settings);
      expect(result.valid).toBe(true);
    });

    it('handles empty questions array', () => {
      const settings: TestSettings = {
        questionType: 'all',
        questionCount: 1,
        timerDuration: 90,
        explanationFilter: 'all',
      };

      const result = validateTestConfiguration([], settings);
      expect(result.valid).toBe(false);
      expect(result.message).toBe('No questions available for type: all');
    });

    it('validates "all" question type correctly', () => {
      const settings: TestSettings = {
        questionType: 'all',
        questionCount: 5,
        timerDuration: 90,
        explanationFilter: 'all',
      };

      const result = validateTestConfiguration(mockQuestions, settings);
      expect(result.valid).toBe(true);
    });
  });
});
