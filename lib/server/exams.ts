import type { ExamDetail } from '@/types/external-question';
import type { ExamSummary } from '@/types/api';
import { getDb } from './db';

// Row shape returned from quiz.exams (snake_case DB columns)
type ExamRow = {
  id: string;
  exam_id: string;
  exam_title: string;
  welcome_config: ExamDetail['welcomeConfig'] | null;
  document_groups: string[] | null;
};

function mapExamRow(row: ExamRow): ExamDetail {
  return {
    examId: row.exam_id,
    examTitle: row.exam_title,
    welcomeConfig: row.welcome_config ?? undefined,
    documentGroups: row.document_groups ?? undefined,
    // Questions are managed separately and are not stored on the exams table.
    questions: [],
  };
}

export async function fetchExamById(examId: string): Promise<ExamDetail | null> {
  const { data, error } = await getDb()
    .from('exams')
    .select('*')
    .eq('exam_id', examId)
    .maybeSingle<ExamRow>();

  if (error) {
    throw new Error(`Failed to fetch exam "${examId}": ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapExamRow(data);
}

export async function listExamSummaries(): Promise<ExamSummary[]> {
  const { data, error } = await getDb()
    .from('exams')
    .select('exam_id, exam_title')
    .order('exam_id')
    .returns<Pick<ExamRow, 'exam_id' | 'exam_title'>[]>();

  if (error) {
    throw new Error(`Failed to list exams: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    examId: row.exam_id,
    examTitle: row.exam_title || row.exam_id,
  }));
}

export type UpdateExamInput = {
  documentGroups?: string[];
  examTitle?: string;
  welcomeConfig?: Partial<NonNullable<ExamDetail['welcomeConfig']>>;
};

export async function updateExam(
  examId: string,
  updates: UpdateExamInput
): Promise<ExamDetail | null> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.documentGroups !== undefined) {
    payload.document_groups = updates.documentGroups.length > 0 ? updates.documentGroups : null;
  }
  if (updates.examTitle !== undefined) {
    payload.exam_title = updates.examTitle;
  }
  if (updates.welcomeConfig !== undefined) {
    // Fetch current config to merge
    const current = await fetchExamById(examId);
    payload.welcome_config = { ...(current?.welcomeConfig ?? {}), ...updates.welcomeConfig };
  }

  const { data, error } = await getDb()
    .from('exams')
    .update(payload)
    .eq('exam_id', examId)
    .select('*')
    .maybeSingle<ExamRow>();

  if (error) throw new Error(`Failed to update exam "${examId}": ${error.message}`);
  if (!data) return null;
  return mapExamRow(data);
}

export class ExamNotFoundError extends Error {
  constructor(examId: string) {
    super(`Exam "${examId}" not found`);
    this.name = 'ExamNotFoundError';
  }
}

export class DuplicateQuestionIdsError extends Error {
  constructor(public readonly duplicates: string[]) {
    super(`Duplicate question ids: ${duplicates.join(', ')}`);
    this.name = 'DuplicateQuestionIdsError';
  }
}
