import { NextResponse } from 'next/server';
import { envConfig } from '@/lib/env-config';
import { searchSimilarQuestions } from '@/lib/server/questions-search';

type RouteParams = {
  params: Promise<{
    examId: string;
  }>;
};

type SearchBody = {
  query?: string;
  embedding?: number[];
  topK?: number;
};

async function embedQuery(query: string): Promise<number[]> {
  const apiKey = envConfig.openai.apiKey;
  const model = envConfig.openai.embeddingModel;
  const dimensions = envConfig.openai.embeddingDimensions;

  const body: Record<string, unknown> = { model, input: query, dimensions };

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI embeddings error ${resp.status}: ${text}`);
  }
  const json = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? [];
}

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    // Controlled via dev feature flag
    if (!envConfig.features.devFeaturesEnabled) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    let body: SearchBody | null = null;
    try {
      body = (await request.json()) as SearchBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const topK = Math.min(Math.max(Number(body?.topK) || 10, 1), 100);

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
        console.warn(`[search] Missing OPENAI_API_KEY; returning empty results. examId=${examId} topK=${topK}`);
        return NextResponse.json({ examId, topK, count: 0, results: [] }, { headers: { 'Cache-Control': 'no-store' } });
      }
      console.info(`[search] Creating query embedding via OpenAI model=${envConfig.openai.embeddingModel} dims=${envConfig.openai.embeddingDimensions} examId=${examId} topK=${topK}`);
      embedding = await embedQuery(query);
      if (!embedding || embedding.length === 0) {
        console.warn('[search] Received empty embedding from provider.');
      } else {
        console.info(`[search] Embedding created. length=${embedding.length}`);
      }
    }

    // If embedding could not be created, return empty results instead of error
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return NextResponse.json({ examId, topK, count: 0, results: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const results = await searchSimilarQuestions(examId, embedding, topK);
    if (results.length === 0) {
      console.info(`[search] Vector search returned 0 results. examId=${examId} topK=${topK}`);
    } else {
      console.info(`[search] Vector search returned ${results.length} result(s). bestScore=${results[0]?.score?.toFixed?.(4) ?? 'n/a'}`);
    }
    return NextResponse.json({ examId, topK, count: results.length, results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Search failed for exam ${examId}`, error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
