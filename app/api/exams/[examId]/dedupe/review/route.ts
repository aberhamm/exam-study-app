import { NextResponse } from 'next/server';
import { isDevFeaturesEnabled } from '@/lib/feature-flags';
import { getDb, getDedupePairsCollectionName, getQuestionsCollectionName } from '@/lib/server/mongodb';
import type { QuestionDocument } from '@/types/question';

type RouteParams = { params: Promise<{ examId: string }> };

type Pair = {
  a: QuestionDocument;
  b: QuestionDocument;
  score: number;
};

export async function GET(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    if (!isDevFeaturesEnabled()) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const db = await getDb();
    const flagsCol = db.collection(getDedupePairsCollectionName());
    const qCol = db.collection<QuestionDocument>(getQuestionsCollectionName());

    const flags = await flagsCol
      .find({ examId, status: 'review' }, { projection: { _id: 0, aId: 1, bId: 1 } })
      .toArray();

    if (flags.length === 0) {
      return NextResponse.json({ examId, count: 0, pairs: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const ids = Array.from(
      flags.reduce((acc, f) => {
        const a = String((f as { aId?: unknown }).aId);
        const b = String((f as { bId?: unknown }).bId);
        if (a) acc.add(a);
        if (b) acc.add(b);
        return acc;
      }, new Set<string>())
    );

    const { ObjectId } = await import('mongodb');
    const objectIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));

    const docs = await qCol
      .find({ examId, _id: { $in: objectIds } })
      .toArray();
    const byId = new Map<string, QuestionDocument & { id: string }>();
    for (const d of docs) byId.set(d._id.toString(), { ...d, id: d._id.toString() });

    const pairs: Pair[] = [];
    for (const f of flags) {
      const aId = String((f as { aId?: unknown }).aId);
      const bId = String((f as { bId?: unknown }).bId);
      const a = byId.get(aId);
      const b = byId.get(bId);
      if (a && b) {
        pairs.push({ a, b, score: 0 });
      }
    }

    return NextResponse.json({ examId, count: pairs.length, pairs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to fetch review pairs for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to fetch review pairs' }, { status: 500 });
  }
}

