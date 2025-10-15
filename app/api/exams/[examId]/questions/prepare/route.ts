import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ObjectId, type WithId } from 'mongodb';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import type { QuestionDocument } from '@/types/question';
import { normalizeQuestions } from '@/lib/normalize';
import type { ExternalQuestion } from '@/types/external-question';
import { envConfig } from '@/lib/env-config';
import { ExplanationSourceZ } from '@/lib/validation';

// Contract for the prepare endpoint. See inline docs below for sampling behavior.
const StartRequestZ = z.object({
  questionType: z.enum(['all', 'single', 'multiple']).default('all'),
  explanationFilter: z.enum(['all', 'with-explanations', 'without-explanations']).default('all'),
  questionCount: z.number().int().min(1).max(1000).default(50),
  competencyFilter: z.string().optional(),
  excludeQuestionIds: z.array(z.string()).optional(),
  balancedByCompetency: z.boolean().optional().default(false),
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

    // Base match criteria applied to all sampling strategies
    const match: Record<string, unknown> = { examId };
    if (input.questionType === 'single') match.question_type = 'single';
    if (input.questionType === 'multiple') match.question_type = 'multiple';

    // Expression to test existence of a non-empty explanation string
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

    // Exclude specified question IDs (e.g., already seen questions)
    if (input.excludeQuestionIds && input.excludeQuestionIds.length > 0) {
      const excludeObjectIds = input.excludeQuestionIds
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

      if (excludeObjectIds.length > 0) {
        pipeline.push({ $match: { _id: { $nin: excludeObjectIds } } });
      }
    }

    if (input.explanationFilter === 'with-explanations') {
      pipeline.push({ $match: { $expr: explanationExpr } });
    } else if (input.explanationFilter === 'without-explanations') {
      pipeline.push({ $match: { $expr: { $not: explanationExpr } } });
    }

    // Filter by competency if specified
    if (input.competencyFilter && input.competencyFilter !== 'all') {
      pipeline.push({ $match: { competencyIds: input.competencyFilter } });
    }

    // Balanced-by-competency sampling (when requested and not filtering by a specific competency)
    //
    // Strategy:
    // 1) Fetch competency list for the exam.
    // 2) Evenly divide questionCount across competencies (distribute remainder).
    // 3) For each competency, sample 'take' questions with other filters applied.
    // 4) Track a 'seen' set and a global exclude set across rounds to prevent duplicates.
    // 5) If still short, fill from the general pool to reach the requested total.
    const useBalanced = input.balancedByCompetency && (!input.competencyFilter || input.competencyFilter === 'all');
    if (useBalanced) {
      // Fetch competencies for this exam
      const comps = await db
        .collection(envConfig.mongo.examCompetenciesCollection)
        .find({ examId })
        .project({ _id: 0, id: 1, title: 1 })
        .toArray();

      if (comps.length > 0) {
        // Equal distribution across competencies
        const k = comps.length;
        const base = Math.floor(input.questionCount / k);
        let remainder = input.questionCount - base * k;

        const excludeIds = new Set<string>((input.excludeQuestionIds || []).filter(ObjectId.isValid));
        const useRandSort = String(process.env.USE_RAND_SORT_SAMPLING || '').toLowerCase();
        const results: WithId<QuestionDocument>[] = [] as any;
        const seen = new Set<string>();

        for (const comp of comps) {
          let take = base + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          if (take <= 0) continue;

          const compFilter: Record<string, unknown> = { ...match, competencyIds: comp.id };

          const compPipeline: object[] = [{ $match: compFilter }];
          // Exclusions
          if (excludeIds.size > 0) {
            const ids = Array.from(excludeIds).map((id) => new ObjectId(id));
            compPipeline.push({ $match: { _id: { $nin: ids } } });
          }
          if (input.explanationFilter === 'with-explanations') {
            compPipeline.push({ $match: { $expr: explanationExpr } });
          } else if (input.explanationFilter === 'without-explanations') {
            compPipeline.push({ $match: { $expr: { $not: explanationExpr } } });
          }

          if (useRandSort === '1' || useRandSort === 'true' || useRandSort === 'yes' || useRandSort === 'on') {
            compPipeline.push({ $addFields: { _rand: { $rand: {} } } } as object);
            compPipeline.push({ $sort: { _rand: 1 } } as object);
            compPipeline.push({ $limit: take } as object);
          } else {
            compPipeline.push({ $sample: { size: take } } as object);
          }

          const compDocs = await col.aggregate(compPipeline).toArray();
          for (const d of compDocs) {
            const key = (d as any)._id.toString(); // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!seen.has(key)) {
              seen.add(key);
              results.push(d as any); // eslint-disable-line @typescript-eslint/no-explicit-any
              excludeIds.add(key);
            }
          }
        }

        // If we are short (e.g., thin competency buckets), fill from the general pool
        if (results.length < input.questionCount) {
          const remaining = input.questionCount - results.length;
          const fillPipeline: object[] = [{ $match: match }];
          if (excludeIds.size > 0) {
            const ids = Array.from(excludeIds).map((id) => new ObjectId(id));
            fillPipeline.push({ $match: { _id: { $nin: ids } } });
          }
          if (input.explanationFilter === 'with-explanations') {
            fillPipeline.push({ $match: { $expr: explanationExpr } });
          } else if (input.explanationFilter === 'without-explanations') {
            fillPipeline.push({ $match: { $expr: { $not: explanationExpr } } });
          }

          if (useRandSort === '1' || useRandSort === 'true' || useRandSort === 'yes' || useRandSort === 'on') {
            fillPipeline.push({ $addFields: { _rand: { $rand: {} } } } as object);
            fillPipeline.push({ $sort: { _rand: 1 } } as object);
            fillPipeline.push({ $limit: remaining } as object);
          } else {
            fillPipeline.push({ $sample: { size: remaining } } as object);
          }
          const fillDocs = await col.aggregate(fillPipeline).toArray();
          for (const d of fillDocs) {
            const key = (d as any)._id.toString(); // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!seen.has(key)) {
              seen.add(key);
              results.push(d as any); // eslint-disable-line @typescript-eslint/no-explicit-any
            }
          }
        }

        // Now transform results into ExternalQuestion without $lookup (embed minimal competency data)
        const external: ExternalQuestion[] = results.map((d) => ({
          id: (d as any)._id.toString(), // eslint-disable-line @typescript-eslint/no-explicit-any
          question: d.question,
          options: d.options,
          answer: d.answer,
          question_type: (d.question_type as 'single' | 'multiple' | undefined) ?? 'single',
          explanation: d.explanation,
          explanationGeneratedByAI: d.explanationGeneratedByAI,
          explanationSources: (Array.isArray((d as unknown as { explanationSources?: unknown }).explanationSources)
            ? ((d as unknown as { explanationSources?: unknown[] }).explanationSources as unknown[])
                .map((s) => ExplanationSourceZ.safeParse(s))
                .filter((r): r is { success: true; data: ExternalQuestion['explanationSources'][number] } => r.success)
                .map((r) => r.data)
            : undefined) as ExternalQuestion['explanationSources'],
          study: d.study,
          competencyIds: d.competencyIds,
          competencies: (Array.isArray(d.competencyIds)
            ? d.competencyIds
                .map((cid: string) => comps.find((c) => c.id === cid))
                .filter((c): c is { id: string; title: string } => !!c)
                .map((c) => ({ id: c.id, title: c.title }))
            : undefined) as any,
        }));
        // Normalize to the client-friendly question shape
        const normalized = normalizeQuestions(external);
        return NextResponse.json({ examId, count: normalized.length, questions: normalized }, { headers: { 'Cache-Control': 'no-store' } });
      }
      // If no competencies found, fall through to default behavior below
    }

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
        explanationSources: 1,
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
      explanationSources: (Array.isArray((d as unknown as { explanationSources?: unknown }).explanationSources)
        ? ((d as unknown as { explanationSources?: unknown[] }).explanationSources as unknown[])
            .map((s) => ExplanationSourceZ.safeParse(s))
            .filter((r): r is { success: true; data: ExternalQuestion['explanationSources'][number] } => r.success)
            .map((r) => r.data)
        : undefined) as ExternalQuestion['explanationSources'],
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
