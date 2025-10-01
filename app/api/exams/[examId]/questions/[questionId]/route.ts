import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { isDevFeaturesEnabled } from '@/lib/feature-flags';
import { getDb, getQuestionsCollectionName, getQuestionEmbeddingsCollectionName } from '@/lib/server/mongodb';
import type { ExternalQuestion } from '@/types/external-question';

type RouteParams = {
  params: Promise<{ examId: string; questionId: string }>;
};

export async function DELETE(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  let questionId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;
    questionId = params.questionId;

    if (!isDevFeaturesEnabled()) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
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
    const params = await context.params;
    examId = params.examId;
    questionId = params.questionId;

    if (!isDevFeaturesEnabled()) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    if (!ObjectId.isValid(questionId)) {
      return NextResponse.json({ error: 'Invalid question ID format' }, { status: 400 });
    }

    let payload: ExternalQuestion & { id: string };
    try {
      payload = (await request.json()) as ExternalQuestion & { id: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
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
      study: payload.study,
      updatedAt: new Date(),
    };

    const doc = await qCol.findOneAndUpdate(
      { _id: new ObjectId(questionId), examId },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );

    if (!doc) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Return the updated question in external format
    const responseBody: ExternalQuestion & { id: string } = {
      id: doc._id.toString(),
      question: doc.question,
      options: doc.options,
      answer: doc.answer,
      question_type: doc.question_type,
      explanation: doc.explanation,
      study: doc.study,
    };

    return NextResponse.json(responseBody, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Patch question failed examId=${examId} id=${questionId}`, error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
