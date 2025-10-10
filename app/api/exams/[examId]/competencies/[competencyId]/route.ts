import { NextResponse } from 'next/server';
import {
  fetchCompetencyById,
  updateCompetency,
  deleteCompetency,
  CompetencyNotFoundError,
} from '@/lib/server/competencies';
import { CompetencyUpdateZ } from '@/lib/validation';

type RouteParams = { params: Promise<{ examId: string; competencyId: string }> };

export async function GET(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const { examId, competencyId } = params;

    const competency = await fetchCompetencyById(competencyId, examId);

    if (!competency) {
      return NextResponse.json({ error: 'Competency not found' }, { status: 404 });
    }

    return NextResponse.json({ competency });
  } catch (error) {
    console.error('Failed to fetch competency:', error);
    return NextResponse.json({ error: 'Failed to fetch competency' }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const { examId, competencyId } = params;

    const json = await request.json().catch(() => ({}));
    const updates = CompetencyUpdateZ.parse(json);

    const competency = await updateCompetency(competencyId, examId, updates);

    if (!competency) {
      return NextResponse.json({ error: 'Competency not found' }, { status: 404 });
    }

    return NextResponse.json({ competency });
  } catch (error) {
    console.error('Failed to update competency:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update competency' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const { examId, competencyId } = params;

    const deleted = await deleteCompetency(competencyId, examId);

    if (!deleted) {
      return NextResponse.json({ error: 'Competency not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete competency:', error);
    if (error instanceof CompetencyNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete competency' }, { status: 500 });
  }
}
