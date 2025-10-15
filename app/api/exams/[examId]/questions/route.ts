import { NextResponse } from 'next/server';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import type { QuestionDocument } from '@/types/question';
import type { WithId } from 'mongodb';
import { fetchCompetenciesByExamId } from '@/lib/server/competencies';
import type { ExplanationSource } from '@/types/explanation';
import { ExplanationSourceZ } from '@/lib/validation';

type RouteParams = { params: Promise<{ examId: string }> };

export async function GET(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const examId = params.examId;
    const { searchParams } = new URL(request.url);
    const competencyId = searchParams.get('competencyId');
    const idsParam = searchParams.get('ids');
    const flaggedOnly = searchParams.get('flaggedOnly') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    // Optional output format when querying by specific ids; default remains flat array
    const format = (searchParams.get('format') || '').toLowerCase(); // 'flat' | 'object'

    // Validate pagination params
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit)); // Max 100 items per page
    const skip = (validPage - 1) * validLimit;

    const db = await getDb();
    const col = db.collection<QuestionDocument>(getQuestionsCollectionName());

    const filter: Record<string, unknown> = { examId };

    // Filter by specific question IDs if provided
    let parsedIds: string[] | null = null;
    if (idsParam) {
      try {
        parsedIds = JSON.parse(decodeURIComponent(idsParam)) as string[];
        const { ObjectId } = await import('mongodb');
        filter._id = { $in: parsedIds.map(id => new ObjectId(id)) };
      } catch (e) {
        console.error('Failed to parse ids parameter:', e);
      }
    }

    if (competencyId) {
      filter.competencyIds = competencyId;
    }

    if (flaggedOnly) {
      filter.flaggedForReview = true;
    }

    // Build projection once for reuse
    const projection = {
      _id: 1,
      examId: 1,
      question: 1,
      options: 1,
      answer: 1,
      question_type: 1,
      explanation: 1,
      explanationGeneratedByAI: 1,
      explanationSources: 1,
      competencyIds: 1,
      createdAt: 1,
      updatedAt: 1,
      flaggedForReview: 1,
      flaggedReason: 1,
      flaggedAt: 1,
      flaggedBy: 1,
    } as const;

    let docs: WithId<QuestionDocument>[];
    let total = 0;

    if (parsedIds && parsedIds.length > 0) {
      // When fetching by specific IDs, return all matches without pagination
      docs = await col
        .find(filter, { projection })
        .toArray();
    } else {
      // Paginated fetch for general queries
      total = await col.countDocuments(filter);
      docs = await col
        .find(filter, { projection })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit)
        .toArray();
    }

    // Fetch competencies for this exam to populate on questions
    const competencies = await fetchCompetenciesByExamId(examId);
    const competencyMap = new Map(competencies.map(c => [c.id, { id: c.id, title: c.title }]));

    // Map _id to id for API response and populate competencies
    const questions = docs.map(doc => ({
      id: doc._id.toString(),
      examId: doc.examId,
      question: doc.question,
      options: doc.options,
      answer: doc.answer,
      question_type: doc.question_type,
      explanation: doc.explanation,
      explanationGeneratedByAI: doc.explanationGeneratedByAI,
      explanationSources: (Array.isArray((doc as unknown as { explanationSources?: unknown }).explanationSources)
        ? ((doc as unknown as { explanationSources?: unknown[] }).explanationSources as unknown[])
            .map((s) => ExplanationSourceZ.safeParse(s))
            .filter((r): r is { success: true; data: ExplanationSource } => r.success)
            .map((r) => r.data)
        : undefined) as ExplanationSource[] | undefined,
      competencyIds: doc.competencyIds,
      competencies: doc.competencyIds
        ?.map(cid => competencyMap.get(cid))
        .filter((c): c is { id: string; title: string } => c !== undefined),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      flaggedForReview: doc.flaggedForReview,
      flaggedReason: doc.flaggedReason,
      flaggedAt: doc.flaggedAt,
      flaggedBy: doc.flaggedBy,
    }));

    // When fetching specific IDs, return questions directly without pagination
    if (parsedIds) {
      if (format === 'object') {
        // Wrap in a normalized object shape when requested explicitly
        return NextResponse.json(
          {
            questions,
            pagination: {
              page: 1,
              limit: questions.length,
              total: questions.length,
              totalPages: 1,
            },
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }
      // Default: flat array for specific ids (backward compatible)
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
