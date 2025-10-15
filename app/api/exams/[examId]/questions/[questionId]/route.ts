import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb, getQuestionsCollectionName, getQuestionEmbeddingsCollectionName } from '@/lib/server/mongodb';
import type { ExternalQuestion } from '@/types/external-question';
import { requireAdmin } from '@/lib/auth';
import { buildQuestionTextForEmbedding, generateEmbedding } from '@/lib/server/embeddings';
import type { ExplanationVersion, ExplanationSource } from '@/types/explanation';
import { ExternalQuestionUpdateZ, ExplanationSourceZ } from '@/lib/validation';

type RouteParams = {
  params: Promise<{ examId: string; questionId: string }>;
};

export async function DELETE(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  let questionId = 'unknown';
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
    questionId = params.questionId;

    if (!ObjectId.isValid(questionId)) {
      return NextResponse.json({ error: 'Invalid question ID format' }, { status: 400 });
    }

    const db = await getDb();
    const qCol = db.collection(getQuestionsCollectionName());
    const embCol = db.collection(getQuestionEmbeddingsCollectionName());

    const delQ = await qCol.deleteOne({ _id: new ObjectId(questionId), examId });
    const delEmb = await embCol.deleteOne({ questionId: new ObjectId(questionId) });

    if (delQ.deletedCount === 0) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }
    return NextResponse.json({ examId, questionId, deleted: true, deletedEmbedding: delEmb.deletedCount > 0 }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Delete question failed examId=${examId} id=${questionId}`, error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteParams) {
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

    // Parse known fields
    let payload: ExternalQuestion & { id: string };
    let rawBody: unknown;
    try {
      rawBody = await request.json();
      payload = ExternalQuestionUpdateZ.parse(rawBody) as ExternalQuestion & { id: string };
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (!payload || typeof payload.id !== 'string' || payload.id !== questionId) {
      return NextResponse.json({ error: 'Mismatched or missing question id' }, { status: 400 });
    }

    const db = await getDb();
    const qCol = db.collection(getQuestionsCollectionName());

    const updateDoc: Record<string, unknown> = {
      question: payload.question,
      options: payload.options,
      answer: payload.answer,
      question_type: payload.question_type ?? 'single',
      explanation: payload.explanation,
      explanationGeneratedByAI: payload.explanationGeneratedByAI,
      explanationSources: payload.explanationSources,
      study: payload.study,
      updatedAt: new Date(),
    };

    // Support flagging fields if provided
    const bodyAny = rawBody as { flaggedForReview?: boolean; flaggedReason?: string; flaggedAt?: string | Date; flaggedBy?: string };
    if (bodyAny.flaggedForReview !== undefined) {
      updateDoc.flaggedForReview = bodyAny.flaggedForReview;
    }
    if (bodyAny.flaggedReason !== undefined) {
      updateDoc.flaggedReason = bodyAny.flaggedReason;
    }
    if (bodyAny.flaggedAt !== undefined) {
      updateDoc.flaggedAt = new Date(bodyAny.flaggedAt);
    }
    if (bodyAny.flaggedBy !== undefined) {
      updateDoc.flaggedBy = bodyAny.flaggedBy;
    }

    // Load current doc to capture previous explanation for history
    const existing = await qCol.findOne({ _id: new ObjectId(questionId), examId });

    // Build update operations with optional history push
    const now = new Date();
    const updateOps: Record<string, unknown> = { $set: updateDoc };

    if (existing && typeof existing.explanation === 'string') {
      const incomingExplanation = typeof payload.explanation === 'string' ? payload.explanation : undefined;
      const prevExplanation = existing.explanation as string | undefined;
      if ((incomingExplanation ?? '').trim() !== (prevExplanation ?? '').trim()) {
        const historyItem: ExplanationVersion = {
          id: new ObjectId().toString(),
          savedAt: now,
          savedBy: adminUser,
          aiGenerated: existing.explanationGeneratedByAI as boolean | undefined,
          reason: 'edit',
          explanation: prevExplanation || '',
          sources: (existing as { explanationSources?: unknown }).explanationSources as ExplanationVersion['sources'],
        };
        (updateOps as { $push?: Record<string, unknown> }).$push = {
          ...(updateOps as { $push?: Record<string, unknown> }).$push,
          explanationHistory: historyItem,
        };
      }
    }

    const doc = await qCol.findOneAndUpdate(
      { _id: new ObjectId(questionId), examId },
      updateOps,
      { returnDocument: 'after' }
    );

    if (!doc) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Automatically regenerate embedding when question content changes
    try {
      const embeddingText = buildQuestionTextForEmbedding({
        question: doc.question,
        options: doc.options,
        answer: doc.answer,
        explanation: doc.explanation,
      });
      const embeddingData = await generateEmbedding(embeddingText);

      // Update the question embedding in the separate embeddings collection
      const embCol = db.collection(getQuestionEmbeddingsCollectionName());
      await embCol.updateOne(
        { questionId: new ObjectId(questionId) },
        {
          $set: {
            embedding: embeddingData.embedding,
            embeddingModel: embeddingData.embeddingModel,
            embeddingUpdatedAt: embeddingData.embeddingUpdatedAt,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            questionId: new ObjectId(questionId),
            examId,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (embeddingError) {
      // Log embedding error but don't fail the update
      console.error(`Failed to regenerate embedding for question ${questionId}:`, embeddingError);
    }

    // Return the updated question in external format (validate sources defensively)
    const rawSources = (doc as unknown as { explanationSources?: unknown }).explanationSources;
    const parsedSources: ExplanationSource[] | undefined = Array.isArray(rawSources)
      ? (rawSources as unknown[])
          .map((s) => ExplanationSourceZ.safeParse(s))
          .filter((r): r is { success: true; data: ExplanationSource } => r.success)
          .map((r) => r.data)
      : undefined;

    const responseBody: ExternalQuestion & { id: string } = {
      id: doc._id.toString(),
      question: doc.question,
      options: doc.options,
      answer: doc.answer,
      question_type: doc.question_type,
      explanation: doc.explanation,
      explanationGeneratedByAI: doc.explanationGeneratedByAI,
      explanationSources: parsedSources,
      study: doc.study,
      flaggedForReview: doc.flaggedForReview,
      flaggedReason: doc.flaggedReason,
      flaggedAt: doc.flaggedAt,
      flaggedBy: doc.flaggedBy,
    };

    return NextResponse.json(responseBody, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Patch question failed examId=${examId} id=${questionId}`, error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
