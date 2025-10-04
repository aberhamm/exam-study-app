import { NextResponse } from 'next/server';
import { fetchExamDetail, getExamCacheTag } from '@/lib/server/questions';
import { ExamDetailZ, coerceExamDetail } from '@/lib/validation';
import type { ExamDetailResponse } from '@/types/api';
import { envConfig } from '@/lib/env-config';

type RouteParams = {
  params: Promise<{
    examId: string;
  }>;
};

type ExamPatchBody = {
  documentGroups?: string[];
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

export async function PATCH(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    // Check if dev features are enabled
    if (!envConfig.features.devFeaturesEnabled) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    let body: ExamPatchBody | null = null;
    try {
      body = (await request.json()) as ExamPatchBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Update exam in database
    const { getDb, getExamsCollectionName } = await import('@/lib/server/mongodb');
    const db = await getDb();
    const collection = db.collection(getExamsCollectionName());

    const updateFields: Record<string, unknown> = {};
    if (body?.documentGroups !== undefined) {
      updateFields.documentGroups = body.documentGroups;
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const result = await collection.updateOne(
      { examId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: `Exam "${examId}" not found` }, { status: 404 });
    }

    // Fetch updated exam
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
