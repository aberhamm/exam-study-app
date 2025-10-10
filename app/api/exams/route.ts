import { NextResponse } from 'next/server';
import { listExamSummaries } from '@/lib/server/exams';
import type { ExamsListResponse } from '@/types/api';

export async function GET() {
  try {
    const exams = await listExamSummaries();
    const payload: ExamsListResponse = { exams };
    return NextResponse.json(
      payload,
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Failed to list exams', error);
    return NextResponse.json(
      { error: 'Failed to list exams' },
      { status: 500 }
    );
  }
}
