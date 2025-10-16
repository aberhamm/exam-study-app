import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ObjectId, type WithId } from 'mongodb';
import { getDb, getQuestionsCollectionName, getQuestionClustersCollectionName } from '@/lib/server/mongodb';
import type { QuestionDocument } from '@/types/question';
import { normalizeQuestions } from '@/lib/normalize';
import type { ExternalQuestion } from '@/types/external-question';
import { envConfig } from '@/lib/env-config';
import { ExplanationSourceZ } from '@/lib/validation';
import type { ExplanationSource } from '@/types/explanation';
import type { ClusterDocument } from '@/types/clusters';

// Contract for the prepare endpoint. See inline docs below for sampling behavior.
/**
 * Prepare exam questions for a session.
 *
 * New options:
 * - `avoidSimilar` (boolean): when true, filter sampled questions to avoid selecting
 *   multiple items that belong to the same cluster for the same exam attempt.
 * - `similarityPolicy` (enum):
 *   - 'duplicates-only' (default): avoid clusters with status 'approved_duplicates' or 'pending'.
 *   - 'all-clustered': avoid any cluster membership except 'approved_variants'.
 */
const StartRequestZ = z.object({
  questionType: z.enum(['all', 'single', 'multiple']).default('all'),
  explanationFilter: z.enum(['all', 'with-explanations', 'without-explanations']).default('all'),
  questionCount: z.number().int().min(1).max(1000).default(50),
  competencyFilter: z.string().optional(),
  excludeQuestionIds: z.array(z.string()).optional(),
  balancedByCompetency: z.boolean().optional().default(false),
  avoidSimilar: z.boolean().optional().default(false),
  similarityPolicy: z.enum(['duplicates-only', 'all-clustered']).optional().default('duplicates-only'),
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

    // Preload cluster membership when needed; map questionId -> array of (clusterId, status)
    let clusterLookup: Map<string, Array<{ id: string; status: ClusterDocument['status'] }>> | null = null;
    if (input.avoidSimilar) {
      const clusters = await db
        .collection<ClusterDocument>(getQuestionClustersCollectionName())
        .find({ examId })
        .project({ _id: 0, id: 1, status: 1, questionIds: 1 })
        .toArray();
      clusterLookup = new Map();
      for (const c of clusters) {
        for (const qid of c.questionIds) {
          const arr = clusterLookup.get(qid) || [];
          arr.push({ id: c.id, status: c.status });
          clusterLookup.set(qid, arr);
        }
      }
    }

    function filterBySimilarityPreservingOrder(idsInOrder: string[]): { selected: Set<string>; excludedCount: number } {
      if (!clusterLookup || !input.avoidSimilar) return { selected: new Set(idsInOrder), excludedCount: 0 };
      const usedClusters = new Set<string>();
      const selected = new Set<string>();
      let excludedCount = 0;
      for (const id of idsInOrder) {
        const mem = clusterLookup.get(id) || [];
        let conflict = false;
        for (const m of mem) {
          if (input.similarityPolicy === 'duplicates-only') {
            if ((m.status === 'approved_duplicates' || m.status === 'pending') && usedClusters.has(m.id)) {
              conflict = true; break;
            }
          } else {
            if (m.status !== 'approved_variants' && usedClusters.has(m.id)) {
              conflict = true; break;
            }
          }
        }
        if (conflict) { excludedCount += 1; continue; }
        selected.add(id);
        for (const m of mem) {
          if (input.similarityPolicy === 'duplicates-only') {
            if (m.status === 'approved_duplicates' || m.status === 'pending') usedClusters.add(m.id);
          } else {
            if (m.status !== 'approved_variants') usedClusters.add(m.id);
          }
        }
        if (selected.size >= input.questionCount) break;
      }
      return { selected, excludedCount };
    }
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
        const results: WithId<QuestionDocument>[] = [];
        const seen = new Set<string>();

        for (const comp of comps) {
          const take = base + (remainder > 0 ? 1 : 0);
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

          const compDocs = await col.aggregate<WithId<QuestionDocument>>(compPipeline).toArray();
          for (const d of compDocs) {
            const key = d._id.toString();
            if (!seen.has(key)) {
              seen.add(key);
              results.push(d);
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
          const fillDocs = await col.aggregate<WithId<QuestionDocument>>(fillPipeline).toArray();
          for (const d of fillDocs) {
            const key = d._id.toString();
            if (!seen.has(key)) {
              seen.add(key);
              results.push(d);
            }
          }
        }

        // Now transform results into ExternalQuestion without $lookup (embed minimal competency data)
        // Optionally enforce similarity constraint
        let selectedIds: Set<string> | null = null;
        let excludedBySimilarity = 0;
        if (input.avoidSimilar) {
          const idsOrdered = results.map((d) => d._id.toString());
          const f = filterBySimilarityPreservingOrder(idsOrdered);
          selectedIds = f.selected;
          excludedBySimilarity = f.excludedCount;
        }

        const external: ExternalQuestion[] = results
          .filter((d) => !selectedIds || selectedIds.has(d._id.toString()))
          .map((d) => ({
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
                .filter((r): r is { success: true; data: ExplanationSource } => r.success)
                .map((r) => r.data)
            : undefined) as ExternalQuestion['explanationSources'],
          study: d.study,
          competencyIds: d.competencyIds,
          competencies: (Array.isArray(d.competencyIds)
            ? d.competencyIds
                .map((cid: string) => comps.find((c) => c.id === cid))
                .filter((c): c is { id: string; title: string } => !!c)
                .map((c) => ({ id: c.id, title: c.title }))
            : undefined) as ExternalQuestion['competencies'],
        }));
        // Normalize to the client-friendly question shape
        const normalized = normalizeQuestions(external);
        return NextResponse.json({ examId, count: normalized.length, excludedBySimilarity, questions: normalized }, { headers: { 'Cache-Control': 'no-store' } });
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

    // Optionally enforce similarity constraint
    let selectedIds: Set<string> | null = null;
    let excludedBySimilarity = 0;
    if (input.avoidSimilar) {
      const idsOrdered = docs.map((d) => d._id.toString());
      const f = filterBySimilarityPreservingOrder(idsOrdered);
      selectedIds = f.selected;
      excludedBySimilarity = f.excludedCount;
    }

    const external: ExternalQuestion[] = docs
      .filter((d) => !selectedIds || selectedIds.has(d._id.toString()))
      .map((d) => ({
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
            .filter((r): r is { success: true; data: ExplanationSource } => r.success)
            .map((r) => r.data)
        : undefined) as ExternalQuestion['explanationSources'],
      study: d.study,
      competencyIds: d.competencyIds,
      competencies: d.competencies,
    }));
    const normalized = normalizeQuestions(external);

    return NextResponse.json({ examId, count: normalized.length, excludedBySimilarity, questions: normalized }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to prepare questions for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to prepare questions' }, { status: 500 });
  }
}
