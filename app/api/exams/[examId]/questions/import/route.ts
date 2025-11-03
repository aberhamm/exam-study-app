import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ExternalQuestionsImportZ } from '@/lib/validation';
import { addExamQuestions } from '@/lib/server/questions';
import { DuplicateQuestionIdsError, ExamNotFoundError } from '@/lib/server/exams';
import { requireAdmin } from '@/lib/auth-supabase';

interface RouteContext {
  params: Promise<{
    examId: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  let examId = 'unknown';

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const payload = ExternalQuestionsImportZ.parse(body);
    const inserted = await addExamQuestions(examId, payload.questions);

    // Return question IDs for post-processing
    const questionIds = inserted.map((q) => q._id.toString());

    return NextResponse.json(
      {
        examId,
        questions: inserted,
        insertedCount: inserted.length,
        questionIds,
      },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid question payload', details: error.flatten() },
        { status: 400 }
      );
    }

    if (error instanceof ExamNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    if (error instanceof DuplicateQuestionIdsError) {
      return NextResponse.json(
        { error: error.message, duplicates: error.duplicates },
        { status: 409 }
      );
    }

    console.error(`Failed to import questions for exam ${examId}`, error);
    return NextResponse.json(
      { error: 'Failed to import questions' },
      { status: 500 }
    );
  }
}
