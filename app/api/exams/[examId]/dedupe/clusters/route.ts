import { NextResponse } from 'next/server';
import { envConfig } from '@/lib/env-config';
import { getDb, getQuestionEmbeddingsCollectionName, getQuestionsCollectionName, getQuestionClustersCollectionName } from '@/lib/server/mongodb';
import { clusterQuestionsBySimilarity, type SimilarityPair } from '@/lib/server/clustering';
import type { Document } from 'mongodb';
import type { QuestionDocument } from '@/types/question';
import type { ClusterDocument, QuestionCluster } from '@/types/clusters';
import type { OptionalId } from 'mongodb';

type RouteParams = {
  params: Promise<{ examId: string }>;
};

type ClusterBody = {
  threshold?: number;
  minClusterSize?: number;
  forceRegenerate?: boolean;
};

export async function GET(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    if (!envConfig.features.devFeaturesEnabled) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const url = new URL(request.url);
    const forceRegenerate = url.searchParams.get('regenerate') === 'true';
    const thresholdParam = url.searchParams.get('threshold');
    const threshold = thresholdParam ? Math.max(0.8, Math.min(0.99, Number(thresholdParam))) : 0.85;

    const db = await getDb();
    const clustersCol = db.collection<ClusterDocument>(getQuestionClustersCollectionName());

    // Try to get existing clusters first
    if (!forceRegenerate) {
      const existingClusters = await clustersCol
        .find({ examId }, { projection: { _id: 0 } })
        .sort({ avgSimilarity: -1 })
        .toArray();

      if (existingClusters.length > 0) {
        // Populate with question data
        const populatedClusters = await populateClustersWithQuestions(existingClusters, examId);
        return NextResponse.json({
          examId,
          count: populatedClusters.length,
          clusters: populatedClusters,
          generated: false
        }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }

    // Generate new clusters
    const minClusterSize = 2;

    const embCol = db.collection<Document>(getQuestionEmbeddingsCollectionName());

    // Load all embeddings for the exam
    const embeddingDocs = await embCol
      .find({ examId }, { projection: { _id: 0, question_id: 1, examId: 1, embedding: 1 } })
      .toArray();

    if (embeddingDocs.length === 0) {
      return NextResponse.json({ examId, count: 0, clusters: [], generated: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Generate similarity pairs
    const pairs = await generateSimilarityPairs(embeddingDocs as unknown as Array<{ question_id: unknown; examId: string; embedding?: number[] }>, examId, threshold);

    // Cluster the pairs
    const clusters = clusterQuestionsBySimilarity(pairs, minClusterSize, threshold);

    // Save clusters to database
    const now = new Date();
    const clusterDocs = clusters.map(cluster => ({
      ...cluster,
      examId,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now
    }));

    if (clusterDocs.length > 0) {
      // Clear existing clusters for this exam
      await clustersCol.deleteMany({ examId });
      await clustersCol.insertMany(clusterDocs as OptionalId<ClusterDocument>[]);
    }

    // Populate with question data
    const populatedClusters = await populateClustersWithQuestions(clusterDocs as ClusterDocument[], examId);

    return NextResponse.json({
      examId,
      count: populatedClusters.length,
      clusters: populatedClusters,
      generated: true
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error(`Cluster generation failed for exam ${examId}`, error);
    return NextResponse.json({ error: 'Cluster generation failed' }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    if (!envConfig.features.devFeaturesEnabled) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ClusterBody;
    const threshold = Math.max(0, Math.min(1, Number(body?.threshold) || 0.85));
    const minClusterSize = Math.min(Math.max(Number(body?.minClusterSize) || 2, 2), 10);

    const db = await getDb();
    const embCol = db.collection<Document>(getQuestionEmbeddingsCollectionName());

    // Load all embeddings for the exam
    const embeddingDocs = await embCol
      .find({ examId }, { projection: { _id: 0, question_id: 1, examId: 1, embedding: 1 } })
      .toArray();

    if (embeddingDocs.length === 0) {
      return NextResponse.json({ examId, count: 0, clusters: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Generate similarity pairs
    const pairs = await generateSimilarityPairs(embeddingDocs as unknown as Array<{ question_id: unknown; examId: string; embedding?: number[] }>, examId, threshold);

    // Cluster the pairs
    const clusters = clusterQuestionsBySimilarity(pairs, minClusterSize, threshold);

    // Save clusters to database
    const clustersCol = db.collection<ClusterDocument>(getQuestionClustersCollectionName());
    const now = new Date();
    const clusterDocs = clusters.map(cluster => ({
      ...cluster,
      examId,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now
    }));

    if (clusterDocs.length > 0) {
      // Clear existing clusters for this exam
      await clustersCol.deleteMany({ examId });
      await clustersCol.insertMany(clusterDocs as OptionalId<ClusterDocument>[]);
    }

    // Populate with question data
    const populatedClusters = await populateClustersWithQuestions(clusterDocs as ClusterDocument[], examId);

    return NextResponse.json({
      examId,
      count: populatedClusters.length,
      clusters: populatedClusters
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error(`Cluster generation failed for exam ${examId}`, error);
    return NextResponse.json({ error: 'Cluster generation failed' }, { status: 500 });
  }
}

async function generateSimilarityPairs(
  embeddingDocs: Array<{ question_id: unknown; examId: string; embedding?: number[] }>,
  examId: string,
  threshold: number
): Promise<SimilarityPair[]> {
  const db = await getDb();
  const embCol = db.collection<Document>(getQuestionEmbeddingsCollectionName());

  const indexName = envConfig.mongo.questionEmbeddingsVectorIndex;

  const pairs = new Map<string, SimilarityPair>();

  // For each embedding, search nearest neighbors
  for (const doc of embeddingDocs) {
    const queryEmbedding = doc.embedding;
    const questionId = doc.question_id;
    const qid = questionId ? String(questionId) : '';
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0 || !qid) continue;

    const pipeline: Document[] = [
      {
        $vectorSearch: {
          index: indexName,
          queryVector: queryEmbedding,
          path: 'embedding',
          numCandidates: 100,
          limit: 10,
          filter: { examId },
        },
      },
      { $project: { _id: 0, question_id: 1, examId: 1, score: { $meta: 'vectorSearchScore' } } },
    ];

    const hits = await embCol.aggregate<{ question_id: unknown; score: number }>(pipeline).toArray();
    for (const hit of hits) {
      const hitId = hit.question_id ? String(hit.question_id) : '';
      if (!hitId || hitId === qid) continue;
      const score = typeof hit.score === 'number' ? hit.score : 0;
      if (score < threshold) continue;

      const [aId, bId] = [qid, hitId].sort();
      const key = `${aId}::${bId}`;
      const existing = pairs.get(key);
      if (!existing || score > existing.score) {
        pairs.set(key, { aId, bId, score });
      }
    }
  }

  return Array.from(pairs.values());
}

async function populateClustersWithQuestions(
  clusters: ClusterDocument[],
  examId: string
): Promise<QuestionCluster[]> {
  const db = await getDb();
  const qCol = db.collection<QuestionDocument>(getQuestionsCollectionName());

  // Get all unique question IDs
  const allQuestionIds = new Set<string>();
  for (const cluster of clusters) {
    for (const qId of cluster.questionIds) {
      allQuestionIds.add(qId);
    }
  }

  // Separate old string IDs from new ObjectId strings
  const { ObjectId } = await import('mongodb');
  const objectIds: typeof ObjectId.prototype[] = [];
  const stringIds: string[] = [];

  for (const id of allQuestionIds) {
    // New ObjectId strings are 24 hex characters
    if (ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id)) {
      objectIds.push(new ObjectId(id));
    } else {
      // Old string IDs like "q-1enjk1b"
      stringIds.push(id);
    }
  }

  // Fetch questions by BOTH _id (ObjectId) and id (string)
  const query: Document = { examId };
  if (objectIds.length > 0 && stringIds.length > 0) {
    query.$or = [
      { _id: { $in: objectIds } },
      { id: { $in: stringIds } }
    ];
  } else if (objectIds.length > 0) {
    query._id = { $in: objectIds };
  } else if (stringIds.length > 0) {
    query.id = { $in: stringIds };
  }

  const questions = await qCol.find(query).toArray();

  // Map by BOTH _id string and id string for lookup
  const questionMap = new Map<string, QuestionDocument & { id: string }>();
  for (const q of questions) {
    const idStr = q._id.toString();
    questionMap.set(idStr, { ...q, id: idStr });
    // Also map by old string ID if it exists (legacy data may have string id field)
    const qWithId = q as QuestionDocument & { id?: string };
    if (qWithId.id && typeof qWithId.id === 'string') {
      questionMap.set(qWithId.id, { ...q, id: idStr });
    }
  }

  // Populate clusters with questions
  return clusters.map(cluster => ({
    ...cluster,
    questions: cluster.questionIds.map(id => questionMap.get(id)!).filter(Boolean)
  }));
}