// src/lib/validation.ts
import { z } from 'zod';
import type { ExamDetail, ExternalQuestion, StudyLink } from '@/types/external-question';
import type { ExplanationSource } from '@/types/explanation';

export const StudyLinkZ = z.object({
  chunkId: z.string().min(1),
  url: z.string().url().optional(),
  anchor: z.string().optional(),
  excerpt: z.string().optional(),
});

export const ExplanationSourceZ = z.object({
  url: z.string().url().optional(),
  title: z.string().optional(),
  sourceFile: z.string().min(1),
  sectionPath: z.string().optional(),
}) as unknown as z.ZodType<ExplanationSource>;

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
  explanationSources: z.array(ExplanationSourceZ).optional(),
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

/**
 * ExamDetailZ
 * Strict schema for the in-memory exam + questions payload used by the app/API.
 * Note: This is not a file on disk; the name reflects the pipeline-originated shape.
 */
export const ExamDetailZ = z.object({
  examId: z.string().optional().default('sitecore-xmc'),
  examTitle: z.string().optional().default('Sitecore XM Cloud'),
  welcomeConfig: WelcomeConfigZ.optional(),
  documentGroups: z.array(z.string()).optional(),
  questions: z.array(ExternalQuestionZ),
});

export const ExternalQuestionsImportZ = z.object({
  questions: z.array(ExternalQuestionZ).min(1, 'questions array must include at least one question'),
});

export const CompetencyZ = z.object({
  id: z.string().min(1),
  examId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  examPercentage: z.number().min(0).max(100),
  embedding: z.array(z.number()).optional(),
  embeddingModel: z.string().optional(),
  embeddingUpdatedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CompetencyCreateZ = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  examPercentage: z.number().min(0).max(100),
});

export const CompetencyUpdateZ = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  examPercentage: z.number().min(0).max(100).optional(),
});

// Utility: non-throwing structural coercion from loose input into ExamDetail-like shape
// Intended to be followed by ExamDetailZ.parse(...) for strict validation.
export function coerceExamDetail(input: unknown): ExamDetail {
  const file = (input ?? {}) as Partial<ExamDetail> & { questions?: unknown; documentGroups?: unknown };

  const questionsIn = Array.isArray(file.questions) ? (file.questions as unknown[]) : [];
  const questions: ExternalQuestion[] = questionsIn.map((q) => coerceExternalQuestion(q));

  const documentGroups = Array.isArray(file.documentGroups)
    ? (file.documentGroups as string[]).filter((g): g is string => typeof g === 'string')
    : undefined;

  return {
    examId: typeof (file as Partial<ExamDetail> & { examId?: unknown }).examId === 'string'
      ? (file as Partial<ExamDetail> & { examId?: string }).examId
      : undefined,
    examTitle: typeof (file as Partial<ExamDetail> & { examTitle?: unknown }).examTitle === 'string'
      ? (file as Partial<ExamDetail> & { examTitle?: string }).examTitle
      : undefined,
    welcomeConfig: (file as Partial<ExamDetail>).welcomeConfig,
    documentGroups,
    questions,
  };
}

/**
 * coerceExternalQuestion
 * Non-throwing coercion of a loose question object into ExternalQuestion shape.
 * Does not validate contents; use ExternalQuestionZ.parse for strict validation.
 */
export function coerceExternalQuestion(q: unknown): ExternalQuestion {
  const qq = (q ?? {}) as Partial<ExternalQuestion> & { id?: string };

  // Normalize study: only accept arrays; coerce null/other to undefined
  const study = Array.isArray(qq.study) ? (qq.study as StudyLink[]) : undefined;

  // Normalize explanationSources: accept arrays of objects
  const explanationSources = Array.isArray((qq as { explanationSources?: unknown }).explanationSources)
    ? ((qq as { explanationSources?: unknown[] }).explanationSources as unknown[]).map((s) => s as unknown as ExplanationSource)
    : undefined;

  // Normalize options: ensure structure exists (Zod will validate contents)
  const options = qq.options as ExternalQuestion['options'];

  return {
    id: typeof (qq as { id?: unknown }).id === 'string' ? (qq as { id?: string }).id : undefined,
    question: String(qq.question ?? ''),
    options,
    answer: qq.answer as ExternalQuestion['answer'],
    question_type: (qq.question_type as 'single' | 'multiple' | undefined) ?? 'single',
    explanation: typeof qq.explanation === 'string' ? qq.explanation : undefined,
    explanationSources,
    study,
  } as ExternalQuestion;
}
