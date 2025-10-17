import { NextResponse } from 'next/server';
import { generateQuestionExplanation, generateQuestionExplanationWithDebug } from '@/lib/server/explanation-generator';
import { getQuestionById } from '@/lib/server/questions';
import { normalizeQuestions } from '@/lib/normalize';
import { requireAdmin } from '@/lib/auth';
import { acquireLlmSlot } from '@/lib/server/llm-guard';
import type { ExplainResponse } from '@/types/api';

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

    // Require admin for any explanation generation (LLM usage gated to admins).
    // Defense-in-depth: middleware protects this route as well.
    let adminUser: { id: string; username: string } | null = null;
    try {
      const user = await requireAdmin();
      adminUser = { id: user.id, username: user.username };
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    // Get the question first to check if it has an explanation
    const questionDoc = await getQuestionById(examId, questionId);
    if (!questionDoc) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    // Get the exam to access documentGroups
    const { fetchExamById } = await import('@/lib/server/exams');
    const exam = await fetchExamById(examId);
    const documentGroups = exam?.documentGroups;

    // Normalize the question to the format expected by the explanation generator
    const [normalizedQuestion] = normalizeQuestions([questionDoc]);

    // Determine if debug is requested
    const url = new URL(request.url);
    const debugQuery = url.searchParams.get('debug');
    const debugHeader = request.headers.get('x-debug');
    const debugEnabled = debugQuery === '1' || debugHeader === '1';

    // Generate the explanation
    console.info(`[explain] Generating explanation for question ${questionId} in exam ${examId}, documentGroups=${documentGroups?.join(',') || 'all'}, debug=${debugEnabled}`);
    console.info(`[explain] Question details:`, {
      id: normalizedQuestion.id,
      prompt: normalizedQuestion.prompt.substring(0, 100) + '...',
      questionType: normalizedQuestion.questionType,
      hasExistingExplanation: !!normalizedQuestion.explanation,
      choicesCount: normalizedQuestion.choices.length,
    });

    // Acquire per-admin LLM slot to control concurrency and rate.
    // Always release in finally to avoid slot leaks on errors/timeouts.
    const guard = acquireLlmSlot(adminUser!.id);
    let result: { explanation: string; sources: Array<{ url?: string; title?: string; sourceFile: string; sectionPath?: string }>; debug?: ExplainResponse['debug'] };
    try {
      if (debugEnabled) {
        result = await generateQuestionExplanationWithDebug(normalizedQuestion, documentGroups, questionDoc.embedding);
      } else {
        result = await generateQuestionExplanation(normalizedQuestion, documentGroups, questionDoc.embedding);
      }
    } finally {
      guard.release();
    }

    console.info(`[explain] Generated explanation result:`, {
      explanationLength: result.explanation.length,
      sourcesCount: result.sources.length,
      sources: result.sources.map(s => ({ sourceFile: s.sourceFile, title: s.title, hasUrl: !!s.url })),
    });

    // Auto-save if no existing explanation
    let savedAsDefault = false;

    if (!(questionDoc.explanation && questionDoc.explanation.trim().length > 0)) {
      try {
        const { updateQuestion } = await import('@/lib/server/questions');
        const updatedQuestion = {
          ...questionDoc,
          explanation: result.explanation,
          explanationGeneratedByAI: true,
          explanationSources: result.sources,
        };
        await updateQuestion(examId, questionId, updatedQuestion);
        savedAsDefault = true;
        console.info(`[explain] Auto-saved explanation as default for question ${questionId} (no existing explanation)`);
      } catch (updateError) {
        console.error(`[explain] Failed to auto-save explanation:`, updateError);
        // Don't fail the request if saving fails, just don't set savedAsDefault
      }
    }

    const payload: ExplainResponse = {
      success: true,
      explanation: result.explanation,
      sources: result.sources,
      savedAsDefault,
      ...(debugEnabled ? { debug: result.debug } : {}),
    };

    return NextResponse.json(payload, {
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
