import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import { requireAdmin } from '@/lib/auth';
import type { ExplanationVersion } from '@/types/explanation';

type RouteParams = {
  params: Promise<{
    examId: string;
    questionId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  let questionId = 'unknown';

  try {
    // Require admin authentication
    let adminUser: { id: string; username: string } | null = null;
    try {
      const user = await requireAdmin();
      adminUser = { id: user.id, username: user.username };
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

    // Load existing to capture history
    const existing = await qCol.findOne({ _id: new ObjectId(questionId), examId });

    // Build update operations
    const now = new Date();
    const updateOps: Record<string, unknown> = {
      $unset: { explanation: '', explanationGeneratedByAI: '', explanationSources: '' },
      $set: { updatedAt: now },
    };

    if (existing && typeof existing.explanation === 'string' && existing.explanation.trim().length > 0) {
      const historyItem: ExplanationVersion = {
        id: new ObjectId().toString(),
        savedAt: now,
        savedBy: adminUser,
        aiGenerated: (existing as { explanationGeneratedByAI?: boolean }).explanationGeneratedByAI,
        reason: 'delete',
        explanation: existing.explanation as string,
        sources: (existing as { explanationSources?: unknown }).explanationSources as ExplanationVersion['sources'],
      };
      (updateOps as { $push?: Record<string, unknown> }).$push = { explanationHistory: historyItem };
    }

    const result = await qCol.findOneAndUpdate(
      { _id: new ObjectId(questionId), examId },
      updateOps,
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    console.info(`[explanation/delete] Removed explanation for question ${questionId} in exam ${examId}`);

    return NextResponse.json(
      {
        success: true,
        examId,
        questionId,
        message: 'Explanation deleted successfully'
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' }
      }
    );

  } catch (error) {
    console.error(`[explanation/delete] Failed to delete explanation for question ${questionId} in exam ${examId}:`, error);

    return NextResponse.json(
      {
        error: 'Failed to delete explanation',
        success: false
      },
      { status: 500 }
    );
  }
}
