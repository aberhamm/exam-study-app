import { NextResponse } from 'next/server';
import { fetchExamDetail, getExamCacheTag } from '@/lib/server/questions';
import { ExamDetailZ, coerceExamDetail } from '@/lib/validation';
import type { ExamDetailResponse } from '@/types/api';

type RouteParams = {
  params: Promise<{
    examId: string;
  }>;
};

export async function GET(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;
    // Conditional GET via ETag
    const etag = await getExamCacheTag(examId);
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    const examRaw = await fetchExamDetail(examId);
    if (!examRaw) {
      return NextResponse.json(
        { error: `Exam "${examId}" not found` },
        { status: 404 }
      );
    }

    const coerced = coerceExamDetail(examRaw);
    const parsed = ExamDetailZ.parse(coerced) as ExamDetailResponse;
    const headers: Record<string, string> = { ETag: etag };
    if (process.env.NODE_ENV === 'development') {
      headers['Cache-Control'] = 'no-store';
    } else {
      headers['Cache-Control'] = 'public, max-age=60, stale-while-revalidate=60';
    }
    return NextResponse.json(parsed, { headers });
  } catch (error) {
    console.error(`Failed to fetch exam ${examId}`, error);
    return NextResponse.json(
      { error: 'Failed to fetch exam' },
      { status: 500 }
    );
  }
}
