import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import type { QuestionDocument } from '@/types/question';
import { normalizeQuestions } from '@/lib/normalize';
import type { ExternalQuestion } from '@/types/external-question';
import { envConfig } from '@/lib/env-config';

const StartRequestZ = z.object({
  questionType: z.enum(['all', 'single', 'multiple']).default('all'),
  explanationFilter: z.enum(['all', 'with-explanations', 'without-explanations']).default('all'),
  questionCount: z.number().int().min(1).max(1000).default(50),
  competencyFilter: z.string().optional(),
});

type RouteParams = { params: Promise<{ examId: string }> };

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    const json = await request.json().catch(() => ({}));
    const input = StartRequestZ.parse(json);

    const db = await getDb();
    const col = db.collection<QuestionDocument>(getQuestionsCollectionName());

    const match: Record<string, unknown> = { examId };
    if (input.questionType === 'single') match.question_type = 'single';
    if (input.questionType === 'multiple') match.question_type = 'multiple';

    const explanationExpr = (() => {
      return {
        $gt: [
          {
            $strLenCP: {
              $trim: { input: { $ifNull: ['$explanation', ''] } },
            },
          },
          0,
        ],
      } as const;
    })();

    const pipeline: object[] = [
      { $match: match },
    ];

    if (input.explanationFilter === 'with-explanations') {
      pipeline.push({ $match: { $expr: explanationExpr } });
    } else if (input.explanationFilter === 'without-explanations') {
      pipeline.push({ $match: { $expr: { $not: explanationExpr } } });
    }

    // Filter by competency if specified
    if (input.competencyFilter && input.competencyFilter !== 'all') {
      pipeline.push({ $match: { competencyIds: input.competencyFilter } });
    }

    // Random sample to avoid shipping all questions to the client
    pipeline.push({ $sample: { size: input.questionCount } });

    // Lookup competencies to embed minimal data in questions
    pipeline.push({
      $lookup: {
        from: envConfig.mongo.examCompetenciesCollection,
        let: { questionCompetencyIds: '$competencyIds' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$id', { $ifNull: ['$$questionCompetencyIds', []] }],
              },
            },
          },
          {
            $project: {
              _id: 0,
              id: 1,
              title: 1,
            },
          },
        ],
        as: 'competencies',
      },
    });

    pipeline.push({
      $project: {
        _id: 1,
        examId: 1,
        question: 1,
        options: 1,
        answer: 1,
        question_type: 1,
        explanation: 1,
        explanationGeneratedByAI: 1,
        study: 1,
        competencyIds: 1,
        competencies: 1,
      },
    });

    const docs = await col.aggregate(pipeline).toArray();
    const external: ExternalQuestion[] = docs.map((d) => ({
      id: d._id.toString(),
      question: d.question,
      options: d.options,
      answer: d.answer,
      question_type: (d.question_type as 'single' | 'multiple' | undefined) ?? 'single',
      explanation: d.explanation,
      explanationGeneratedByAI: d.explanationGeneratedByAI,
      study: d.study,
      competencyIds: d.competencyIds,
      competencies: d.competencies,
    }));
    const normalized = normalizeQuestions(external);

    return NextResponse.json({ examId, count: normalized.length, questions: normalized }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to prepare questions for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to prepare questions' }, { status: 500 });
  }
}
