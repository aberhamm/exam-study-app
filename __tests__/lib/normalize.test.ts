import { generateQuestionId, normalizeQuestions, denormalizeQuestion } from '@/lib/normalize';
import type { ExternalQuestion } from '@/types/external-question';
import type { NormalizedQuestion } from '@/types/normalized';

describe('normalize', () => {
  describe('generateQuestionId', () => {
    it('uses existing id when provided', () => {
      const question: ExternalQuestion = {
        id: 'custom-id-123',
        question: 'Test question?',
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
        answer: 'A',
        question_type: 'single',
      };

      expect(generateQuestionId(question)).toBe('custom-id-123');
    });

    it('generates deterministic hash-based id when id is missing', () => {
      const question: ExternalQuestion = {
        question: 'Test question?',
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
        answer: 'A',
        question_type: 'single',
      };

      const id1 = generateQuestionId(question);
      const id2 = generateQuestionId(question);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^q-[0-9a-z]+$/);
    });

    it('generates different ids for different questions', () => {
      const question1: ExternalQuestion = {
        question: 'Question 1?',
        options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
        answer: 'A',
        question_type: 'single',
      };

      const question2: ExternalQuestion = {
        question: 'Question 2?',
        options: { A: 'A2', B: 'B2', C: 'C2', D: 'D2' },
        answer: 'B',
        question_type: 'single',
      };

      expect(generateQuestionId(question1)).not.toBe(generateQuestionId(question2));
    });

    it('generates different ids for same question with different answers', () => {
      const base: ExternalQuestion = {
        question: 'Same question?',
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
        answer: 'A',
        question_type: 'single',
      };

      const different: ExternalQuestion = { ...base, answer: 'B' };

      expect(generateQuestionId(base)).not.toBe(generateQuestionId(different));
    });

    it('generates different ids for single vs multiple question types', () => {
      const single: ExternalQuestion = {
        question: 'Question?',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        answer: 'A',
        question_type: 'single',
      };

      const multiple: ExternalQuestion = {
        question: 'Question?',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        answer: ['A'],
        question_type: 'multiple',
      };

      expect(generateQuestionId(single)).not.toBe(generateQuestionId(multiple));
    });

    it('handles multiple choice answers consistently', () => {
      const question: ExternalQuestion = {
        question: 'Multiple choice?',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        answer: ['A', 'C'],
        question_type: 'multiple',
      };

      const id1 = generateQuestionId(question);
      const id2 = generateQuestionId(question);

      expect(id1).toBe(id2);
    });

    it('ignores whitespace-only id', () => {
      const question: ExternalQuestion = {
        id: '   ',
        question: 'Test?',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        answer: 'A',
        question_type: 'single',
      };

      const id = generateQuestionId(question);
      expect(id).not.toBe('   ');
      expect(id).toMatch(/^q-[0-9a-z]+$/);
    });

    it('defaults to single type when question_type is missing', () => {
      const withType: ExternalQuestion = {
        question: 'Test?',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        answer: 'A',
        question_type: 'single',
      };

      const withoutType: ExternalQuestion = {
        question: 'Test?',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        answer: 'A',
      };

      expect(generateQuestionId(withType)).toBe(generateQuestionId(withoutType));
    });
  });

  describe('normalizeQuestions', () => {
    it('normalizes single select question correctly', () => {
      const external: ExternalQuestion[] = [
        {
          id: 'q1',
          question: 'What is 2+2?',
          options: { A: 'Three', B: 'Four', C: 'Five', D: 'Six' },
          answer: 'B',
          question_type: 'single',
          explanation: 'Basic math',
        },
      ];

      const normalized = normalizeQuestions(external);

      expect(normalized).toHaveLength(1);
      expect(normalized[0]).toEqual({
        id: 'q1',
        prompt: 'What is 2+2?',
        choices: ['Three', 'Four', 'Five', 'Six'],
        answerIndex: 1,
        questionType: 'single',
        explanation: 'Basic math',
        explanationGeneratedByAI: undefined,
        study: undefined,
        competencyIds: undefined,
      });
    });

    it('normalizes multiple select question correctly', () => {
      const external: ExternalQuestion[] = [
        {
          id: 'q2',
          question: 'Select even numbers',
          options: { A: 'One', B: 'Two', C: 'Three', D: 'Four' },
          answer: ['B', 'D'],
          question_type: 'multiple',
        },
      ];

      const normalized = normalizeQuestions(external);

      expect(normalized[0]).toEqual({
        id: 'q2',
        prompt: 'Select even numbers',
        choices: ['One', 'Two', 'Three', 'Four'],
        answerIndex: [1, 3],
        questionType: 'multiple',
        explanation: undefined,
        explanationGeneratedByAI: undefined,
        study: undefined,
        competencyIds: undefined,
      });
    });

    it('handles questions with 5 options', () => {
      const external: ExternalQuestion[] = [
        {
          question: 'Pick E',
          options: { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' },
          answer: 'E',
          question_type: 'single',
        },
      ];

      const normalized = normalizeQuestions(external);

      expect(normalized[0].choices).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(normalized[0].answerIndex).toBe(4);
    });

    it('defaults question type to single when missing', () => {
      const external: ExternalQuestion[] = [
        {
          question: 'No type',
          options: { A: 'A', B: 'B', C: 'C', D: 'D' },
          answer: 'A',
        },
      ];

      const normalized = normalizeQuestions(external);

      expect(normalized[0].questionType).toBe('single');
    });

    it('generates id when missing', () => {
      const external: ExternalQuestion[] = [
        {
          question: 'No ID',
          options: { A: 'A', B: 'B', C: 'C', D: 'D' },
          answer: 'A',
        },
      ];

      const normalized = normalizeQuestions(external);

      expect(normalized[0].id).toMatch(/^q-[0-9a-z]+$/);
    });

    it('preserves all optional fields', () => {
      const external: ExternalQuestion[] = [
        {
          id: 'q1',
          question: 'Test',
          options: { A: 'A', B: 'B', C: 'C', D: 'D' },
          answer: 'A',
          question_type: 'single',
          explanation: 'Explanation text',
          explanationGeneratedByAI: true,
          study: [{ chunkId: 'chunk1', url: 'http://example.com', excerpt: 'Study text' }],
          competencyIds: ['comp1', 'comp2'],
        },
      ];

      const normalized = normalizeQuestions(external);

      expect(normalized[0].explanation).toBe('Explanation text');
      expect(normalized[0].explanationGeneratedByAI).toBe(true);
      expect(normalized[0].study).toEqual([
        { chunkId: 'chunk1', url: 'http://example.com', excerpt: 'Study text' },
      ]);
      expect(normalized[0].competencyIds).toEqual(['comp1', 'comp2']);
    });

    it('handles empty array', () => {
      const normalized = normalizeQuestions([]);
      expect(normalized).toEqual([]);
    });

    it('handles multiple questions', () => {
      const external: ExternalQuestion[] = [
        {
          question: 'Q1',
          options: { A: 'A', B: 'B', C: 'C', D: 'D' },
          answer: 'A',
        },
        {
          question: 'Q2',
          options: { A: 'A', B: 'B', C: 'C', D: 'D' },
          answer: 'B',
        },
      ];

      const normalized = normalizeQuestions(external);

      expect(normalized).toHaveLength(2);
      expect(normalized[0].answerIndex).toBe(0);
      expect(normalized[1].answerIndex).toBe(1);
    });
  });

  describe('denormalizeQuestion', () => {
    it('denormalizes single select question correctly', () => {
      const normalized: NormalizedQuestion = {
        id: 'q1',
        prompt: 'What is 2+2?',
        choices: ['Three', 'Four', 'Five', 'Six'],
        answerIndex: 1,
        questionType: 'single',
        explanation: 'Basic math',
      };

      const external = denormalizeQuestion(normalized);

      expect(external).toEqual({
        id: 'q1',
        question: 'What is 2+2?',
        options: { A: 'Three', B: 'Four', C: 'Five', D: 'Six' },
        answer: 'B',
        question_type: 'single',
        explanation: 'Basic math',
        explanationGeneratedByAI: undefined,
        study: undefined,
        competencyIds: undefined,
      });
    });

    it('denormalizes multiple select question correctly', () => {
      const normalized: NormalizedQuestion = {
        id: 'q2',
        prompt: 'Select even numbers',
        choices: ['One', 'Two', 'Three', 'Four'],
        answerIndex: [1, 3],
        questionType: 'multiple',
      };

      const external = denormalizeQuestion(normalized);

      expect(external.answer).toEqual(['B', 'D']);
      expect(external.question_type).toBe('multiple');
    });

    it('handles 5 options correctly', () => {
      const normalized: NormalizedQuestion = {
        id: 'q3',
        prompt: 'Pick E',
        choices: ['A', 'B', 'C', 'D', 'E'],
        answerIndex: 4,
        questionType: 'single',
      };

      const external = denormalizeQuestion(normalized);

      expect(external.options).toEqual({ A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' });
      expect(external.answer).toBe('E');
    });

    it('preserves all optional fields', () => {
      const normalized: NormalizedQuestion = {
        id: 'q1',
        prompt: 'Test',
        choices: ['A', 'B', 'C', 'D'],
        answerIndex: 0,
        questionType: 'single',
        explanation: 'Explanation text',
        explanationGeneratedByAI: true,
        study: [{ chunkId: 'chunk1', url: 'http://example.com', excerpt: 'Study text' }],
        competencyIds: ['comp1', 'comp2'],
      };

      const external = denormalizeQuestion(normalized);

      expect(external.explanation).toBe('Explanation text');
      expect(external.explanationGeneratedByAI).toBe(true);
      expect(external.study).toEqual([
        { chunkId: 'chunk1', url: 'http://example.com', excerpt: 'Study text' },
      ]);
      expect(external.competencyIds).toEqual(['comp1', 'comp2']);
    });

    it('is reversible with normalizeQuestions', () => {
      const original: ExternalQuestion = {
        id: 'test-123',
        question: 'Reversible test',
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
        answer: 'C',
        question_type: 'single',
        explanation: 'Test explanation',
      };

      const normalized = normalizeQuestions([original])[0];
      const denormalized = denormalizeQuestion(normalized);

      expect(denormalized).toEqual({
        ...original,
        explanationGeneratedByAI: undefined,
        study: undefined,
        competencyIds: undefined,
      });
    });

    it('handles multiple choice with all options selected', () => {
      const normalized: NormalizedQuestion = {
        id: 'q4',
        prompt: 'Select all',
        choices: ['A', 'B', 'C', 'D'],
        answerIndex: [0, 1, 2, 3],
        questionType: 'multiple',
      };

      const external = denormalizeQuestion(normalized);

      expect(external.answer).toEqual(['A', 'B', 'C', 'D']);
    });

    it('handles single selection with index 0', () => {
      const normalized: NormalizedQuestion = {
        id: 'q5',
        prompt: 'First option',
        choices: ['First', 'Second', 'Third', 'Fourth'],
        answerIndex: 0,
        questionType: 'single',
      };

      const external = denormalizeQuestion(normalized);

      expect(external.answer).toBe('A');
    });
  });
});
