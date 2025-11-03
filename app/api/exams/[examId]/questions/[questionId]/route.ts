import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb, getQuestionsCollectionName, getQuestionEmbeddingsCollectionName } from '@/lib/server/mongodb';
import type { ExternalQuestion } from '@/types/external-question';
import { requireAdmin } from '@/lib/auth-supabase';
import { buildQuestionTextForEmbedding, generateEmbedding } from '@/lib/server/embeddings';
import type { ExplanationVersion, ExplanationSource } from '@/types/explanation';
import { ExternalQuestionUpdateZ, ExplanationSourceZ } from '@/lib/validation';
import { z } from 'zod';

// Normalize Mongo driver results: support both direct doc and ModifyResult.value
function asDoc<T>(res: unknown): T | null {
  if (!res || typeof res !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyRes = res as any;
  return 'value' in anyRes ? ((anyRes.value ?? null) as T | null) : (res as T);
}

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
    let adminUser: { id: string; email: string } | null = null;
    try {
      const user = await requireAdmin();
      adminUser = { id: user.id, email: user.email };
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const params = await context.params;
    examId = params.examId;
    questionId = params.questionId;

    // Parse payload (supports full update and explanation-only update)
    let payload: (ExternalQuestion & { id: string }) | null = null;
    let explanationOnly: { id: string; explanation: string; explanationSources?: ExplanationSource[]; explanationGeneratedByAI?: boolean } | null = null;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const full = ExternalQuestionUpdateZ.safeParse(rawBody);
    if (full.success) {
      payload = full.data as ExternalQuestion & { id: string };
    } else {
      // Fallback: explanation-only patch
      const ExplanationUpdateZ = z.object({
        id: z.string().min(1),
        explanation: z.string().min(1),
        explanationSources: z.array(ExplanationSourceZ).optional(),
        explanationGeneratedByAI: z.boolean().optional(),
      });
      const partial = ExplanationUpdateZ.safeParse(rawBody);
      if (partial.success) {
        explanationOnly = partial.data;
      } else {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
      }
    }

    const incomingId = payload?.id || explanationOnly?.id;
    if (!incomingId || incomingId !== questionId) {
      return NextResponse.json({ error: 'Mismatched or missing question id' }, { status: 400 });
    }

    const db = await getDb();
    const qCol = db.collection(getQuestionsCollectionName());

    // questionId validity checked above

    const updateDoc: Record<string, unknown> = explanationOnly
      ? {
          explanation: explanationOnly.explanation,
          explanationGeneratedByAI: explanationOnly.explanationGeneratedByAI ?? true,
          explanationSources: explanationOnly.explanationSources,
          updatedAt: new Date(),
        }
      : {
          question: (payload as ExternalQuestion & { id: string }).question,
          options: (payload as ExternalQuestion & { id: string }).options,
          answer: (payload as ExternalQuestion & { id: string }).answer,
          question_type: (payload as ExternalQuestion & { id: string }).question_type ?? 'single',
          explanation: (payload as ExternalQuestion & { id: string }).explanation,
          explanationGeneratedByAI: (payload as ExternalQuestion & { id: string }).explanationGeneratedByAI,
          explanationSources: (payload as ExternalQuestion & { id: string }).explanationSources,
          study: (payload as ExternalQuestion & { id: string }).study,
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

    // Load current doc to capture previous explanation for history (strict by examId + _id)
    const existing = await qCol.findOne({ _id: new ObjectId(questionId), examId });

    // Build update operations with optional history push
    const now = new Date();
    const updateOps: Record<string, unknown> = { $set: updateDoc };

    if (existing && typeof existing.explanation === 'string') {
      const incomingExplanation = explanationOnly
        ? explanationOnly.explanation
        : (typeof (payload as ExternalQuestion & { id: string }).explanation === 'string'
            ? (payload as ExternalQuestion & { id: string }).explanation
            : undefined);
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

    // Strict match on examId + _id
    const result = await qCol.findOneAndUpdate(
      { _id: new ObjectId(questionId), examId },
      updateOps,
      { returnDocument: 'after' }
    );

    const doc = asDoc<typeof existing>(result);
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
      const finalId = (doc as { _id: ObjectId })._id as ObjectId;
      await embCol.updateOne(
        { questionId: finalId },
        {
          $set: {
            embedding: embeddingData.embedding,
            embeddingModel: embeddingData.embeddingModel,
            embeddingUpdatedAt: embeddingData.embeddingUpdatedAt,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            questionId: finalId,
            examId: (doc as { examId?: string } | null)?.examId || examId,
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
