import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import { requireAdmin } from '@/lib/auth-supabase';
import type { ExplanationVersion } from '@/types/explanation';

type RouteParams = {
  params: Promise<{
    examId: string;
    questionId: string;
  }>;
};

export async function GET(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  let questionId = 'unknown';

  try {
    try {
      await requireAdmin();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const params = await context.params;
    examId = params.examId;
    questionId = params.questionId;

    if (!ObjectId.isValid(questionId)) {
      return NextResponse.json({ error: 'Invalid question ID format' }, { status: 400 });
    }

    const db = await getDb();
    const qCol = db.collection(getQuestionsCollectionName());
    const doc = await qCol.findOne(
      { _id: new ObjectId(questionId), examId },
      { projection: { _id: 0, explanationHistory: 1 } }
    );

    const versions = (doc?.explanationHistory || []) as ExplanationVersion[];

    return NextResponse.json({ versions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`[explanation/history] Failed examId=${examId} questionId=${questionId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
