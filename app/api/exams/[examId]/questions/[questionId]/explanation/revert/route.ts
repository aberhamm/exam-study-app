import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import { requireAdmin } from '@/lib/auth';
import type { ExplanationVersion } from '@/types/explanation';
import type { ExternalQuestion } from '@/types/external-question';
import { getQuestionById } from '@/lib/server/questions';

type RouteParams = {
  params: Promise<{
    examId: string;
    questionId: string;
  }>;
};

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  let questionId = 'unknown';

  try {
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

    let body: { versionId?: string } | null = null;
    try {
      body = (await request.json()) as { versionId?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const versionId = body?.versionId;
    if (!versionId || typeof versionId !== 'string') {
      return NextResponse.json({ error: 'versionId is required' }, { status: 400 });
    }

    const db = await getDb();
    const qCol = db.collection(getQuestionsCollectionName());

    const existing = await qCol.findOne({ _id: new ObjectId(questionId), examId });
    if (!existing) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const history = (existing as { explanationHistory?: ExplanationVersion[] }).explanationHistory || [];
    const target = history.find((v) => v.id === versionId);
    if (!target) {
      return NextResponse.json({ error: 'History version not found' }, { status: 404 });
    }

    const now = new Date();
    // Current explanation saved into history (if any)
    const currentHistoryItem: ExplanationVersion | null = typeof existing.explanation === 'string' && existing.explanation.trim().length > 0
      ? {
          id: new ObjectId().toString(),
          savedAt: now,
          savedBy: adminUser,
          aiGenerated: (existing as { explanationGeneratedByAI?: boolean }).explanationGeneratedByAI,
          reason: 'revert',
          explanation: existing.explanation as string,
          sources: (existing as { explanationSources?: ExplanationVersion['sources'] }).explanationSources,
        }
      : null;

    const updateOps: Record<string, unknown> = {
      $set: {
        explanation: target.explanation,
        explanationGeneratedByAI: !!target.aiGenerated,
        explanationSources: target.sources || [],
        updatedAt: now,
      },
      $pull: { explanationHistory: { id: versionId } },
    };
    if (currentHistoryItem) {
      (updateOps as { $push?: Record<string, unknown> }).$push = { explanationHistory: currentHistoryItem };
    }

    await qCol.updateOne({ _id: new ObjectId(questionId), examId }, updateOps);

    // Return updated external question shape
    const updated = await getQuestionById(examId, questionId);
    if (!updated) {
      return NextResponse.json({ error: 'Question not found after update' }, { status: 404 });
    }
    const response: ExternalQuestion & { id: string } = {
      id: updated._id.toString(),
      question: updated.question,
      options: updated.options,
      answer: updated.answer,
      question_type: updated.question_type,
      explanation: updated.explanation,
      explanationGeneratedByAI: updated.explanationGeneratedByAI,
      explanationSources: (updated as { explanationSources?: ExplanationVersion['sources'] }).explanationSources,
      study: updated.study as ExternalQuestion['study'],
    };

    return NextResponse.json({ success: true, question: response }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`[explanation/revert] Failed examId=${examId} questionId=${questionId}:`, error);
    return NextResponse.json({ error: 'Failed to revert explanation' }, { status: 500 });
  }
}

