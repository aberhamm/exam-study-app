import { NextResponse } from 'next/server';
import { fetchExamById } from '@/lib/server/exams';
import { ExternalQuestionsFileZ } from '@/lib/validation';
import type { ExamDetailResponse } from '@/types/api';

type RouteParams = {
  params: Promise<{
    examId: string;
  }>;
};

export async function GET(_request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;
    const exam = await fetchExamById(examId);
    if (!exam) {
      return NextResponse.json(
        { error: `Exam "${examId}" not found` },
        { status: 404 }
      );
    }

    const parsed = ExternalQuestionsFileZ.parse(exam) as ExamDetailResponse;
    return NextResponse.json(parsed, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error(`Failed to fetch exam ${examId}`, error);
    return NextResponse.json(
      { error: 'Failed to fetch exam' },
      { status: 500 }
    );
  }
}
