import { NextResponse } from 'next/server';
import { envConfig } from '@/lib/env-config';
import { getDb, getQuestionEmbeddingsCollectionName, getQuestionsCollectionName, getDedupePairsCollectionName } from '@/lib/server/mongodb';
import type { Document } from 'mongodb';
import type { QuestionDocument } from '@/types/question';

type RouteParams = {
  params: Promise<{ examId: string }>;
};

type DedupeBody = {
  topK?: number; // neighbors per item
  threshold?: number; // similarity score threshold (0..1)
  limitPairs?: number; // cap number of returned pairs
};

type Pair = {
  a: QuestionDocument;
  b: QuestionDocument;
  score: number;
};

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    if (!envConfig.features.devFeaturesEnabled) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as DedupeBody;
    const topK = Math.min(Math.max(Number(body?.topK) || 3, 1), 20);
    const threshold = Math.max(0, Math.min(1, Number(body?.threshold) || 0.9));
    const limitPairs = Math.min(Math.max(Number(body?.limitPairs) || 200, 1), 5000);

    const db = await getDb();
    const embCol = db.collection<Document>(getQuestionEmbeddingsCollectionName());
    const qCol = db.collection<QuestionDocument>(getQuestionsCollectionName());

    // Load all embeddings for the exam (id + embedding only)
    const embeddingDocs = await embCol
      .find({ examId }, { projection: { _id: 0, id: 1, examId: 1, embedding: 1 } })
      .toArray();

    // Early exit if nothing to analyze
    if (embeddingDocs.length === 0) {
      return NextResponse.json({ examId, count: 0, pairs: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const indexName = envConfig.mongo.questionEmbeddingsVectorIndex;

    const pairs = new Map<string, { aId: string; bId: string; score: number }>();

    // For each embedding, search nearest neighbors and accumulate high-similarity pairs
    for (const doc of embeddingDocs) {
      const queryEmbedding = (doc as { embedding?: unknown }).embedding as number[] | undefined;
      const qid = (doc as { id?: unknown }).id as string;
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0 || !qid) continue;

      const pipeline: Document[] = [
        {
          $vectorSearch: {
            index: indexName,
            queryVector: queryEmbedding,
            path: 'embedding',
            numCandidates: Math.max(100, topK * 5),
            limit: topK + 1, // include self, filter later
            filter: { examId },
          },
        },
        { $project: { _id: 0, id: 1, examId: 1, score: { $meta: 'vectorSearchScore' } } },
      ];

      const hits = await embCol.aggregate<{ id: string; score: number }>(pipeline).toArray();
      for (const hit of hits) {
        if (!hit || !hit.id || hit.id === qid) continue;
        const score = typeof hit.score === 'number' ? hit.score : 0;
        if (score < threshold) continue;
        const [aId, bId] = [qid, hit.id].sort();
        const key = `${aId}::${bId}`;
        const existing = pairs.get(key);
        if (!existing || score > existing.score) {
          pairs.set(key, { aId, bId, score });
        }
        if (pairs.size >= limitPairs) break;
      }
      if (pairs.size >= limitPairs) break;
    }

    if (pairs.size === 0) {
      return NextResponse.json({ examId, count: 0, pairs: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Filter out pairs that have been explicitly ignored (if flags collection configured)
    try {
      const flagsCol = db.collection<Document>(getDedupePairsCollectionName());
      const ignoreFlags = await flagsCol
        .find({ examId, status: 'ignore' }, { projection: { _id: 0, aId: 1, bId: 1 } })
        .toArray();
      const ignoreSet = new Set(
        ignoreFlags.map((f) => {
          const a = String((f as { aId?: unknown }).aId);
          const b = String((f as { bId?: unknown }).bId);
          return [a, b].sort().join('::');
        })
      );
      for (const key of Array.from(pairs.keys())) {
        if (ignoreSet.has(key)) pairs.delete(key);
      }
    } catch {
      if (envConfig.app.isDevelopment) {
        console.warn('[dedupe] flags collection unavailable; skipping ignore filter');
      }
    }

    // Fetch question docs for the ids involved
    const neededIds = Array.from(pairs.values()).reduce((acc, p) => {
      acc.add(p.aId);
      acc.add(p.bId);
      return acc;
    }, new Set<string>());

    const { ObjectId } = await import('mongodb');
    const objectIds = Array.from(neededIds).filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));

    const questions = await qCol
      .find({ examId, _id: { $in: objectIds } })
      .toArray();
    const byId = new Map<string, QuestionDocument & { id: string }>();
    for (const q of questions) byId.set(q._id.toString(), { ...q, id: q._id.toString() });

    const resultPairs: Pair[] = [];
    for (const { aId, bId, score } of pairs.values()) {
      const a = byId.get(aId);
      const b = byId.get(bId);
      if (a && b) resultPairs.push({ a, b, score });
      if (resultPairs.length >= limitPairs) break;
    }

    // Sort by score desc
    resultPairs.sort((x, y) => y.score - x.score);

    return NextResponse.json(
      { examId, count: resultPairs.length, pairs: resultPairs },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error(`Dedupe preview failed for exam ${examId}`, error);
    return NextResponse.json({ error: 'Dedupe preview failed' }, { status: 500 });
  }
}
