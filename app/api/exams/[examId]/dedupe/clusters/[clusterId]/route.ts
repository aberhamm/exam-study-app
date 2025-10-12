import { NextResponse } from 'next/server';
import { getDb, getQuestionClustersCollectionName, getQuestionsCollectionName } from '@/lib/server/mongodb';
// import { splitCluster } from '@/lib/server/clustering';
import type { ClusterDocument, ClusterAction } from '@/types/clusters';
import type { QuestionDocument } from '@/types/question';
import { requireAdmin } from '@/lib/auth';

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

    const populatedCluster = {
      ...cluster,
      questions
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
          { $set: { status: 'approved_duplicates', updatedAt: now } }
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
          { $set: { status: 'approved_variants', updatedAt: now } }
        );

        return NextResponse.json({
          success: true,
          action: 'approved_variants'
        });
      }

      case 'exclude_question': {
        // Remove a question from the cluster
        const newQuestionIds = cluster.questionIds.filter(id => id !== action.questionId);

        if (newQuestionIds.length < 2) {
          // Delete cluster if less than 2 questions remain
          await clustersCol.deleteOne({ examId, id: clusterId });
          return NextResponse.json({
            success: true,
            action: 'cluster_deleted',
            removedQuestion: action.questionId
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
            removedQuestion: action.questionId,
            remainingQuestions: newQuestionIds
          });
        }
      }

      case 'split': {
        // Split cluster into smaller clusters based on higher threshold
        const splitThreshold = action.threshold || 0.95;

        // This would need similarity pairs to work properly
        // For now, we'll just mark as split and let user manually create new clusters
        await clustersCol.updateOne(
          { examId, id: clusterId },
          { $set: { status: 'split', updatedAt: now } }
        );

        return NextResponse.json({
          success: true,
          action: 'marked_for_split',
          threshold: splitThreshold
        });
      }

      case 'reset': {
        // Reset cluster to pending state
        await clustersCol.updateOne(
          { examId, id: clusterId },
          { $set: { status: 'pending', updatedAt: now } }
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