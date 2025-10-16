import { NextResponse } from 'next/server';
import { getDb, getQuestionClustersCollectionName, getQuestionsCollectionName, getQuestionEmbeddingsCollectionName, getDedupePairsCollectionName } from '@/lib/server/mongodb';
import { computePairScoresFromEmbeddings, calculateClusterMetricsExtended, clusterQuestionsBySimilarity, splitClusterAuto } from '@/lib/server/clustering';
import type { ClusterDocument, ClusterAction } from '@/types/clusters';
import type { QuestionDocument } from '@/types/question';
import { requireAdmin } from '@/lib/auth';
import { randomUUID } from 'crypto';
import type { Document, OptionalId, Filter } from 'mongodb';

/**
 * Cluster detail/actions API
 *
 * GET: fetch a single cluster with populated questions (for review).
 * POST actions:
 * - approve_duplicates: mark as duplicates; optionally delete all but one; locks the cluster.
 * - approve_variants: mark as variants (keep all); locks the cluster.
 * - exclude_question: remove a single question; delete cluster if <2 remain.
 * - split: compute subclusters (auto/threshold); insert children; parent marked as split.
 * - reset: unlock and set status back to pending.
 *
 * Notes
 * - Splitting computes dense pairwise similarities from embeddings to avoid artifacts of sparse neighbor search.
 * - Parent is preserved to maintain lineage; children receive fresh stable UUIDs and metrics.
 */

type RouteParams = {
  params: Promise<{ examId: string; clusterId: string }>;
};

export async function GET(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  let clusterId = 'unknown';
  try {
    // Require admin authentication
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
    clusterId = params.clusterId;

    const db = await getDb();
    const clustersCol = db.collection<ClusterDocument>(getQuestionClustersCollectionName());
    const qCol = db.collection<QuestionDocument>(getQuestionsCollectionName());

    const cluster = await clustersCol.findOne({ examId, id: clusterId });
    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    // Populate with questions
    const questions = await qCol
      .find({ examId, id: { $in: cluster.questionIds } }, { projection: { _id: 0 } })
      .toArray();

    // Load proposed additions' questions if present
    let proposedQuestions: QuestionDocument[] | undefined = undefined;
    const proposedIds = Array.isArray(cluster.proposedAdditions)
      ? cluster.proposedAdditions.map((p) => p.id)
      : [];
    if (proposedIds.length > 0) {
      // Resolve both ObjectId and legacy string id
      const { ObjectId } = await import('mongodb');
      const objectIds = proposedIds.filter((id) => ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id)).map((id) => new ObjectId(id));
      const strIds = proposedIds.filter((id) => !(ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id)));
      const orFilters: Filter<QuestionDocument>[] = [];
      if (objectIds.length) orFilters.push({ _id: { $in: objectIds } } as Filter<QuestionDocument>);
      if (strIds.length) orFilters.push({ id: { $in: strIds } } as Filter<QuestionDocument>);
      const filter: Filter<QuestionDocument> = orFilters.length
        ? ({ examId, $or: orFilters } as Filter<QuestionDocument>)
        : ({ examId } as Filter<QuestionDocument>);
      const pq: QuestionDocument[] = await qCol.find(filter).toArray();
      proposedQuestions = pq;
    }

    const populatedCluster: ClusterDocument & { questions: QuestionDocument[]; proposedQuestions?: QuestionDocument[] } = {
      ...cluster,
      questions,
      proposedQuestions,
    };

    return NextResponse.json({ cluster: populatedCluster }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error(`Failed to get cluster ${clusterId} for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to get cluster' }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  let clusterId = 'unknown';
  try {
    // Require admin authentication
    let adminUser: { id: string; username: string } | null = null;
    try {
      const u = await requireAdmin();
      adminUser = { id: u.id, username: u.username };
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const params = await context.params;
    examId = params.examId;
    clusterId = params.clusterId;

    const action = (await request.json()) as ClusterAction;

    const db = await getDb();
    const clustersCol = db.collection<ClusterDocument>(getQuestionClustersCollectionName());
    const qCol = db.collection<QuestionDocument>(getQuestionsCollectionName());

    const cluster = await clustersCol.findOne({ examId, id: clusterId });
    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    const now = new Date();

    switch (action.type) {
      case 'approve_duplicates': {
        // Mark cluster as approved duplicates
        // Optionally keep one question and delete the rest
        await clustersCol.updateOne(
          { examId, id: clusterId },
          { $set: { status: 'approved_duplicates', locked: true, decidedAt: now, updatedAt: now } }
        );

        if (action.keepQuestionId) {
          // Delete all questions except the one to keep
          const questionsToDelete = cluster.questionIds.filter(id => id !== action.keepQuestionId);
          if (questionsToDelete.length > 0) {
            await qCol.deleteMany({ examId, id: { $in: questionsToDelete } });
          }
        }

        return NextResponse.json({
          success: true,
          action: 'approved_duplicates',
          deletedQuestions: action.keepQuestionId ? cluster.questionIds.filter(id => id !== action.keepQuestionId) : []
        });
      }

      case 'approve_variants': {
        // Mark cluster as approved variants (keep all questions)
        await clustersCol.updateOne(
          { examId, id: clusterId },
          { $set: { status: 'approved_variants', locked: true, decidedAt: now, updatedAt: now } }
        );

        return NextResponse.json({
          success: true,
          action: 'approved_variants'
        });
      }

      case 'flag_review': {
        const reason = typeof (action as { reason?: unknown }).reason === 'string' ? (action as { reason?: string }).reason : undefined;
        await clustersCol.updateOne(
          { examId, id: clusterId },
          {
            $set: {
              flaggedForReview: true,
              flaggedReason: reason,
              flaggedAt: now,
              flaggedBy: adminUser?.username,
              updatedAt: now,
            },
          }
        );
        return NextResponse.json({ success: true, action: 'flag_review', reason });
      }

      case 'clear_review': {
        await clustersCol.updateOne(
          { examId, id: clusterId },
          {
            $set: { flaggedForReview: false, updatedAt: now },
            $unset: { flaggedReason: '', flaggedAt: '', flaggedBy: '' },
          }
        );
        return NextResponse.json({ success: true, action: 'clear_review' });
      }

      case 'exclude_question': {
        // Remove a question from the cluster AND mark it not-similar to remaining members
        const removedId = String((action as { questionId: unknown }).questionId || '');
        const newQuestionIds = cluster.questionIds.filter(id => id !== removedId);

        // Upsert ignore flags for removedId against all other members
        try {
          const flagsCol = db.collection<Document>(getDedupePairsCollectionName());
          const ops = cluster.questionIds
            .filter(id => id !== removedId)
            .map(otherId => {
              const [aId, bId] = [removedId, otherId].sort();
              return flagsCol.updateOne(
                { examId, aId, bId },
                { $set: { examId, aId, bId, status: 'ignore', updatedAt: now }, $setOnInsert: { createdAt: now } },
                { upsert: true }
              );
            });
          await Promise.all(ops);
        } catch {
          // best-effort; continue cluster update even if flagging fails
        }

        if (newQuestionIds.length < 2) {
          // Delete cluster if less than 2 questions remain
          await clustersCol.deleteOne({ examId, id: clusterId });
          return NextResponse.json({
            success: true,
            action: 'cluster_deleted',
            removedQuestion: removedId
          });
        } else {
          // Update cluster with remaining questions
          await clustersCol.updateOne(
            { examId, id: clusterId },
            { $set: { questionIds: newQuestionIds, updatedAt: now } }
          );
          return NextResponse.json({
            success: true,
            action: 'question_excluded',
            removedQuestion: removedId,
            remainingQuestions: newQuestionIds
          });
        }
      }

      case 'split': {
        const strategy: 'auto' | 'threshold' = action.type === 'split' && action.strategy === 'threshold' ? 'threshold' : 'auto';
        const splitThreshold: number = action.type === 'split' && typeof action.threshold === 'number' ? action.threshold : 0.95;
        const minClusterSize: number = Math.max(2, action.type === 'split' && typeof action.minClusterSize === 'number' ? action.minClusterSize : 2);

        const db = await getDb();
        const embCol = db.collection<Document>(getQuestionEmbeddingsCollectionName());

        // Support multiple embedding schemas: question_id (ObjectId), questionId (ObjectId), or id (string)
        const { ObjectId } = await import('mongodb');
        const objectIds: typeof ObjectId.prototype[] = [];
        const stringIds: string[] = [];
        for (const id of cluster.questionIds) {
          if (ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id)) {
            objectIds.push(new ObjectId(id));
          } else if (typeof id === 'string' && id) {
            stringIds.push(id);
          }
        }

        const embQuery: Document & { $or?: Document[] } = { examId };
        const or: Document[] = [];
        if (objectIds.length) {
          or.push({ question_id: { $in: objectIds } });
          or.push({ questionId: { $in: objectIds } });
        }
        if (stringIds.length) {
          or.push({ question_id: { $in: stringIds } });
          or.push({ id: { $in: stringIds } });
        }
        if (or.length) embQuery.$or = or;

        const embeddingDocs = await embCol
          .find<{ question_id?: unknown; questionId?: unknown; id?: unknown; embedding?: number[] }>(embQuery, { projection: { _id: 0, question_id: 1, questionId: 1, id: 1, embedding: 1 } })
          .toArray();
        const byId = new Map<string, number[]>();
        for (const d of embeddingDocs) {
          const id = d.question_id ? String(d.question_id) : d.questionId ? String(d.questionId) : d.id ? String(d.id) : '';
          const emb = Array.isArray(d.embedding) ? d.embedding : undefined;
          if (id && Array.isArray(emb) && emb.length) byId.set(id, emb);
        }
        if (byId.size < 2) {
          return NextResponse.json({ success: false, reason: 'insufficient_embeddings' });
        }

        const pairScores = computePairScoresFromEmbeddings(cluster.questionIds, byId);

        // Respect ignored pairs: remove those edges from the similarity graph
        try {
          const flagsCol = db.collection<Document>(getDedupePairsCollectionName());
          const ignoreFlags = await flagsCol
            .find({ examId, status: 'ignore' }, { projection: { _id: 0, aId: 1, bId: 1 } })
            .toArray();
          for (const f of ignoreFlags) {
            const a = String((f as { aId?: unknown }).aId);
            const b = String((f as { bId?: unknown }).bId);
            const key = [a, b].sort().join('::');
            pairScores.delete(key);
          }
        } catch {
          // proceed without flags if collection missing
        }

        let subclusters: Array<{ questionIds: string[] }>; // compute sets only
        let chosenThreshold = splitThreshold;
        if (strategy === 'threshold') {
          const filtered: { aId: string; bId: string; score: number }[] = [];
          for (let i = 0; i < cluster.questionIds.length; i++) {
            for (let j = i + 1; j < cluster.questionIds.length; j++) {
              const a = cluster.questionIds[i];
              const b = cluster.questionIds[j];
              const s = pairScores.get([a, b].sort().join('::')) ?? 0;
              if (s >= splitThreshold) filtered.push({ aId: a, bId: b, score: s });
            }
          }
          subclusters = clusterQuestionsBySimilarity(filtered, minClusterSize, splitThreshold).map(c => ({ questionIds: c.questionIds }));
        } else {
          const result = splitClusterAuto({ id: cluster.id, questionIds: cluster.questionIds, avgSimilarity: cluster.avgSimilarity, maxSimilarity: cluster.maxSimilarity, minSimilarity: cluster.minSimilarity }, pairScores, { minClusterSize });
          chosenThreshold = result.threshold;
          subclusters = result.clusters.filter(c => c.questionIds.length >= minClusterSize).map(c => ({ questionIds: c.questionIds }));
        }

        if (subclusters.length < 2) {
          return NextResponse.json({ success: false, reason: 'no_split_found' });
        }

        const newDocs: OptionalId<ClusterDocument>[] = [];
        for (const sc of subclusters) {
          const m = calculateClusterMetricsExtended(sc.questionIds, pairScores);
          newDocs.push({
            id: randomUUID(),
            examId,
            questionIds: sc.questionIds,
            avgSimilarity: m.avgSimilarity,
            maxSimilarity: m.maxSimilarity,
            minSimilarity: m.minSimilarity,
            cohesionScore: m.cohesionScore,
            stdDevSimilarity: m.stdDevSimilarity,
            edgeCount: m.edgeCount,
            possibleEdgeCount: m.possibleEdgeCount,
            density: m.density,
            medoidId: m.medoidId,
            status: 'pending',
            locked: false,
            createdAt: now,
            updatedAt: now,
          } as ClusterDocument);
        }

        await clustersCol.insertMany(newDocs as OptionalId<ClusterDocument>[]);
        await clustersCol.updateOne(
          { examId, id: clusterId },
          { $set: { status: 'split', children: newDocs.map(d => d.id), updatedAt: now } }
        );

        return NextResponse.json({
          success: true,
          action: 'split',
          threshold: chosenThreshold,
          created: newDocs.map(d => ({ id: d.id, questionIds: d.questionIds })),
          parent: { id: clusterId, status: 'split' }
        });
      }

      case 'approve_additions': {
        const ids = Array.isArray((action as { ids?: unknown }).ids) ? ((action as { ids: unknown[] }).ids.map(String)) : [];
        if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });

        // Build pair scores via embeddings
        const embCol = db.collection<Document>(getQuestionEmbeddingsCollectionName());
        const { ObjectId } = await import('mongodb');
        const allIds = Array.from(new Set<string>([...cluster.questionIds, ...ids]));
        const objectIds = allIds.filter((id) => ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id)).map((id) => new ObjectId(id));
        const stringIds = allIds.filter((id) => !(ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id)));
        const embQuery: Document = { examId };
        const or: Document[] = [];
        if (objectIds.length) {
          or.push({ question_id: { $in: objectIds } });
          or.push({ questionId: { $in: objectIds } });
        }
        if (stringIds.length) {
          or.push({ question_id: { $in: stringIds } });
          or.push({ id: { $in: stringIds } });
        }
        if (or.length) (embQuery as Document & { $or?: Document[] }).$or = or;
        const embeddingDocs = await embCol
          .find<{ question_id?: unknown; questionId?: unknown; id?: unknown; embedding?: number[] }>(embQuery, { projection: { _id: 0, question_id: 1, questionId: 1, id: 1, embedding: 1 } })
          .toArray();
        const byId = new Map<string, number[]>();
        for (const d of embeddingDocs) {
          const id = d.question_id ? String(d.question_id) : d.questionId ? String(d.questionId) : d.id ? String(d.id) : '';
          const emb = Array.isArray(d.embedding) ? d.embedding : undefined;
          if (id && Array.isArray(emb) && emb.length) byId.set(id, emb);
        }

        const pairScores = computePairScoresFromEmbeddings(allIds, byId);
        const m = calculateClusterMetricsExtended(allIds, pairScores);

        // Merge questionIds and remove proposals for accepted ids
        const newQuestionIds = Array.from(new Set<string>(allIds));
        const remainingProposals = Array.isArray(cluster.proposedAdditions)
          ? cluster.proposedAdditions.filter((p) => !ids.includes(p.id))
          : [];

        const updateDoc: Partial<ClusterDocument> = {
          questionIds: newQuestionIds,
          avgSimilarity: m.avgSimilarity,
          maxSimilarity: m.maxSimilarity,
          minSimilarity: m.minSimilarity,
          cohesionScore: m.cohesionScore,
          stdDevSimilarity: m.stdDevSimilarity,
          edgeCount: m.edgeCount,
          possibleEdgeCount: m.possibleEdgeCount,
          density: m.density,
          medoidId: m.medoidId,
          proposedAdditions: remainingProposals,
          flaggedForReview: remainingProposals.length > 0 ? true : undefined,
          updatedAt: now,
        };

        await clustersCol.updateOne({ examId, id: clusterId }, { $set: updateDoc });

        return NextResponse.json({ success: true, action: 'approve_additions', added: ids, remainingProposals: remainingProposals.length });
      }

      case 'reject_additions': {
        const ids = Array.isArray((action as { ids?: unknown }).ids) ? ((action as { ids: unknown[] }).ids.map(String)) : [];
        if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
        // Upsert ignore flags for each id vs current members
        try {
          const flagsCol = db.collection<Document>(getDedupePairsCollectionName());
          const ops: Promise<unknown>[] = [];
          for (const addId of ids) {
            for (const m of cluster.questionIds) {
              const [aId, bId] = [addId, m].sort();
              ops.push(flagsCol.updateOne(
                { examId, aId, bId },
                { $set: { examId, aId, bId, status: 'ignore', updatedAt: now }, $setOnInsert: { createdAt: now } },
                { upsert: true }
              ));
            }
          }
          await Promise.all(ops);
        } catch {}

        const remainingProposals = Array.isArray(cluster.proposedAdditions)
          ? cluster.proposedAdditions.filter((p) => !ids.includes(p.id))
          : [];
        await clustersCol.updateOne(
          { examId, id: clusterId },
          { $set: { proposedAdditions: remainingProposals, flaggedForReview: remainingProposals.length > 0 ? true : undefined, updatedAt: now } }
        );
        return NextResponse.json({ success: true, action: 'reject_additions', rejected: ids, remainingProposals: remainingProposals.length });
      }

      case 'reset': {
        // Reset cluster to pending state
        await clustersCol.updateOne(
          { examId, id: clusterId },
          { $set: { status: 'pending', locked: false, updatedAt: now } }
        );

        return NextResponse.json({
          success: true,
          action: 'reset'
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
    }

  } catch (error) {
    console.error(`Failed to perform action on cluster ${clusterId} for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  let clusterId = 'unknown';
  try {
    // Require admin authentication
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
    clusterId = params.clusterId;

    const db = await getDb();
    const clustersCol = db.collection<ClusterDocument>(getQuestionClustersCollectionName());

    const result = await clustersCol.deleteOne({ examId, id: clusterId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(`Failed to delete cluster ${clusterId} for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to delete cluster' }, { status: 500 });
  }
}
