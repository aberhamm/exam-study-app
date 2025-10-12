import { NextResponse } from 'next/server';
import {
  fetchCompetenciesByExamId,
  createCompetency,
  getCompetencyAssignmentStats,
} from '@/lib/server/competencies';
import { CompetencyCreateZ } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';

type RouteParams = { params: Promise<{ examId: string }> };

export async function GET(request: Request, context: RouteParams) {
  try {
    const params = await context.params;
    const examId = params.examId;

    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('includeStats') === 'true';

    const competencies = await fetchCompetenciesByExamId(examId);

    if (includeStats) {
      const stats = await getCompetencyAssignmentStats(examId);
      const competenciesWithStats = competencies.map((comp) => {
        const stat = stats.find((s) => s.competencyId === comp.id);
        return {
          ...comp,
          questionCount: stat?.questionCount ?? 0,
        };
      });
      return NextResponse.json({ competencies: competenciesWithStats });
    }

    return NextResponse.json({ competencies });
  } catch (error) {
    console.error('Failed to fetch competencies:', error);
    return NextResponse.json({ error: 'Failed to fetch competencies' }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteParams) {
  try {
    // Require admin authentication
    try {
      await requireAdmin();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const params = await context.params;
    const examId = params.examId;

    const json = await request.json().catch(() => ({}));
    const input = CompetencyCreateZ.parse(json);

    // TODO: Validate that total examPercentage doesn't exceed 100% across all competencies
    // const existingCompetencies = await fetchCompetenciesByExamId(examId);
    // const totalPercentage = existingCompetencies.reduce((sum, c) => sum + c.examPercentage, 0) + input.examPercentage;
    // if (totalPercentage > 100) {
    //   return NextResponse.json({ error: 'Total exam percentage cannot exceed 100%' }, { status: 400 });
    // }

    const competency = await createCompetency({
      examId,
      title: input.title,
      description: input.description,
      examPercentage: input.examPercentage,
    });

    return NextResponse.json({ competency }, { status: 201 });
  } catch (error) {
    console.error('Failed to create competency:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create competency' }, { status: 500 });
  }
}
