import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isDevFeaturesEnabled } from '@/lib/feature-flags';
import {
  generateEmbeddingsForQuestions,
  assignCompetenciesToQuestions,
  type EmbeddingResult,
  type CompetencyAssignmentResult,
} from '@/lib/server/question-processing';

interface RouteContext {
  params: Promise<{
    examId: string;
  }>;
}

const ProcessRequestSchema = z.object({
  questionIds: z.array(z.string()).min(1, 'At least one question ID is required'),
  generateEmbeddings: z.boolean().default(false),
  assignCompetencies: z.boolean().default(false),
  competencyOptions: z
    .object({
      topN: z.number().min(1).max(10).default(1),
      threshold: z.number().min(0).max(1).default(0.5),
      overwrite: z.boolean().default(false),
    })
    .optional(),
});

type ProcessRequest = z.infer<typeof ProcessRequestSchema>;

export async function POST(request: Request, context: RouteContext) {
  if (!isDevFeaturesEnabled()) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  let examId = 'unknown';

  try {
    const params = await context.params;
    examId = params.examId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const payload = ProcessRequestSchema.parse(body);

    const results: {
      embeddings?: EmbeddingResult[];
      competencies?: CompetencyAssignmentResult[];
      summary: {
        totalQuestions: number;
        embeddingsGenerated?: number;
        embeddingsFailed?: number;
        competenciesAssigned?: number;
        competenciesFailed?: number;
      };
    } = {
      summary: {
        totalQuestions: payload.questionIds.length,
      },
    };

    // Step 1: Generate embeddings if requested
    if (payload.generateEmbeddings) {
      try {
        const embeddingResults = await generateEmbeddingsForQuestions(payload.questionIds);
        results.embeddings = embeddingResults;
        results.summary.embeddingsGenerated = embeddingResults.filter((r) => r.success).length;
        results.summary.embeddingsFailed = embeddingResults.filter((r) => !r.success).length;
      } catch (error) {
        return NextResponse.json(
          {
            error: 'Failed to generate embeddings',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }

    // Step 2: Assign competencies if requested
    if (payload.assignCompetencies) {
      try {
        const competencyResults = await assignCompetenciesToQuestions(
          examId,
          payload.questionIds,
          payload.competencyOptions
        );
        results.competencies = competencyResults;
        results.summary.competenciesAssigned = competencyResults.filter((r) => r.success).length;
        results.summary.competenciesFailed = competencyResults.filter((r) => !r.success).length;
      } catch (error) {
        return NextResponse.json(
          {
            error: 'Failed to assign competencies',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(results, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error(`Failed to process questions for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to process questions' }, { status: 500 });
  }
}
