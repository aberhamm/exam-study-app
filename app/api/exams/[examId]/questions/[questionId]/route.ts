import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ExternalQuestionUpdateZ } from '@/lib/validation';
import { getQuestionById, updateQuestion } from '@/lib/server/questions';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface RouteContext {
  params: Promise<{
    examId: string;
    questionId: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Not allowed' },
      { status: 403 }
    );
  }
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

    if (!isRecord(body)) {
      return NextResponse.json(
        { error: 'Invalid question payload' },
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

    const existing = await getQuestionById(examId, questionId);
    if (!existing) {
      return NextResponse.json(
        { error: `Question "${questionId}" not found in exam "${examId}"` },
        { status: 404 }
      );
    }

    const merged = {
      ...existing,
      question: payload.question,
      options: payload.options,
      answer: payload.answer,
      question_type: payload.question_type,
      explanation: payload.explanation,
      study: payload.study,
    };

    const updated = await updateQuestion(examId, merged);
    return NextResponse.json(updated, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to update question ${questionId} for exam ${examId}`, error);
    return NextResponse.json(
      { error: 'Failed to update question', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
