// src/lib/validation.ts
import { z } from 'zod';

export const StudyLinkZ = z.object({
  chunkId: z.string().min(1),
  url: z.string().url().optional(),
  anchor: z.string().optional(),
  excerpt: z.string().optional(),
});

export const ExternalQuestionZ = z.object({
  question: z.string().min(1),
  options: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }),
  answer: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().optional(),
  study: z.array(StudyLinkZ).optional(),
});

export const ExternalQuestionsFileZ = z.object({
  questions: z.array(ExternalQuestionZ),
});
