import { createClient } from '@supabase/supabase-js';
import { getDb } from '@/lib/server/db';
import { envConfig } from '@/lib/env-config';
import type { EmbeddingChunkDocument } from '@/data-pipelines/src/shared/types/embedding';

export type SimilarDocument = {
  document: EmbeddingChunkDocument;
  score: number;
};

// Module-level singleton for the unscoped admin client needed for RPC calls.
// getDb() returns a schema-scoped client which does not support .rpc().
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

// Shape returned by the search_quiz_documents RPC (snake_case columns).
interface DocumentChunkRow {
  id: string;
  chunk_id: string;
  source_file: string;
  source_basename: string | null;
  group_id: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  tags: string[] | null;
  text: string;
  section_path: string | null;
  nearest_heading: string | null;
  chunk_index: number;
  chunk_total: number;
  start_index: number;
  end_index: number;
  model: string;
  dimensions: number;
  content_hash: string | null;
  source_meta: Record<string, unknown> | null;
  embedding: number[];
  score: number;
  // chunk_content_hash is not returned by the RPC; field is required on the type
  // but the RPC omits the raw embedding column too — map what is present.
  chunk_content_hash?: string;
}

function rowToDocument(row: DocumentChunkRow): EmbeddingChunkDocument {
  return {
    embedding: row.embedding,
    text: row.text,
    sourceFile: row.source_file,
    sourceBasename: row.source_basename ?? undefined,
    groupId: row.group_id ?? undefined,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    url: row.url ?? undefined,
    tags: row.tags ?? undefined,
    sectionPath: row.section_path ?? undefined,
    nearestHeading: row.nearest_heading ?? undefined,
    chunkIndex: row.chunk_index,
    chunkTotal: row.chunk_total,
    startIndex: row.start_index,
    endIndex: row.end_index,
    model: row.model,
    dimensions: row.dimensions,
    contentHash: row.content_hash ?? undefined,
    chunkContentHash: row.chunk_content_hash ?? '',
    sourceMeta: row.source_meta ?? undefined,
  };
}

export async function searchSimilarDocuments(
  queryEmbedding: number[],
  topK: number = 10,
  groupIds?: string | string[]
): Promise<SimilarDocument[]> {
  // Normalise groupIds to an array or null for the RPC parameter.
  let groupIdsArray: string[] | null = null;
  if (groupIds) {
    if (typeof groupIds === 'string') {
      groupIdsArray = [groupIds];
    } else if (Array.isArray(groupIds) && groupIds.length > 0) {
      groupIdsArray = groupIds;
    }
  }

  try {
    if (envConfig.app.isDevelopment) {
      console.info(
        `[documentVectorSearch] groupIds=${groupIdsArray ? groupIdsArray.join(',') : 'all'} topK=${topK}`
      );
    }

    const supabaseAdmin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any).rpc('search_quiz_documents', {
      p_embedding: queryEmbedding,
      p_top_k: topK,
      p_group_ids: groupIdsArray,
    });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as DocumentChunkRow[];
    const results: SimilarDocument[] = rows.map((row) => ({
      document: rowToDocument(row),
      score: row.score ?? 0,
    }));

    if (envConfig.app.isDevelopment && results.length > 0) {
      console.info(
        `[documentVectorSearch] Retrieved ${results.length} results, best score: ${results[0]?.score.toFixed(4)}`
      );
    }

    return results;
  } catch (error) {
    console.warn(
      `[documentVectorSearch] Failed or unsupported; returning empty results. groupIds=${Array.isArray(groupIds) ? groupIds.join(',') : groupIds || 'all'} topK=${topK}`,
      error
    );
    return [];
  }
}

export async function getAvailableDocumentGroups(): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getAdminClient() as any).rpc('get_document_group_ids');

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as { group_id: string }[];
    return rows.map((r) => r.group_id);
  } catch (error) {
    console.error('[getAvailableDocumentGroups] Failed to fetch document groups', error);
    return [];
  }
}
