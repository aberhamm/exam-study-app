import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/server/db';
import type { ExternalQuestion } from '@/types/external-question';
import { normalizeQuestions } from '@/lib/normalize';
import { ExplanationSourceZ } from '@/lib/validation';
import type { ExplanationSource } from '@/types/explanation';

// Contract for the prepare endpoint. See inline docs below for sampling behavior.
/**
 * Prepare exam questions for a session.
 *
 * Options:
 * - `avoidSimilar` (boolean): when true, filter sampled questions to avoid selecting
 *   multiple items that belong to the same cluster for the same exam attempt.
 *   NOTE: cluster filtering is not yet migrated to Supabase; this flag is accepted
 *   but has no effect — questions are returned without cluster deduplication and
 *   excludedBySimilarity will always be 0.
 * - `similarityPolicy` (enum):
 *   - 'duplicates-only' (default): (reserved for future cluster filtering)
 *   - 'all-clustered': (reserved for future cluster filtering)
 */
const StartRequestZ = z.object({
  questionType: z.enum(['all', 'single', 'multiple']).default('all'),
  explanationFilter: z.enum(['all', 'with-explanations', 'without-explanations']).default('all'),
  questionCount: z.number().int().min(1).max(1000).default(50),
  competencyFilter: z.string().optional(),
  excludeQuestionIds: z.array(z.string()).optional(),
  balancedByCompetency: z.boolean().optional().default(false),
  avoidSimilar: z.boolean().optional().default(false),
  similarityPolicy: z.enum(['duplicates-only', 'all-clustered']).optional().default('duplicates-only'),
});

type RouteParams = { params: Promise<{ examId: string }> };

// Columns to select — intentionally excludes embedding vectors
const QUESTION_SELECT =
  'id, exam_id, question, options, answer, question_type, explanation, explanation_generated_by_ai, explanation_sources, study, competency_ids, flagged_for_review';

type QuestionRow = {
  id: string;
  exam_id: string;
  question: string;
  options: ExternalQuestion['options'];
  answer: ExternalQuestion['answer'];
  question_type: string | null;
  explanation: string | null;
  explanation_generated_by_ai: boolean | null;
  explanation_sources: unknown;
  study: ExternalQuestion['study'] | null;
  competency_ids: string[] | null;
  flagged_for_review: boolean | null;
};

/** Fisher-Yates shuffle — returns a new array, does not mutate the original. */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Returns true when the row has a non-empty explanation string. */
function hasExplanation(row: QuestionRow): boolean {
  return typeof row.explanation === 'string' && row.explanation.trim().length > 0;
}

/** Parse explanation_sources from the DB, discarding entries that fail validation. */
function parseExplanationSources(raw: unknown): ExplanationSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed = raw
    .map((s) => ExplanationSourceZ.safeParse(s))
    .filter((r): r is { success: true; data: ExplanationSource } => r.success)
    .map((r) => r.data);
  return parsed.length > 0 ? parsed : undefined;
}

/** Map a DB row to the ExternalQuestion shape expected by the client. */
function rowToExternal(
  row: QuestionRow,
  compMap: Map<string, { id: string; title: string }>,
): ExternalQuestion & { id: string } {
  return {
    id: row.id,
    question: row.question,
    options: row.options,
    answer: row.answer,
    question_type: (row.question_type as 'single' | 'multiple' | undefined) ?? 'single',
    explanation: row.explanation ?? undefined,
    explanationGeneratedByAI: row.explanation_generated_by_ai ?? undefined,
    explanationSources: parseExplanationSources(row.explanation_sources),
    study: row.study ?? undefined,
    competencyIds: row.competency_ids ?? undefined,
    competencies: (row.competency_ids ?? [])
      .map((cid) => compMap.get(cid))
      .filter((c): c is { id: string; title: string } => !!c),
  };
}

/** Apply the explanation filter to a pool of rows in JS. */
function applyExplanationFilter(
  pool: QuestionRow[],
  filter: 'all' | 'with-explanations' | 'without-explanations',
): QuestionRow[] {
  if (filter === 'with-explanations') return pool.filter(hasExplanation);
  if (filter === 'without-explanations') return pool.filter((r) => !hasExplanation(r));
  return pool;
}

export async function POST(request: Request, context: RouteParams) {
  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    const json = await request.json().catch(() => ({}));
    const input = StartRequestZ.parse(json);

    const db = getDb();

    // Fetch competency metadata for the exam upfront — needed for both balanced
    // sampling and for embedding competency titles in the response.
    const { data: competencies } = await db
      .from('competencies')
      .select('id, title')
      .eq('exam_id', examId);
    const compMap = new Map(
      (competencies ?? []).map((c) => [c.id, { id: c.id, title: c.title }]),
    );

    // TODO: cluster filtering not yet migrated to Supabase.
    // When avoidSimilar is true we accept the option but cannot filter by cluster
    // membership. excludedBySimilarity is always 0 until clusters are migrated.
    const excludedBySimilarity = 0;

    // Whether to use balanced-by-competency sampling.
    // Only meaningful when not already scoped to a single competency.
    const useBalanced =
      input.balancedByCompetency &&
      (!input.competencyFilter || input.competencyFilter === 'all');

    // -----------------------------------------------------------------
    // Balanced-by-competency sampling
    // -----------------------------------------------------------------
    if (useBalanced && (competencies ?? []).length > 0) {
      const comps = competencies!;
      const k = comps.length;
      const base = Math.floor(input.questionCount / k);
      let remainder = input.questionCount - base * k;

      const seen = new Set<string>();
      const results: QuestionRow[] = [];

      for (const comp of comps) {
        const take = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        if (take <= 0) continue;

        // Build per-competency query
        let compQuery = db
          .from('questions')
          .select(QUESTION_SELECT)
          .eq('exam_id', examId)
          .contains('competency_ids', [comp.id]);

        if (input.questionType === 'single') compQuery = compQuery.eq('question_type', 'single');
        if (input.questionType === 'multiple') compQuery = compQuery.eq('question_type', 'multiple');

        // Exclude globally excluded IDs and already-selected IDs
        const allExclude = new Set<string>([
          ...(input.excludeQuestionIds ?? []),
          ...seen,
        ]);
        if (allExclude.size > 0) {
          compQuery = compQuery.not('id', 'in', `(${Array.from(allExclude).join(',')})`);
        }

        const { data: compRows, error: compErr } = await compQuery;
        if (compErr) {
          console.error(`Failed to fetch questions for competency ${comp.id}`, compErr);
          continue;
        }

        // Apply explanation filter in JS (text field)
        const pool = applyExplanationFilter(compRows ?? [], input.explanationFilter);

        // Shuffle and take at most 'take' questions from this competency slice
        for (const row of shuffleArray(pool).slice(0, take)) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            results.push(row);
          }
        }
      }

      // Fill from the general pool if balanced sampling left us short
      if (results.length < input.questionCount) {
        const remaining = input.questionCount - results.length;

        let fillQuery = db
          .from('questions')
          .select(QUESTION_SELECT)
          .eq('exam_id', examId);

        if (input.questionType === 'single') fillQuery = fillQuery.eq('question_type', 'single');
        if (input.questionType === 'multiple') fillQuery = fillQuery.eq('question_type', 'multiple');

        const allExclude = new Set<string>([
          ...(input.excludeQuestionIds ?? []),
          ...seen,
        ]);
        if (allExclude.size > 0) {
          fillQuery = fillQuery.not('id', 'in', `(${Array.from(allExclude).join(',')})`);
        }

        const { data: fillRows, error: fillErr } = await fillQuery;
        if (fillErr) {
          console.error(`Failed to fetch fill questions for exam ${examId}`, fillErr);
        } else {
          const pool = applyExplanationFilter(fillRows ?? [], input.explanationFilter);
          for (const row of shuffleArray(pool).slice(0, remaining)) {
            if (!seen.has(row.id)) {
              seen.add(row.id);
              results.push(row);
            }
          }
        }
      }

      const external: ExternalQuestion[] = results
        .slice(0, input.questionCount)
        .map((row) => rowToExternal(row, compMap));

      const normalized = normalizeQuestions(external);
      return NextResponse.json(
        { examId, count: normalized.length, excludedBySimilarity, questions: normalized },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // -----------------------------------------------------------------
    // Default (non-balanced) sampling
    // -----------------------------------------------------------------
    let query = db.from('questions').select(QUESTION_SELECT).eq('exam_id', examId);

    if (input.questionType === 'single') query = query.eq('question_type', 'single');
    if (input.questionType === 'multiple') query = query.eq('question_type', 'multiple');

    if (input.competencyFilter && input.competencyFilter !== 'all') {
      query = query.contains('competency_ids', [input.competencyFilter]);
    }

    // Exclude already-seen question IDs (UUIDs — no ObjectId conversion needed)
    if ((input.excludeQuestionIds ?? []).length > 0) {
      query = query.not('id', 'in', `(${input.excludeQuestionIds!.join(',')})`);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error(`Failed to fetch questions for exam ${examId}`, error);
      return NextResponse.json({ error: 'Failed to prepare questions' }, { status: 500 });
    }

    // Apply explanation filter in JS, then shuffle and take the requested count.
    // With 652 total rows this is perfectly efficient.
    const pool = applyExplanationFilter(rows ?? [], input.explanationFilter);
    const sampled = shuffleArray(pool).slice(0, input.questionCount);

    const external: ExternalQuestion[] = sampled.map((row) => rowToExternal(row, compMap));
    const normalized = normalizeQuestions(external);

    return NextResponse.json(
      { examId, count: normalized.length, excludedBySimilarity, questions: normalized },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(`Failed to prepare questions for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to prepare questions' }, { status: 500 });
  }
}
