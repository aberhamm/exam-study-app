import { createClient } from '@supabase/supabase-js';
import { envConfig } from '@/lib/env-config';
import type { QuestionDocument } from '@/types/question';

export type SimilarQuestion = {
  question: QuestionDocument;
  score: number;
};

/**
 * Returns a Supabase admin client suitable for RPC calls.
 * RPC calls must go through the base client, not a schema-scoped client,
 * so we cannot reuse getDb() from @/lib/server/db here.
 *
 * We reuse the same global singleton that db.ts creates so that only one
 * underlying client instance exists per process.
 */
const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseAdminClient?: ReturnType<typeof createClient>;
};

function getAdminClientForRpc() {
  if (!globalForSupabase.__supabaseAdminClient) {
    globalForSupabase.__supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return globalForSupabase.__supabaseAdminClient;
}

/**
 * Maps a raw DB row (snake_case) returned by the search_quiz_questions RPC
 * to a QuestionDocument (camelCase). The `embedding` field is intentionally
 * excluded from the returned document to avoid bloating the response.
 */
function mapRowToQuestion(row: Record<string, unknown>): QuestionDocument {
  return {
    // Core identity
    examId: row.exam_id as string,

    // Question content
    question: row.question as string,
    options: row.options as QuestionDocument['options'],
    answer: row.answer as QuestionDocument['answer'],
    question_type: row.question_type as QuestionDocument['question_type'],
    explanation: row.explanation as string | undefined,

    // AI-generated explanation metadata
    explanationGeneratedByAI: row.explanation_generated_by_ai as boolean | undefined,
    explanationSources: row.explanation_sources as QuestionDocument['explanationSources'],
    explanationHistory: row.explanation_history as QuestionDocument['explanationHistory'],

    // Study links and competencies
    study: row.study as QuestionDocument['study'],
    competencyIds: row.competency_ids as string[] | undefined,

    // Flagging
    flaggedForReview: row.flagged_for_review as boolean | undefined,
    flaggedReason: row.flagged_reason as string | undefined,
    flaggedAt: row.flagged_at != null ? new Date(row.flagged_at as string) : undefined,
    flaggedBy: row.flagged_by as string | undefined,

    // Embedding metadata (value excluded, model and timestamp kept)
    embeddingModel: row.embedding_model as string | undefined,
    embeddingUpdatedAt:
      row.embedding_updated_at != null
        ? new Date(row.embedding_updated_at as string)
        : undefined,

    // Timestamps
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function searchSimilarQuestions(
  examId: string,
  queryEmbedding: number[],
  topK: number = 10
): Promise<SimilarQuestion[]> {
  const supabaseAdmin = getAdminClientForRpc();

  try {
    if (envConfig.app.isDevelopment) {
      console.info(`[vectorSearch] rpc=search_quiz_questions examId=${examId} topK=${topK}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any).rpc('search_quiz_questions', {
      p_exam_id: examId,
      p_embedding: queryEmbedding,
      p_top_k: topK,
    });

    if (error) {
      throw error;
    }

    if (!data || (data as unknown[]).length === 0) {
      if (envConfig.app.isDevelopment) {
        console.warn('[vectorSearch] No results from RPC search');
      }
      return [];
    }

    const rows = data as Array<Record<string, unknown>>;
    const results: SimilarQuestion[] = rows.map(row => ({
      question: mapRowToQuestion(row),
      score: row.score as number,
    }));

    if (envConfig.app.isDevelopment && results.length > 0) {
      console.info(
        `[vectorSearch] Retrieved ${results.length} results, best score: ${results[0]?.score.toFixed(4)}`
      );
    }

    return results;
  } catch (error) {
    console.warn(
      `[vectorSearch] Failed; returning empty results. examId=${examId} topK=${topK}`,
      error
    );
    return [];
  }
}
