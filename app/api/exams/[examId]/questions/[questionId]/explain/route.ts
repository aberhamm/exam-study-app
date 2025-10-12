import { NextResponse } from 'next/server';
import { generateQuestionExplanation } from '@/lib/server/explanation-generator';
import { getQuestionById } from '@/lib/server/questions';
import { normalizeQuestions } from '@/lib/normalize';
import { requireAdmin } from '@/lib/auth';

type RouteParams = {
  params: Promise<{
    examId: string;
    questionId: string;
  }>;
};

// No request body needed - endpoint only generates explanations

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  let questionId = 'unknown';

  try {
    const params = await context.params;
    examId = params.examId;
    questionId = params.questionId;

    // Get the question first to check if it has an explanation
    const questionDoc = await getQuestionById(examId, questionId);
    if (!questionDoc) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    // Only require admin auth if the question already has an explanation
    // (for regenerating/replacing existing explanations)
    const hasExistingExplanation = questionDoc.explanation && questionDoc.explanation.trim().length > 0;
    if (hasExistingExplanation) {
      try {
        await requireAdmin();
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Forbidden' },
          { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
    }

    // Get the exam to access documentGroups
    const { fetchExamById } = await import('@/lib/server/exams');
    const exam = await fetchExamById(examId);
    const documentGroups = exam?.documentGroups;

    // Normalize the question to the format expected by the explanation generator
    const [normalizedQuestion] = normalizeQuestions([questionDoc]);

    // Generate the explanation
    console.info(`[explain] Generating explanation for question ${questionId} in exam ${examId}, documentGroups=${documentGroups?.join(',') || 'all'}`);
    console.info(`[explain] Question details:`, {
      id: normalizedQuestion.id,
      prompt: normalizedQuestion.prompt.substring(0, 100) + '...',
      questionType: normalizedQuestion.questionType,
      hasExistingExplanation: !!normalizedQuestion.explanation,
      choicesCount: normalizedQuestion.choices.length,
    });

    const result = await generateQuestionExplanation(normalizedQuestion, documentGroups, questionDoc.embedding);

    console.info(`[explain] Generated explanation result:`, {
      explanationLength: result.explanation.length,
      sourcesCount: result.sources.length,
      sources: result.sources.map(s => ({ sourceFile: s.sourceFile, title: s.title, hasUrl: !!s.url })),
    });

    // Auto-save if no existing explanation
    let savedAsDefault = false;

    if (!hasExistingExplanation) {
      try {
        const { updateQuestion } = await import('@/lib/server/questions');
        const updatedQuestion = {
          ...questionDoc,
          explanation: result.explanation,
          explanationGeneratedByAI: true,
        };
        await updateQuestion(examId, questionId, updatedQuestion);
        savedAsDefault = true;
        console.info(`[explain] Auto-saved explanation as default for question ${questionId} (no existing explanation)`);
      } catch (updateError) {
        console.error(`[explain] Failed to auto-save explanation:`, updateError);
        // Don't fail the request if saving fails, just don't set savedAsDefault
      }
    }

    return NextResponse.json({
      success: true,
      explanation: result.explanation,
      sources: result.sources,
      savedAsDefault,
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