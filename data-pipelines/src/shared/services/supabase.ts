import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { EmbeddingChunkDocument } from '../types/embedding.js';

const BATCH_SIZE = 100;
const SCHEMA = 'quiz';
const TABLE = 'document_chunks';

export class SupabaseService {
  private client: SupabaseClient;

  constructor(private url: string, private serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  /** No-op — Supabase client is stateless. */
  async connect(): Promise<void> {
    // no-op
  }

  /** No-op — Supabase client is stateless. */
  async disconnect(): Promise<void> {
    // no-op
  }

  async bulkUpsertEmbeddingChunks(
    docs: EmbeddingChunkDocument[]
  ): Promise<{ matched: number; modified: number; upserted: number }> {
    if (!docs.length) {
      return { matched: 0, modified: 0, upserted: 0 };
    }

    // Deduplicate by chunk_id within the full set before batching.
    // Supabase throws "ON CONFLICT DO UPDATE command cannot affect row a second time"
    // if a single upsert batch contains duplicate conflict keys.
    const seen = new Set<string>();
    const uniqueDocs = docs.filter((doc) => {
      const key = doc.chunkContentHash;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let totalUpserted = 0;

    for (let i = 0; i < uniqueDocs.length; i += BATCH_SIZE) {
      const batch = uniqueDocs.slice(i, i + BATCH_SIZE);

      const rows = batch.map((doc) => ({
        chunk_id: doc.chunkContentHash,
        source_file: doc.sourceFile,
        source_basename: doc.sourceBasename ?? null,
        group_id: doc.groupId ?? null,
        title: doc.title ?? null,
        description: doc.description ?? null,
        url: doc.url ?? null,
        tags: doc.tags ?? null,
        text: doc.text,
        section_path: doc.sectionPath ?? null,
        nearest_heading: doc.nearestHeading ?? null,
        chunk_index: doc.chunkIndex,
        chunk_total: doc.chunkTotal,
        start_index: doc.startIndex,
        end_index: doc.endIndex,
        model: doc.model,
        dimensions: doc.dimensions,
        content_hash: doc.contentHash ?? null,
        source_meta: doc.sourceMeta ?? null,
        embedding: doc.embedding,
        updated_at: new Date().toISOString(),
      }));

      const { error, count } = await this.client
        .schema(SCHEMA)
        .from(TABLE)
        .upsert(rows, { onConflict: 'chunk_id', ignoreDuplicates: false })
        .select('id', { count: 'exact', head: true });

      if (error) {
        throw new Error(
          `Supabase upsert failed (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`
        );
      }

      totalUpserted += count ?? batch.length;
    }

    return { matched: 0, modified: totalUpserted, upserted: totalUpserted };
  }
}

export function createSupabaseService(url: string, serviceRoleKey: string): SupabaseService {
  return new SupabaseService(url, serviceRoleKey);
}
