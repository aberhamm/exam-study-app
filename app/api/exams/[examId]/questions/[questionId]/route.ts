import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ExternalQuestionUpdateZ } from '@/lib/validation';
import { updateExamQuestion } from '@/lib/server/exams';

interface RouteContext {
  params: Promise<{
    examId: string;
    questionId: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  let examId = 'unknown';
  let questionId = 'unknown';

  try {
    const params = await context.params;
    examId = params.examId;
    questionId = params.questionId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    let payload;
    try {
      payload = ExternalQuestionUpdateZ.parse({ ...body, id: questionId });
    } catch (validationError) {
      if (validationError instanceof ZodError) {
        return NextResponse.json(
          { error: 'Invalid question payload', details: validationError.flatten() },
          { status: 400 }
        );
      }
      throw validationError;
    }

    const updated = await updateExamQuestion(examId, payload);
    if (!updated) {
      return NextResponse.json(
        { error: `Question "${questionId}" not found in exam "${examId}"` },
        { status: 404 }
      );
    }

    return NextResponse.json(updated, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to update question ${questionId} for exam ${examId}`, error);
    return NextResponse.json(
      { error: 'Failed to update question', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
