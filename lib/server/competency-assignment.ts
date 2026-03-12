import { createClient } from '@supabase/supabase-js';
import { getDb } from '@/lib/server/db';
import { envConfig } from '@/lib/env-config';
import type { CompetencyDocument } from '@/types/competency';

export type SimilarCompetency = {
  competency: CompetencyDocument;
  score: number;
};

// ---------------------------------------------------------------------------
// Admin client for RPC calls (schema-scoped getDb() cannot call rpc())
// ---------------------------------------------------------------------------

let _adminClient: ReturnType<typeof createClient> | undefined;

function getAdminClient() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _adminClient;
}

// ---------------------------------------------------------------------------
// Cosine similarity (used by the JS-side fallback when the RPC is unavailable)
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Column → CompetencyDocument mapper
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCompetency(row: Record<string, any>): CompetencyDocument {
  return {
    id: row.id as string,
    examId: row.exam_id as string,
    title: row.title as string,
    description: row.description as string,
    examPercentage: Number(row.exam_percentage),
    embedding: Array.isArray(row.embedding) ? (row.embedding as number[]) : undefined,
    embeddingModel: row.embedding_model as string | undefined,
    embeddingUpdatedAt: row.embedding_updated_at ? new Date(row.embedding_updated_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    // questionCount is not stored in Supabase; omit it
  };
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Search for competencies whose embeddings are closest to the supplied query
 * vector.
 *
 * Primary path: calls the `search_quiz_competencies` Postgres RPC function.
 * Fallback path: if the RPC returns an error or empty results it fetches all
 * competencies that have embeddings and ranks them in JavaScript using cosine
 * similarity. This is safe because a typical exam has fewer than 20
 * competencies.
 */
export async function searchSimilarCompetencies(
  queryEmbedding: number[],
  examId: string,
  topK: number = 3
): Promise<SimilarCompetency[]> {
  if (envConfig.app.isDevelopment) {
    console.info(
      `[searchSimilarCompetencies] examId=${examId} topK=${topK} embeddingDim=${queryEmbedding.length}`
    );
  }

  // Primary path: Postgres vector search via RPC
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getAdminClient() as any).rpc('search_quiz_competencies', {
      p_exam_id: examId,
      p_embedding: queryEmbedding,
      p_top_k: topK,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (row: Record<string, any>) => ({
          competency: rowToCompetency(row),
          score: Number(row.score),
        })
      );
    }

    if (error) {
      if (envConfig.app.isDevelopment) {
        console.warn(
          `[searchSimilarCompetencies] RPC failed, falling back to JS cosine similarity. examId=${examId}`,
          error
        );
      }
    }
  } catch (rpcError) {
    if (envConfig.app.isDevelopment) {
      console.warn(
        `[searchSimilarCompetencies] RPC threw, falling back to JS cosine similarity. examId=${examId}`,
        rpcError
      );
    }
  }

  // Fallback path: fetch all competencies with embeddings and rank in JS
  try {
    const { data: rows, error: fetchError } = await getDb()
      .from('competencies')
      .select(
        'id, exam_id, title, description, exam_percentage, embedding, embedding_model, embedding_updated_at, created_at, updated_at'
      )
      .eq('exam_id', examId)
      .not('embedding', 'is', null);

    if (fetchError) {
      console.warn(
        `[searchSimilarCompetencies] Fallback fetch failed; returning empty results. examId=${examId}`,
        fetchError
      );
      return [];
    }

    if (!rows || rows.length === 0) {
      if (envConfig.app.isDevelopment) {
        console.info(
          `[searchSimilarCompetencies] No competencies with embeddings found. examId=${examId}`
        );
      }
      return [];
    }

    if (envConfig.app.isDevelopment) {
      console.info(
        `[searchSimilarCompetencies] Fallback: computing cosine similarity over ${rows.length} competencies. examId=${examId}`
      );
    }

    const scored = rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: Record<string, any>) => {
        const embedding = row.embedding as number[] | null;
        const score =
          Array.isArray(embedding) && embedding.length === queryEmbedding.length
            ? cosineSimilarity(queryEmbedding, embedding)
            : -1;
        return { competency: rowToCompetency(row), score };
      })
      .filter(r => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  } catch (error) {
    console.warn(
      `[searchSimilarCompetencies] Fallback threw; returning empty results. examId=${examId}`,
      error
    );
    return [];
  }
}

/**
 * Set the competency assignments for a question, replacing any existing ones.
 *
 * The question is identified by UUID string. The `competency_ids` column on
 * `quiz.questions` is updated directly — no denormalized counters are
 * maintained in Supabase.
 */
export async function assignCompetenciesToQuestion(
  questionId: string,
  examId: string,
  competencyIds: string[]
): Promise<void> {
  if (!questionId) {
    throw new Error('Invalid question ID: must be a non-empty string');
  }

  if (envConfig.app.isDevelopment) {
    console.info(
      `[assignCompetenciesToQuestion] questionId=${questionId} examId=${examId} competencyIds=${competencyIds.join(',')}`
    );
  }

  const { error } = await getDb()
    .from('questions')
    .update({ competency_ids: competencyIds })
    .eq('id', questionId)
    .eq('exam_id', examId);

  if (error) {
    throw new Error(
      `[assignCompetenciesToQuestion] Failed to update question ${questionId}: ${error.message}`
    );
  }
}

/**
 * Remove all competency assignments from a question.
 */
export async function unassignCompetenciesFromQuestion(
  questionId: string,
  examId: string
): Promise<void> {
  if (!questionId) {
    throw new Error('Invalid question ID: must be a non-empty string');
  }

  if (envConfig.app.isDevelopment) {
    console.info(
      `[unassignCompetenciesFromQuestion] questionId=${questionId} examId=${examId}`
    );
  }

  const { error } = await getDb()
    .from('questions')
    .update({ competency_ids: [] })
    .eq('id', questionId)
    .eq('exam_id', examId);

  if (error) {
    throw new Error(
      `[unassignCompetenciesFromQuestion] Failed to clear competencies for question ${questionId}: ${error.message}`
    );
  }
}
