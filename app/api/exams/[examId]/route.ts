import { NextResponse } from 'next/server';
import { fetchExamDetail, getExamCacheTag } from '@/lib/server/questions';
import { ExamDetailZ, coerceExamDetail } from '@/lib/validation';
import type { ExamDetailResponse } from '@/types/api';
import type { WelcomeConfig } from '@/types/normalized';
import { getCurrentAppUser, requireAdmin } from '@/lib/auth-supabase';
import type { ExamDetail } from '@/types/external-question';
import { updateExam } from '@/lib/server/exams';

type RouteParams = {
  params: Promise<{
    examId: string;
  }>;
};

type ExamPatchBody = {
  documentGroups?: string[];
  examTitle?: string;
  welcomeConfig?: Partial<WelcomeConfig>;
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

    const [examRaw, appUser] = await Promise.all([
      fetchExamDetail(examId),
      getCurrentAppUser()
    ]);

    if (!examRaw) {
      return NextResponse.json(
        { error: `Exam "${examId}" not found` },
        { status: 404 }
      );
    }

    const sanitizedExam: ExamDetail = (() => {
      const isAdmin = appUser?.isAdmin === true;
      if (isAdmin) return examRaw;
      const sanitizedQuestions = examRaw.questions.map((question) => {
        const { flaggedForReview, flaggedReason, flaggedAt, flaggedBy, ...rest } = question;
        void flaggedForReview;
        void flaggedReason;
        void flaggedAt;
        void flaggedBy;
        return rest;
      });
      return { ...examRaw, questions: sanitizedQuestions };
    })();

    const coerced = coerceExamDetail(sanitizedExam);
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

export async function PATCH(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    // Require admin authentication
    try {
      await requireAdmin();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    let body: ExamPatchBody | null = null;
    try {
      body = (await request.json()) as ExamPatchBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (
      body?.documentGroups === undefined &&
      body?.examTitle === undefined &&
      body?.welcomeConfig === undefined
    ) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await updateExam(examId, {
      documentGroups: body?.documentGroups,
      examTitle: body?.examTitle,
      welcomeConfig: body?.welcomeConfig as Partial<WelcomeConfig> | undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: `Exam "${examId}" not found` }, { status: 404 });
    }

    // Fetch updated exam (with questions)
    const updatedExam = await fetchExamDetail(examId);
    if (!updatedExam) {
      return NextResponse.json({ error: 'Failed to fetch updated exam' }, { status: 500 });
    }

    const coerced = coerceExamDetail(updatedExam);
    const parsed = ExamDetailZ.parse(coerced) as ExamDetailResponse;

    return NextResponse.json(parsed, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error(`Failed to update exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to update exam' }, { status: 500 });
  }
}
