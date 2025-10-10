import { NextResponse } from 'next/server';
import { isDevFeaturesEnabled } from '@/lib/feature-flags';
import { getDb, getDedupePairsCollectionName } from '@/lib/server/mongodb';

type RouteParams = {
  params: Promise<{ examId: string }>;
};

type FlagStatus = 'ignore' | 'review';

type UpsertBody = {
  aId?: string;
  bId?: string;
  status?: FlagStatus | 'clear';
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
    const col = db.collection(getDedupePairsCollectionName());
    const flags = await col
      .find({ examId }, { projection: { _id: 0, examId: 1, aId: 1, bId: 1, status: 1, updatedAt: 1 } })
      .toArray();
    return NextResponse.json({ examId, count: flags.length, flags }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to list flags for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to list flags' }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;
    if (!isDevFeaturesEnabled()) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    let body: UpsertBody | null = null;
    try {
      body = (await request.json()) as UpsertBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const aId = typeof body?.aId === 'string' ? body!.aId : '';
    const bId = typeof body?.bId === 'string' ? body!.bId : '';
    const status = body?.status;
    if (!aId || !bId || !status) {
      return NextResponse.json({ error: 'aId, bId, and status are required' }, { status: 400 });
    }

    const aFirst = [aId, bId].sort()[0]!;
    const bSecond = [aId, bId].sort()[1]!;

    const db = await getDb();
    const col = db.collection(getDedupePairsCollectionName());

    if (status === 'clear') {
      await col.deleteOne({ examId, aId: aFirst, bId: bSecond });
      return NextResponse.json({ examId, aId: aFirst, bId: bSecond, status: 'cleared' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const now = new Date();
    await col.updateOne(
      { examId, aId: aFirst, bId: bSecond },
      { $set: { examId, aId: aFirst, bId: bSecond, status, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    return NextResponse.json({ examId, aId: aFirst, bId: bSecond, status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to upsert flag for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to update flag' }, { status: 500 });
  }
}

