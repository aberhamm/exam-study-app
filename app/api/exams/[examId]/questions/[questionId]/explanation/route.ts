import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb, getQuestionsCollectionName } from '@/lib/server/mongodb';
import { requireAdmin } from '@/lib/auth';

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

    // Remove the explanation and explanationGeneratedByAI flag
    const result = await qCol.findOneAndUpdate(
      { _id: new ObjectId(questionId), examId },
      {
        $unset: {
          explanation: '',
          explanationGeneratedByAI: ''
        },
        $set: {
          updatedAt: new Date()
        }
      },
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
