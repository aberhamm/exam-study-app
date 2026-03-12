import type { CompetencyDocument } from '@/types/competency';
import { getDb } from '@/lib/server/db';
import { buildCompetencyTextForEmbedding, generateEmbedding } from './embeddings';

// ---------------------------------------------------------------------------
// DB row shape (snake_case columns from quiz.competencies)
// ---------------------------------------------------------------------------

type CompetencyRow = {
  id: string;
  exam_id: string;
  title: string;
  description: string;
  exam_percentage: number;
  embedding: number[] | null;
  embedding_model: string | null;
  embedding_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type QuestionCompetencyRow = {
  competency_ids: string[] | null;
};

// ---------------------------------------------------------------------------
// Column selection (omit heavyweight vector column by default)
// ---------------------------------------------------------------------------

const COMPETENCY_COLUMNS = [
  'id',
  'exam_id',
  'title',
  'description',
  'exam_percentage',
  'embedding_model',
  'embedding_updated_at',
  'created_at',
  'updated_at',
].join(', ');

// ---------------------------------------------------------------------------
// Row → domain mapper
// ---------------------------------------------------------------------------

function mapRowToCompetencyDocument(
  row: CompetencyRow,
  questionCount?: number,
): CompetencyDocument {
  return {
    id: row.id,
    examId: row.exam_id,
    title: row.title,
    description: row.description,
    examPercentage: Number(row.exam_percentage),
    questionCount,
    embedding: row.embedding ?? undefined,
    embeddingModel: row.embedding_model ?? undefined,
    embeddingUpdatedAt: row.embedding_updated_at ? new Date(row.embedding_updated_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a map of competency ID → question count for a given exam by
 * fetching only the `competency_ids` column from `quiz.questions`.
 * This avoids N+1 queries.
 */
async function buildQuestionCountMap(examId: string): Promise<Map<string, number>> {
  const { data, error } = await getDb()
    .from('questions')
    .select('competency_ids')
    .eq('exam_id', examId)
    .returns<QuestionCompetencyRow[]>();

  if (error) {
    throw new Error(`Failed to fetch question competency ids for exam "${examId}": ${error.message}`);
  }

  const countMap = new Map<string, number>();
  for (const row of data ?? []) {
    for (const cid of row.competency_ids ?? []) {
      countMap.set(cid, (countMap.get(cid) ?? 0) + 1);
    }
  }
  return countMap;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export async function fetchCompetenciesByExamId(examId: string): Promise<CompetencyDocument[]> {
  const [competencyResult, countMap] = await Promise.all([
    getDb()
      .from('competencies')
      .select(COMPETENCY_COLUMNS)
      .eq('exam_id', examId)
      .order('title', { ascending: true })
      .returns<CompetencyRow[]>(),
    buildQuestionCountMap(examId),
  ]);

  if (competencyResult.error) {
    throw new Error(
      `Failed to fetch competencies for exam "${examId}": ${competencyResult.error.message}`,
    );
  }

  return (competencyResult.data ?? []).map((row) =>
    mapRowToCompetencyDocument(row, countMap.get(row.id) ?? 0),
  );
}

export async function fetchCompetencyById(
  competencyId: string,
  examId: string,
): Promise<CompetencyDocument | null> {
  const { data, error } = await getDb()
    .from('competencies')
    .select(COMPETENCY_COLUMNS)
    .eq('id', competencyId)
    .eq('exam_id', examId)
    .maybeSingle<CompetencyRow>();

  if (error) {
    throw new Error(`Failed to fetch competency "${competencyId}": ${error.message}`);
  }

  if (!data) return null;

  // Compute questionCount for the single competency
  const countMap = await buildQuestionCountMap(examId);
  return mapRowToCompetencyDocument(data, countMap.get(competencyId) ?? 0);
}

export type CreateCompetencyInput = {
  examId: string;
  title: string;
  description: string;
  examPercentage: number;
};

export async function createCompetency(input: CreateCompetencyInput): Promise<CompetencyDocument> {
  const { data, error } = await getDb()
    .from('competencies')
    .insert({
      exam_id: input.examId,
      title: input.title,
      description: input.description,
      exam_percentage: input.examPercentage,
    })
    .select(COMPETENCY_COLUMNS)
    .single<CompetencyRow>();

  if (error) {
    throw new Error(`Failed to create competency: ${error.message}`);
  }

  // New competencies have no questions assigned yet
  return mapRowToCompetencyDocument(data, 0);
}

export type UpdateCompetencyInput = {
  title?: string;
  description?: string;
  examPercentage?: number;
};

export async function updateCompetency(
  competencyId: string,
  examId: string,
  updates: UpdateCompetencyInput,
): Promise<CompetencyDocument | null> {
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) updatePayload.title = updates.title;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.examPercentage !== undefined) updatePayload.exam_percentage = updates.examPercentage;

  const { data, error } = await getDb()
    .from('competencies')
    .update(updatePayload)
    .eq('id', competencyId)
    .eq('exam_id', examId)
    .select(COMPETENCY_COLUMNS)
    .maybeSingle<CompetencyRow>();

  if (error) {
    throw new Error(`Failed to update competency "${competencyId}": ${error.message}`);
  }

  if (!data) return null;

  // If title or description changed, automatically regenerate the embedding
  if (updates.title !== undefined || updates.description !== undefined) {
    try {
      const embeddingText = buildCompetencyTextForEmbedding({
        title: data.title,
        description: data.description,
      });
      const embeddingData = await generateEmbedding(embeddingText);

      const { error: embedError } = await getDb()
        .from('competencies')
        .update({
          embedding: embeddingData.embedding,
          embedding_model: embeddingData.embeddingModel,
          embedding_updated_at: embeddingData.embeddingUpdatedAt.toISOString(),
        })
        .eq('id', competencyId)
        .eq('exam_id', examId);

      if (embedError) {
        console.error(`Failed to persist embedding for competency "${competencyId}":`, embedError);
      } else {
        // Reflect the new embedding data in the returned document
        data.embedding = embeddingData.embedding;
        data.embedding_model = embeddingData.embeddingModel;
        data.embedding_updated_at = embeddingData.embeddingUpdatedAt.toISOString();
      }
    } catch (embeddingError) {
      // Log embedding error but don't fail the update
      console.error(
        `Failed to regenerate embedding for competency "${competencyId}":`,
        embeddingError,
      );
    }
  }

  const countMap = await buildQuestionCountMap(examId);
  return mapRowToCompetencyDocument(data, countMap.get(competencyId) ?? 0);
}

/**
 * Delete a competency.
 *
 * This function implements cascading cleanup to maintain data integrity:
 * 1. Deletes the competency row.
 * 2. Removes the competency ID from the `competency_ids` array of every
 *    question that references it, using the Postgres `array_remove` function
 *    via a raw RPC query to avoid N+1 updates.
 */
export async function deleteCompetency(competencyId: string, examId: string): Promise<boolean> {
  const { error: deleteError, count } = await getDb()
    .from('competencies')
    .delete({ count: 'exact' })
    .eq('id', competencyId)
    .eq('exam_id', examId);

  if (deleteError) {
    throw new Error(`Failed to delete competency "${competencyId}": ${deleteError.message}`);
  }

  const deleted = (count ?? 0) > 0;

  if (deleted) {
    // Cascading cleanup: remove this competency ID from all questions' competency_ids arrays.
    // We fetch the affected question IDs then update each; this keeps the logic in JS-land
    // without requiring a custom RPC and works correctly with the Supabase client.
    const { data: affectedQuestions, error: fetchError } = await getDb()
      .from('questions')
      .select('id, competency_ids')
      .eq('exam_id', examId)
      .contains('competency_ids', [competencyId])
      .returns<{ id: string; competency_ids: string[] }[]>();

    if (fetchError) {
      console.error(
        `Failed to fetch questions referencing competency "${competencyId}" for cascade cleanup:`,
        fetchError,
      );
    } else if (affectedQuestions && affectedQuestions.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        affectedQuestions.map((q) =>
          getDb()
            .from('questions')
            .update({
              competency_ids: q.competency_ids.filter((id) => id !== competencyId),
              updated_at: now,
            })
            .eq('id', q.id)
            .eq('exam_id', examId),
        ),
      );
    }
  }

  return deleted;
}

export type CompetencyStats = {
  competencyId: string;
  title: string;
  questionCount: number;
  examPercentage: number;
};

/**
 * Aggregate question counts per competency for a given exam.
 *
 * Fetches competencies and question competency_ids in two parallel queries,
 * then counts in JS — avoiding N+1 queries over the competencies list.
 */
export async function getCompetencyAssignmentStats(examId: string): Promise<CompetencyStats[]> {
  const [competencies, countMap] = await Promise.all([
    fetchCompetenciesByExamId(examId),
    buildQuestionCountMap(examId),
  ]);

  return competencies.map((comp) => ({
    competencyId: comp.id,
    title: comp.title,
    questionCount: countMap.get(comp.id) ?? 0,
    examPercentage: comp.examPercentage,
  }));
}

export class CompetencyNotFoundError extends Error {
  constructor(competencyId: string) {
    super(`Competency "${competencyId}" not found`);
    this.name = 'CompetencyNotFoundError';
  }
}
