// src/lib/validation.ts
import { z } from 'zod';
import type { ExternalQuestionsFile, ExternalQuestion, StudyLink } from '@/types/external-question';

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
    E: z.string().min(1).optional(),
  }),
  answer: z.union([
    z.enum(['A', 'B', 'C', 'D', 'E']),
    z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).min(1),
  ]),
  question_type: z.enum(['single', 'multiple']).optional().default('single'),
  explanation: z.string().optional(),
  study: z.array(StudyLinkZ).optional(),
});

export const ExternalQuestionUpdateZ = ExternalQuestionZ.extend({
  id: z.string().min(1),
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

export const ExternalQuestionsImportZ = z.object({
  questions: z.array(ExternalQuestionZ).min(1, 'questions array must include at least one question'),
});

// Utility: sanitize potentially-loose data (e.g., DB docs) into strict ExternalQuestionsFile shape
export function sanitizeExternalQuestionsFile(input: unknown): ExternalQuestionsFile {
  const file = (input ?? {}) as Partial<ExternalQuestionsFile> & { questions?: unknown };

  const questionsIn = Array.isArray(file.questions) ? (file.questions as unknown[]) : [];
  const questions: ExternalQuestion[] = questionsIn.map((q) => sanitizeExternalQuestion(q));

  return {
    examId: typeof (file as Partial<ExternalQuestionsFile> & { examId?: unknown }).examId === 'string'
      ? (file as Partial<ExternalQuestionsFile> & { examId?: string }).examId
      : undefined,
    examTitle: typeof (file as Partial<ExternalQuestionsFile> & { examTitle?: unknown }).examTitle === 'string'
      ? (file as Partial<ExternalQuestionsFile> & { examTitle?: string }).examTitle
      : undefined,
    welcomeConfig: (file as Partial<ExternalQuestionsFile>).welcomeConfig,
    questions,
  };
}

export function sanitizeExternalQuestion(q: unknown): ExternalQuestion {
  const qq = (q ?? {}) as Partial<ExternalQuestion> & { id?: string };

  // Normalize study: only accept arrays; coerce null/other to undefined
  const study = Array.isArray(qq.study) ? (qq.study as StudyLink[]) : undefined;

  // Normalize options: ensure structure exists (Zod will validate contents)
  const options = qq.options as ExternalQuestion['options'];

  return {
    id: typeof (qq as { id?: unknown }).id === 'string' ? (qq as { id?: string }).id : undefined,
    question: String(qq.question ?? ''),
    options,
    answer: qq.answer as ExternalQuestion['answer'],
    question_type: (qq.question_type as 'single' | 'multiple' | undefined) ?? 'single',
    explanation: typeof qq.explanation === 'string' ? qq.explanation : undefined,
    study,
  } as ExternalQuestion;
}
