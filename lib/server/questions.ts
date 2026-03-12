import type { ExternalQuestion, ExamDetail } from '@/types/external-question';
import type { QuestionDocument, QuestionWithId } from '@/types/question';
import { getDb } from '@/lib/server/db';
import { ExamNotFoundError } from '@/lib/server/exams';
import { ExplanationSourceZ } from '@/lib/validation';
import type { ExplanationSource, ExplanationVersion } from '@/types/explanation';

// ---------------------------------------------------------------------------
// DB row shape (snake_case columns from quiz.questions)
// ---------------------------------------------------------------------------

type QuestionRow = {
  id: string;
  exam_id: string;
  question: string;
  options: QuestionDocument['options'];
  answer: QuestionDocument['answer'];
  question_type: 'single' | 'multiple' | null;
  explanation: string | null;
  explanation_generated_by_ai: boolean | null;
  explanation_sources: ExplanationSource[] | null;
  explanation_history: ExplanationVersion[] | null;
  study: ExternalQuestion['study'] | null;
  competency_ids: string[] | null;
  flagged_for_review: boolean | null;
  flagged_reason: string | null;
  flagged_at: string | null;
  flagged_by: string | null;
  created_at: string;
  updated_at: string;
};

type ExamRow = {
  id: string;
  exam_id: string;
  exam_title: string;
  welcome_config: ExamDetail['welcomeConfig'] | null;
  document_groups: string[] | null;
  updated_at: string | null;
};

// ---------------------------------------------------------------------------
// Column selection (omit heavyweight vector columns)
// ---------------------------------------------------------------------------

const QUESTION_COLUMNS = [
  'id',
  'exam_id',
  'question',
  'options',
  'answer',
  'question_type',
  'explanation',
  'explanation_generated_by_ai',
  'explanation_sources',
  'explanation_history',
  'study',
  'competency_ids',
  'flagged_for_review',
  'flagged_reason',
  'flagged_at',
  'flagged_by',
  'created_at',
  'updated_at',
].join(', ');

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function mapRowToQuestionDocument(row: QuestionRow): QuestionDocument & { id: string } {
  return {
    id: row.id,
    examId: row.exam_id,
    question: row.question,
    options: row.options,
    answer: row.answer,
    question_type: row.question_type ?? undefined,
    explanation: row.explanation ?? undefined,
    explanationGeneratedByAI: row.explanation_generated_by_ai ?? undefined,
    explanationSources: row.explanation_sources ?? undefined,
    explanationHistory: row.explanation_history ?? undefined,
    study: row.study ?? undefined,
    competencyIds: row.competency_ids ?? undefined,
    flaggedForReview: row.flagged_for_review ?? undefined,
    flaggedReason: row.flagged_reason ?? undefined,
    flaggedAt: row.flagged_at ? new Date(row.flagged_at) : undefined,
    flaggedBy: row.flagged_by ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function sanitizeStudy(value: unknown): ExternalQuestion['study'] | undefined {
  return Array.isArray(value) ? (value as ExternalQuestion['study']) : undefined;
}

function mapQuestionDocToExternal(q: QuestionDocument & { id: string }): ExternalQuestion & { id: string } {
  const { id, question, options, answer, question_type, explanation, explanationGeneratedByAI, study } = q;
  const rawSources = (q as unknown as { explanationSources?: unknown }).explanationSources;
  const parsedSources = Array.isArray(rawSources)
    ? rawSources
        .map((s) => ExplanationSourceZ.safeParse(s))
        .filter((r): r is { success: true; data: ExplanationSource } => r.success)
        .map((r) => r.data)
    : undefined;
  return {
    id,
    question,
    options,
    answer,
    question_type,
    explanation,
    explanationGeneratedByAI,
    explanationSources: parsedSources,
    study: sanitizeStudy(study as unknown),
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function listQuestionsByExam(examId: string): Promise<QuestionDocument[]> {
  const { data, error } = await getDb()
    .from('questions')
    .select(QUESTION_COLUMNS)
    .eq('exam_id', examId)
    .order('id')
    .returns<QuestionRow[]>();

  if (error) {
    throw new Error(`Failed to list questions for exam "${examId}": ${error.message}`);
  }

  return (data ?? []).map(mapRowToQuestionDocument);
}

// QuestionInsertResult is QuestionDocument & { id: string } — uses UUID string as primary key.
export type QuestionInsertResult = QuestionDocument & { id: string };

export async function addExamQuestions(
  examId: string,
  questions: ExternalQuestion[],
): Promise<QuestionInsertResult[]> {
  // Verify exam exists before inserting questions.
  const { data: examData, error: examError } = await getDb()
    .from('exams')
    .select('exam_id')
    .eq('exam_id', examId)
    .maybeSingle<Pick<ExamRow, 'exam_id'>>();

  if (examError) {
    throw new Error(`Failed to verify exam "${examId}": ${examError.message}`);
  }

  if (!examData) {
    throw new ExamNotFoundError(examId);
  }

  if (questions.length === 0) return [];

  const now = new Date().toISOString();

  const rows = questions.map((q) => ({
    exam_id: examId,
    question: q.question,
    options: q.options,
    answer: q.answer,
    question_type: q.question_type ?? 'single',
    explanation: q.explanation ?? null,
    explanation_generated_by_ai: q.explanationGeneratedByAI ?? null,
    explanation_sources: q.explanationSources ?? null,
    study: q.study ?? null,
    competency_ids: q.competencyIds ?? null,
    flagged_for_review: q.flaggedForReview ?? null,
    flagged_reason: q.flaggedReason ?? null,
    flagged_at: q.flaggedAt ? q.flaggedAt.toISOString() : null,
    flagged_by: q.flaggedBy ?? null,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await getDb()
    .from('questions')
    .insert(rows)
    .select(QUESTION_COLUMNS)
    .returns<QuestionRow[]>();

  if (error) {
    throw new Error(`Failed to insert questions for exam "${examId}": ${error.message}`);
  }

  return (data ?? []).map(mapRowToQuestionDocument);
}

export async function updateQuestion(
  examId: string,
  questionId: string,
  question: QuestionWithId,
): Promise<QuestionWithId | null> {
  console.info('[questions] updateQuestion', { examId, questionId });

  if (!questionId) {
    return null;
  }

  // Build the update payload, mapping camelCase domain fields to snake_case DB columns.
  // Exclude id/createdAt — those must not be overwritten.
  const updatePayload: Record<string, unknown> = {
    exam_id: question.examId,
    question: question.question,
    options: question.options,
    answer: question.answer,
    question_type: question.question_type ?? null,
    explanation: question.explanation ?? null,
    explanation_generated_by_ai: question.explanationGeneratedByAI ?? null,
    explanation_sources: question.explanationSources ?? null,
    explanation_history: question.explanationHistory ?? null,
    study: question.study ?? null,
    competency_ids: question.competencyIds ?? null,
    flagged_for_review: question.flaggedForReview ?? null,
    flagged_reason: question.flaggedReason ?? null,
    flagged_at: question.flaggedAt ? question.flaggedAt.toISOString() : null,
    flagged_by: question.flaggedBy ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getDb()
    .from('questions')
    .update(updatePayload)
    .eq('id', questionId)
    .eq('exam_id', examId)
    .select(QUESTION_COLUMNS)
    .maybeSingle<QuestionRow>();

  if (error) {
    throw new Error(`Failed to update question "${questionId}": ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapRowToQuestionDocument(data);
}

export async function fetchExamDetail(examId: string): Promise<ExamDetail | null> {
  const { data: examData, error: examError } = await getDb()
    .from('exams')
    .select('id, exam_id, exam_title, welcome_config, document_groups, updated_at')
    .eq('exam_id', examId)
    .maybeSingle<ExamRow>();

  if (examError) {
    throw new Error(`Failed to fetch exam "${examId}": ${examError.message}`);
  }

  if (!examData) return null;

  const { data: questionRows, error: questionsError } = await getDb()
    .from('questions')
    .select(QUESTION_COLUMNS)
    .eq('exam_id', examId)
    .order('id')
    .returns<QuestionRow[]>();

  if (questionsError) {
    throw new Error(`Failed to fetch questions for exam "${examId}": ${questionsError.message}`);
  }

  const questions = (questionRows ?? [])
    .map(mapRowToQuestionDocument)
    .map(mapQuestionDocToExternal);

  return {
    examId: examData.exam_id,
    examTitle: examData.exam_title,
    welcomeConfig: examData.welcome_config ?? undefined,
    documentGroups: examData.document_groups ?? undefined,
    questions,
  };
}

export type ExamStats = {
  total: number;
  byType: { single: number; multiple: number };
  byExplanation: { with: number; without: number };
  matrix: {
    single: { with: number; without: number };
    multiple: { with: number; without: number };
  };
};

export async function computeExamStats(examId: string): Promise<ExamStats> {
  // Fetch only the columns needed for stats computation.
  const { data, error } = await getDb()
    .from('questions')
    .select('question_type, explanation')
    .eq('exam_id', examId)
    .returns<Pick<QuestionRow, 'question_type' | 'explanation'>[]>();

  if (error) {
    throw new Error(`Failed to compute stats for exam "${examId}": ${error.message}`);
  }

  let total = 0;
  let single = 0;
  let multiple = 0;
  let singleWith = 0;
  let singleWithout = 0;
  let multipleWith = 0;
  let multipleWithout = 0;

  for (const row of data ?? []) {
    total += 1;
    const hasExplanation = typeof row.explanation === 'string' && row.explanation.trim().length > 0;
    const type = row.question_type;

    if (type === 'single') {
      single += 1;
      if (hasExplanation) singleWith += 1; else singleWithout += 1;
    } else if (type === 'multiple') {
      multiple += 1;
      if (hasExplanation) multipleWith += 1; else multipleWithout += 1;
    }
  }

  return {
    total,
    byType: { single, multiple },
    byExplanation: { with: singleWith + multipleWith, without: singleWithout + multipleWithout },
    matrix: {
      single: { with: singleWith, without: singleWithout },
      multiple: { with: multipleWith, without: multipleWithout },
    },
  };
}

export async function getExamCacheTag(examId: string): Promise<string> {
  const [examResult, questionsResult] = await Promise.all([
    getDb()
      .from('exams')
      .select('updated_at')
      .eq('exam_id', examId)
      .maybeSingle<Pick<ExamRow, 'updated_at'>>(),
    getDb()
      .from('questions')
      .select('updated_at')
      .eq('exam_id', examId)
      .returns<Pick<QuestionRow, 'updated_at'>[]>(),
  ]);

  if (examResult.error) {
    throw new Error(`Failed to fetch exam for cache tag "${examId}": ${examResult.error.message}`);
  }

  if (questionsResult.error) {
    throw new Error(`Failed to fetch questions for cache tag "${examId}": ${questionsResult.error.message}`);
  }

  const examUpdatedAt = examResult.data?.updated_at
    ? new Date(examResult.data.updated_at)
    : new Date(0);

  const questionRows = questionsResult.data ?? [];
  const questionCount = questionRows.length;

  const maxQuestionsUpdatedAt = questionRows.reduce<Date>((max, row) => {
    const ts = new Date(row.updated_at);
    return ts > max ? ts : max;
  }, new Date(0));

  const tag = `W/"v1-ex:${examUpdatedAt.getTime()}-qc:${questionCount}-qu:${maxQuestionsUpdatedAt.getTime()}"`;
  return tag;
}

export async function getQuestionById(
  examId: string,
  questionId: string,
): Promise<(QuestionDocument & { id: string }) | null> {
  if (!questionId) {
    return null;
  }

  const { data, error } = await getDb()
    .from('questions')
    .select(QUESTION_COLUMNS)
    .eq('id', questionId)
    .eq('exam_id', examId)
    .maybeSingle<QuestionRow>();

  if (error) {
    throw new Error(`Failed to fetch question "${questionId}": ${error.message}`);
  }

  if (!data) return null;

  return mapRowToQuestionDocument(data);
}
