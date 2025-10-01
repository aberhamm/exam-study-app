import { NextResponse } from 'next/server';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import type { QuestionDocument } from '@/types/question';

type RouteParams = { params: Promise<{ examId: string }> };

export async function GET(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const examId = params.examId;
    const { searchParams } = new URL(request.url);
    const competencyId = searchParams.get('competencyId');

    const db = await getDb();
    const col = db.collection<QuestionDocument>(getQuestionsCollectionName());

    const filter: Record<string, unknown> = { examId };
    if (competencyId) {
      filter.competencyIds = competencyId;
    }

    const questions = await col
      .find(filter, {
        projection: {
          _id: 0,
          id: 1,
          examId: 1,
          question: 1,
          options: 1,
          answer: 1,
          question_type: 1,
          explanation: 1,
          explanationGeneratedByAI: 1,
          competencyIds: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ questions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to fetch questions:', error);
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
  }
}
