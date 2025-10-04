import { NextResponse } from 'next/server';
import { envConfig } from '@/lib/env-config';
import { generateQuestionExplanation } from '@/lib/server/explanation-generator';
import { getQuestionById } from '@/lib/server/questions';
import { normalizeQuestions } from '@/lib/normalize';

type RouteParams = {
  params: Promise<{
    examId: string;
    questionId: string;
  }>;
};

type ExplainRequestBody = {
  saveAsDefault?: boolean;
};

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  let questionId = 'unknown';

  try {
    const params = await context.params;
    examId = params.examId;
    questionId = params.questionId;

    // Check if dev features are enabled
    if (!envConfig.features.devFeaturesEnabled) {
      return NextResponse.json(
        { error: 'Explanation generation is not available' },
        { status: 403 }
      );
    }

    // Parse request body
    let body: ExplainRequestBody | null = null;
    try {
      body = (await request.json()) as ExplainRequestBody;
    } catch {
      // Empty body is fine, we'll use defaults
      body = {};
    }

    // Get the question from database
    const questionDoc = await getQuestionById(examId, questionId);
    if (!questionDoc) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    // Normalize the question to the format expected by the explanation generator
    const [normalizedQuestion] = normalizeQuestions([questionDoc]);

    // Generate the explanation
    console.info(`[explain] Generating explanation for question ${questionId} in exam ${examId}`);
    console.info(`[explain] Question details:`, {
      id: normalizedQuestion.id,
      prompt: normalizedQuestion.prompt.substring(0, 100) + '...',
      questionType: normalizedQuestion.questionType,
      hasExistingExplanation: !!normalizedQuestion.explanation,
      choicesCount: normalizedQuestion.choices.length,
    });

    const result = await generateQuestionExplanation(normalizedQuestion);

    console.info(`[explain] Generated explanation result:`, {
      explanationLength: result.explanation.length,
      sourcesCount: result.sources.length,
      sources: result.sources.map(s => ({ sourceFile: s.sourceFile, title: s.title, hasUrl: !!s.url })),
    });

    // If saveAsDefault is true, update the question in the database
    if (body?.saveAsDefault) {
      try {
        const { updateQuestion } = await import('@/lib/server/questions');
        const updatedQuestion = {
          ...questionDoc,
          explanation: result.explanation,
          explanationGeneratedByAI: true,
        };
        await updateQuestion(examId, questionId, updatedQuestion);
        console.info(`[explain] Saved explanation as default for question ${questionId}`);
      } catch (updateError) {
        console.error(`[explain] Failed to save explanation as default:`, updateError);
        // Don't fail the whole request if saving fails
      }
    }

    return NextResponse.json({
      success: true,
      explanation: result.explanation,
      sources: result.sources,
      savedAsDefault: body?.saveAsDefault || false,
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });

  } catch (error) {
    console.error(`[explain] Failed to generate explanation for question ${questionId} in exam ${examId}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to generate explanation';

    return NextResponse.json(
      {
        error: errorMessage,
        success: false
      },
      { status: 500 }
    );
  }
}