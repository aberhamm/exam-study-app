/**
 * Generate Question Explanations
 *
 * Purpose
 * - Generate explanations for questions that don't have them (or regenerate all if --recompute)
 * - Uses the same explanation generation logic as the UI for consistency
 *
 * Flags
 * - --exam <id>       Limit to a specific exam
 * - --limit <n>       Cap number of questions processed
 * - --batch <n>       Batch size for processing (default 10)
 * - --concurrency <n> Number of concurrent generations per batch (default 3)
 * - --delay <ms>      Delay between batches in milliseconds (default 2000)
 * - --recompute       Regenerate explanations even if present (otherwise, generate missing only)
 * - --verbose         Show generated explanation text in output
 *
 * Env
 * - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - OPENAI_API_KEY, OPENROUTER_API_KEY
 * - All explanation generator environment variables
 *
 * Usage
 * - pnpm generate:explanations
 * - pnpm generate:explanations --exam sitecore-xmc --batch 15 --concurrency 5 --delay 3000
 * - pnpm generate:explanations --recompute --limit 50
 * - pnpm generate:explanations --verbose --limit 10 --concurrency 2
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';
import { generateQuestionExplanation } from '../lib/server/explanation-generator.js';
import { normalizeQuestions } from '../lib/normalize.js';
import type { ExternalQuestion } from '../types/external-question.js';

// ---------------------------------------------------------------------------
// Supabase client (service role — full access to quiz schema)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).schema('quiz');
}

// ---------------------------------------------------------------------------
// Types (Supabase row shapes)
// ---------------------------------------------------------------------------

type QuestionRow = {
  id: string;
  exam_id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: string | string[];
  question_type: 'single' | 'multiple' | null;
  explanation: string | null;
  explanation_generated_by_ai: boolean | null;
  explanation_sources: unknown;
  explanation_history: unknown[] | null;
  study: ExternalQuestion['study'] | null;
  embedding: number[] | null;
};

type ExamRow = {
  exam_id: string;
  document_groups: string[] | null;
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const params: {
    exam?: string;
    limit?: number;
    recompute?: boolean;
    batch?: number;
    concurrency?: number;
    delay?: number;
    verbose?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') params.exam = args[++i];
    else if (a === '--limit') params.limit = Number(args[++i]);
    else if (a === '--recompute') params.recompute = true;
    else if (a === '--batch') params.batch = Number(args[++i]);
    else if (a === '--concurrency') params.concurrency = Number(args[++i]);
    else if (a === '--delay') params.delay = Number(args[++i]);
    else if (a === '--verbose') params.verbose = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: pnpm generate:explanations [--exam <examId>] [--limit <n>] [--batch <n>] [--concurrency <n>] [--delay <ms>] [--recompute] [--verbose]`
      );
      process.exit(0);
    }
  }
  return params;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { exam, limit, recompute, batch, concurrency, delay, verbose } = parseArgs();
  const batchSize = batch && batch > 0 ? batch : 10;
  const concurrencyLimit = concurrency && concurrency > 0 ? concurrency : 3;
  const delayMs = delay && delay > 0 ? delay : 2000;

  const db = getSupabaseClient();

  // Build the select query for questions to process
  let query = db
    .from('questions')
    .select(
      'id, exam_id, question, options, answer, question_type, explanation, explanation_generated_by_ai, explanation_sources, explanation_history, study, embedding'
    )
    .order('exam_id', { ascending: true })
    .order('id', { ascending: true });

  if (exam) {
    query = query.eq('exam_id', exam);
  }

  if (!recompute) {
    // Only fetch questions without explanations
    query = query.or('explanation.is.null,explanation.eq.');
  }

  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit);
  }

  const { data: rows, error: fetchError } = await query.returns<QuestionRow[]>();

  if (fetchError) {
    throw new Error(`Failed to fetch questions: ${fetchError.message}`);
  }

  const toProcess = rows ?? [];

  console.log(`\nFound ${toProcess.length} question${toProcess.length === 1 ? '' : 's'} to process`);
  console.log(`Processing with concurrency: ${concurrencyLimit}`);

  if (toProcess.length === 0) {
    console.log('No questions to process. Exiting.');
    return;
  }

  // Cache exam document_groups to avoid repeated lookups
  const examCache = new Map<string, string[] | undefined>();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ questionId: string; examId: string; error: string }> = [];

  // Process questions in batches with controlled concurrency
  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batchDocs = toProcess.slice(i, i + batchSize);

    console.log(
      `\n--- Processing batch ${Math.floor(i / batchSize) + 1} (questions ${i + 1}-${Math.min(i + batchSize, toProcess.length)}) ---`
    );

    for (let j = 0; j < batchDocs.length; j += concurrencyLimit) {
      const concurrentDocs = batchDocs.slice(j, j + concurrencyLimit);

      const promises = concurrentDocs.map(async (doc, indexInConcurrentBatch) => {
        const questionId = doc.id;
        const examId = doc.exam_id;
        const questionNumber = i + j + indexInConcurrentBatch + 1;

        try {
          // Get exam document_groups (from cache or Supabase)
          if (!examCache.has(examId)) {
            const { data: examData } = await db
              .from('exams')
              .select('exam_id, document_groups')
              .eq('exam_id', examId)
              .maybeSingle<ExamRow>();

            examCache.set(examId, examData?.document_groups ?? undefined);
          }

          const documentGroups = examCache.get(examId);

          // Build external question format for normalizer
          const externalQuestion: ExternalQuestion = {
            id: questionId,
            question: doc.question,
            options: doc.options,
            answer: doc.answer as ExternalQuestion['answer'],
            question_type: doc.question_type ?? undefined,
            explanation: doc.explanation ?? undefined,
            study: doc.study ?? undefined,
          };

          const [normalizedQuestion] = normalizeQuestions([externalQuestion]);

          console.log(
            `  [${questionNumber}/${toProcess.length}] Generating explanation for question ${questionId} (exam: ${examId})`
          );

          const result = await generateQuestionExplanation(
            normalizedQuestion,
            documentGroups,
            doc.embedding ?? undefined
          );

          // Build explanation history entry when recomputing an existing explanation
          let explanationHistory = doc.explanation_history ?? [];

          if (
            recompute &&
            typeof doc.explanation === 'string' &&
            doc.explanation.trim().length > 0
          ) {
            explanationHistory = [
              ...(explanationHistory as unknown[]),
              {
                id: crypto.randomUUID(),
                savedAt: new Date().toISOString(),
                savedBy: null, // script context — no user
                aiGenerated: doc.explanation_generated_by_ai,
                reason: 'recompute',
                explanation: doc.explanation,
                sources: doc.explanation_sources,
              },
            ];
          }

          // Persist explanation + sources back to quiz.questions
          const { error: updateError } = await db
            .from('questions')
            .update({
              explanation: result.explanation,
              explanation_generated_by_ai: true,
              explanation_sources: result.sources,
              explanation_history: explanationHistory,
            })
            .eq('id', questionId);

          if (updateError) {
            throw new Error(`Supabase update failed: ${updateError.message}`);
          }

          console.log(
            `  [OK] ${questionId} (${result.explanation.length} chars, ${result.sources.length} sources)`
          );

          if (verbose) {
            console.log('  Explanation:');
            console.log('  ' + '-'.repeat(60));
            doc.explanation
              ?.split('\n')
              .forEach(line => console.log('  ' + line));
            result.explanation.split('\n').forEach(line => console.log('  ' + line));
            console.log('  ' + '-'.repeat(60));
          }

          return { success: true, questionId, examId };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`  [FAIL] ${questionId}: ${errorMsg}`);
          return { success: false, questionId, examId, error: errorMsg };
        }
      });

      const results = await Promise.allSettled(promises);

      results.forEach(result => {
        processed++;
        if (result.status === 'fulfilled') {
          const value = result.value;
          if (value.success) {
            succeeded++;
          } else {
            failed++;
            errors.push({
              questionId: value.questionId,
              examId: value.examId,
              error: value.error || 'Unknown error',
            });
          }
        } else {
          failed++;
        }
      });
    }

    // Delay between batches to avoid rate limits (except after last batch)
    if (i + batchSize < toProcess.length) {
      console.log(`\nWaiting ${delayMs}ms before next batch...`);
      await sleep(delayMs);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total processed: ${processed}`);
  console.log(`Succeeded:       ${succeeded}`);
  console.log(`Failed:          ${failed}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors) {
      console.log(`  - Question ${err.questionId} (exam: ${err.examId}): ${err.error}`);
    }
  }

  console.log('\nDone.');
}

main()
  .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Script failed with error:', err);
    process.exit(1);
  });
