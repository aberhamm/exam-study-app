import { z } from 'zod';

export const StudyLinkSchema = z.object({
  chunkId: z.string(),
  url: z.string().optional(),
  anchor: z.string().optional(),
  excerpt: z.string().optional(),
});

export const ExternalQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  options: z.object({
    A: z.string().min(1, 'Option A cannot be empty'),
    B: z.string().min(1, 'Option B cannot be empty'),
    C: z.string().min(1, 'Option C cannot be empty'),
    D: z.string().min(1, 'Option D cannot be empty'),
  }),
  answer: z.union([
    z.enum(['A', 'B', 'C', 'D']),
    z.array(z.enum(['A', 'B', 'C', 'D'])).min(1, 'Answer array cannot be empty'),
  ]),
  question_type: z.enum(['single', 'multiple']).optional(),
  explanation: z.string().optional(),
  study: z.array(StudyLinkSchema).optional(),
});

export const ExternalQuestionsFileSchema = z.object({
  examId: z.string().optional(),
  examTitle: z.string().optional(),
  questions: z.array(ExternalQuestionSchema).min(1, 'At least one question is required'),
});

export function validateExternalQuestion(data: unknown) {
  return ExternalQuestionSchema.parse(data);
}

export function validateExternalQuestionsFile(data: unknown) {
  return ExternalQuestionsFileSchema.parse(data);
}

export function validateExternalQuestions(data: unknown) {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array of questions');
  }
  return data.map((item, index) => {
    try {
      return ExternalQuestionSchema.parse(item);
    } catch (error) {
      throw new Error(`Question ${index + 1} validation failed: ${error}`);
    }
  });
}