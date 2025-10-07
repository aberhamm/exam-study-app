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
    const idsParam = searchParams.get('ids');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate pagination params
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit)); // Max 100 items per page
    const skip = (validPage - 1) * validLimit;

    const db = await getDb();
    const col = db.collection<QuestionDocument>(getQuestionsCollectionName());

    const filter: Record<string, unknown> = { examId };

    // Filter by specific question IDs if provided
    if (idsParam) {
      try {
        const ids = JSON.parse(decodeURIComponent(idsParam)) as string[];
        const { ObjectId } = await import('mongodb');
        filter._id = { $in: ids.map(id => new ObjectId(id)) };
      } catch (e) {
        console.error('Failed to parse ids parameter:', e);
      }
    }

    if (competencyId) {
      filter.competencyIds = competencyId;
    }

    // Get total count for pagination metadata
    const total = await col.countDocuments(filter);

    const docs = await col
      .find(filter, {
        projection: {
          _id: 1,
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
      .skip(skip)
      .limit(validLimit)
      .toArray();

    // Map _id to id for API response
    const questions = docs.map(doc => ({
      id: doc._id.toString(),
      examId: doc.examId,
      question: doc.question,
      options: doc.options,
      answer: doc.answer,
      question_type: doc.question_type,
      explanation: doc.explanation,
      explanationGeneratedByAI: doc.explanationGeneratedByAI,
      competencyIds: doc.competencyIds,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    // When fetching specific IDs, return questions directly without pagination
    if (idsParam) {
      return NextResponse.json(questions, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Otherwise return with pagination metadata
    return NextResponse.json(
      {
        questions,
        pagination: {
          page: validPage,
          limit: validLimit,
          total,
          totalPages: Math.ceil(total / validLimit),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Failed to fetch questions:', error);
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
  }
}
