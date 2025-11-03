import { NextResponse } from 'next/server';
import { envConfig } from '@/lib/env-config';
import { searchSimilarDocuments } from '@/lib/server/documents-search';
import { requireAdmin } from '@/lib/auth-supabase';
import { createEmbedding as createEmbeddingLLM } from '@/lib/llm-client';

type SearchBody = {
  query?: string;
  embedding?: number[];
  topK?: number;
  groupId?: string;
};

async function embedQuery(query: string): Promise<number[]> {
  const model = envConfig.openai.embeddingModel;
  const dimensions = envConfig.openai.embeddingDimensions;

  // Use LLM client wrapper (routes to Portkey or OpenAI based on feature flag)
  return createEmbeddingLLM(query, { model, dimensions });
}

export async function POST(request: Request) {
  try {
    // Require admin authentication
    try {
      await requireAdmin();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    let body: SearchBody | null = null;
    try {
      body = (await request.json()) as SearchBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const topK = Math.min(Math.max(Number(body?.topK) || 10, 1), 100);
    const groupId = typeof body?.groupId === 'string' && body.groupId.trim() !== '' ? body.groupId.trim() : undefined;

    let embedding = Array.isArray(body?.embedding)
      ? (body!.embedding as number[])
      : undefined;

    if (!embedding) {
      const query = typeof body?.query === 'string' ? body.query.trim() : '';
      if (!query) {
        return NextResponse.json({ error: 'Provide either query or embedding' }, { status: 400 });
      }
      // If no OpenAI key configured, gracefully return empty results
      try {
        const apiKey = envConfig.openai.apiKey;
        if (!apiKey) {
          throw new Error('API key not available');
        }
      } catch {
        console.warn(`[documentSearch] Missing OPENAI_API_KEY; returning empty results. topK=${topK}`);
        return NextResponse.json({ topK, count: 0, results: [] }, { headers: { 'Cache-Control': 'no-store' } });
      }
      console.info(`[documentSearch] Creating query embedding via OpenAI model=${envConfig.openai.embeddingModel} dims=${envConfig.openai.embeddingDimensions} topK=${topK}`);
      embedding = await embedQuery(query);
      if (!embedding || embedding.length === 0) {
        console.warn('[documentSearch] Received empty embedding from provider.');
      } else {
        console.info(`[documentSearch] Embedding created. length=${embedding.length}`);
      }
    }

    // If embedding could not be created, return empty results instead of error
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return NextResponse.json({ topK, count: 0, results: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const results = await searchSimilarDocuments(embedding, topK, groupId);
    if (results.length === 0) {
      console.info(`[documentSearch] Vector search returned 0 results. topK=${topK} groupId=${groupId || 'all'}`);
    } else {
      console.info(`[documentSearch] Vector search returned ${results.length} result(s). bestScore=${results[0]?.score?.toFixed?.(4) ?? 'n/a'}`);
    }
    return NextResponse.json({ topK, count: results.length, results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Document search failed', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
