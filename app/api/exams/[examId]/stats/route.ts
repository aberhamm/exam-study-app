import { NextResponse } from 'next/server';
import { fetchExamById } from '@/lib/server/exams';
import { computeExamStats } from '@/lib/server/questions';
import type { ExamStatsResponse } from '@/types/api';

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

    const [exam, stats] = await Promise.all([
      fetchExamById(examId),
      computeExamStats(examId),
    ]);

    if (!exam) {
      return NextResponse.json(
        { error: `Exam "${examId}" not found` },
        { status: 404 }
      );
    }

    const payload: ExamStatsResponse = {
      examId,
      examTitle: exam.examTitle,
      welcomeConfig: exam.welcomeConfig,
      stats: {
        total: stats.total,
        byType: stats.byType,
        byExplanation: stats.byExplanation,
        matrix: stats.matrix,
      },
    };

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(`Failed to fetch stats for exam ${examId}`, error);
    return NextResponse.json(
      { error: 'Failed to fetch exam stats' },
      { status: 500 }
    );
  }
}

