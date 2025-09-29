// src/lib/validation.ts
import { z } from 'zod';

export const StudyLinkZ = z.object({
  chunkId: z.string().min(1),
  url: z.string().url().optional(),
  anchor: z.string().optional(),
  excerpt: z.string().optional(),
});

export const ExternalQuestionZ = z.object({
  id: z.string().min(1).optional(),
  question: z.string().min(1),
  options: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }),
  answer: z.union([
    z.enum(['A', 'B', 'C', 'D', 'E']),
    z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).min(1),
  ]),
  question_type: z.enum(['single', 'multiple']).optional().default('single'),
  explanation: z.string().optional(),
  study: z.array(StudyLinkZ).optional(),
});

export const WelcomeConfigZ = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ctaText: z.string().optional(),
  showDefaultSubtitle: z.boolean().optional().default(true),
});

export const ExternalQuestionsFileZ = z.object({
  examId: z.string().optional().default('sitecore-xmc'),
  examTitle: z.string().optional().default('Sitecore XM Cloud'),
  welcomeConfig: WelcomeConfigZ.optional(),
  questions: z.array(ExternalQuestionZ),
});
