import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assignCompetenciesToQuestion,
  unassignCompetenciesFromQuestion,
} from '@/lib/server/competency-assignment';

type RouteParams = { params: Promise<{ examId: string; questionId: string }> };

const AssignCompetenciesRequestZ = z.object({
  competencyIds: z.array(z.string()).min(0),
});

export async function POST(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const { examId, questionId } = params;

    const json = await request.json().catch(() => ({}));
    const input = AssignCompetenciesRequestZ.parse(json);

    if (input.competencyIds.length === 0) {
      await unassignCompetenciesFromQuestion(questionId, examId);
    } else {
      await assignCompetenciesToQuestion(questionId, examId, input.competencyIds);
    }

    return NextResponse.json({
      success: true,
      competencyIds: input.competencyIds,
    });
  } catch (error) {
    console.error('Failed to assign competencies to question:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to assign competencies to question' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const { examId, questionId } = params;

    await unassignCompetenciesFromQuestion(questionId, examId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to unassign competencies from question:', error);
    return NextResponse.json(
      { error: 'Failed to unassign competencies from question' },
      { status: 500 }
    );
  }
}
