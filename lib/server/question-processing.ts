/**
 * Question Processing - Embeddings and Competency Assignment
 *
 * Reusable functions for post-import processing that can be called from:
 * - API endpoints (UI-driven)
 * - CLI scripts (bulk operations)
 *
 * Migrated from MongoDB to Supabase. Questions and their embeddings are stored
 * in the quiz.questions table (embedding column). IDs are UUIDs.
 */
import { getDb } from './db';
import { envConfig } from '../env-config';
import { searchSimilarCompetencies, assignCompetenciesToQuestion } from './competency-assignment';
import { createEmbeddings as createEmbeddingsLLM } from '@/lib/llm-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuestionRow = {
  id: string;
  exam_id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: string | string[];
  explanation?: string | null;
  competency_ids?: string[] | null;
  embedding?: number[] | null;
};

export type EmbeddingResult = {
  questionId: string;
  success: boolean;
  error?: string;
};

export type CompetencyAssignmentResult = {
  questionId: string;
  success: boolean;
  competencyIds: string[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build text for embedding from a question row
 */
function buildTextForEmbedding(q: QuestionRow): string {
  const opts = q.options;
  const choices =
    `A) ${opts.A}\nB) ${opts.B}\nC) ${opts.C}\nD) ${opts.D}` +
    (opts.E ? `\nE) ${opts.E}` : '');
  const answer = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
  const explanation = q.explanation ? `\nExplanation: ${q.explanation}` : '';
  return `Question: ${q.question}\nOptions:\n${choices}\nAnswer: ${answer}${explanation}`;
}

/**
 * Call embeddings API (routes to Portkey or OpenAI based on feature flag)
 */
async function createEmbeddings(
  inputs: string[],
  model: string,
  dimensions?: number
): Promise<number[][]> {
  return createEmbeddingsLLM(inputs, { model, dimensions });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Generate embeddings for specific questions by their Supabase UUID
 * @param questionIds - Array of UUID strings
 * @param options - Optional batch size and model settings
 * @returns Results array with success/error for each question
 */
export async function generateEmbeddingsForQuestions(
  questionIds: string[],
  options?: {
    batchSize?: number;
    model?: string;
    dimensions?: number;
  }
): Promise<EmbeddingResult[]> {
  const batchSize = options?.batchSize ?? 16;
  const model = options?.model ?? envConfig.openai.embeddingModel;
  const dimensions = options?.dimensions ?? envConfig.openai.embeddingDimensions;

  if (questionIds.length === 0) {
    return [];
  }

  // Fetch questions from Supabase
  const { data: questions, error: fetchError } = await getDb()
    .from('questions')
    .select('id, exam_id, question, options, answer, explanation')
    .in('id', questionIds)
    .returns<QuestionRow[]>();

  if (fetchError) {
    throw new Error(`Failed to fetch questions for embedding: ${fetchError.message}`);
  }

  if (!questions || questions.length === 0) {
    return [];
  }

  const results: EmbeddingResult[] = [];

  // Process in batches
  for (let i = 0; i < questions.length; i += batchSize) {
    const batchDocs = questions.slice(i, i + batchSize);
    const inputs = batchDocs.map(buildTextForEmbedding);

    try {
      const embeddings = await createEmbeddings(inputs, model, dimensions);
      const now = new Date().toISOString();

      // Write embeddings back to quiz.questions
      const updateOps = batchDocs.map((doc, idx) =>
        getDb()
          .from('questions')
          .update({
            embedding: embeddings[idx],
            embedding_model: model,
            embedding_updated_at: now,
          })
          .eq('id', doc.id)
      );

      await Promise.all(updateOps);

      for (const doc of batchDocs) {
        results.push({ questionId: doc.id, success: true });
      }
    } catch (error) {
      for (const doc of batchDocs) {
        results.push({
          questionId: doc.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return results;
}

/**
 * Auto-assign competencies to questions using vector similarity.
 * Requires that questions already have embeddings stored in quiz.questions.embedding.
 *
 * @param examId - Exam ID to scope the competencies
 * @param questionIds - Array of UUID strings
 * @param options - Similarity threshold and top N matches
 * @returns Results array with assigned competency IDs for each question
 */
export async function assignCompetenciesToQuestions(
  examId: string,
  questionIds: string[],
  options?: {
    topN?: number;
    threshold?: number;
    overwrite?: boolean;
  }
): Promise<CompetencyAssignmentResult[]> {
  const topN = options?.topN ?? 1;
  const threshold = options?.threshold ?? 0.5;
  const overwrite = options?.overwrite ?? false;

  if (questionIds.length === 0) {
    return [];
  }

  // Fetch questions (including their stored embeddings and existing competency_ids)
  const { data: questions, error: fetchError } = await getDb()
    .from('questions')
    .select('id, exam_id, competency_ids, embedding')
    .in('id', questionIds)
    .eq('exam_id', examId)
    .returns<QuestionRow[]>();

  if (fetchError) {
    throw new Error(`Failed to fetch questions for competency assignment: ${fetchError.message}`);
  }

  if (!questions || questions.length === 0) {
    return [];
  }

  const results: CompetencyAssignmentResult[] = [];

  for (const question of questions) {
    try {
      // Skip if already has competencies and not overwriting
      if (
        !overwrite &&
        Array.isArray(question.competency_ids) &&
        question.competency_ids.length > 0
      ) {
        results.push({
          questionId: question.id,
          success: true,
          competencyIds: question.competency_ids,
        });
        continue;
      }

      // Require a stored embedding
      if (!Array.isArray(question.embedding) || question.embedding.length === 0) {
        results.push({
          questionId: question.id,
          success: false,
          competencyIds: [],
          error: 'No embedding found for question — run generateEmbeddingsForQuestions first',
        });
        continue;
      }

      // Search for similar competencies using the stored embedding
      const similarCompetencies = await searchSimilarCompetencies(
        question.embedding,
        examId,
        topN
      );

      // Filter by threshold
      const competencyIds = similarCompetencies
        .filter((c) => c.score >= threshold)
        .map((c) => c.competency.id);

      if (competencyIds.length === 0) {
        results.push({
          questionId: question.id,
          success: false,
          competencyIds: [],
          error: `No competencies above threshold ${threshold}`,
        });
        continue;
      }

      // Persist assignment to quiz.questions.competency_ids
      await assignCompetenciesToQuestion(question.id, examId, competencyIds);

      results.push({
        questionId: question.id,
        success: true,
        competencyIds,
      });
    } catch (error) {
      results.push({
        questionId: question.id,
        success: false,
        competencyIds: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
