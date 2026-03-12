/**
 * Apply Enriched Questions
 *
 * Reads the enriched output from the enrich-questions pipeline and updates
 * quiz.questions in Supabase for questions that have explanationSources.
 * Matches by (exam_id, question text). Skips questions with no explanationSources.
 *
 * Usage:
 *   tsx scripts/apply-enriched-questions.ts [--input <path>] [--exam <examId>] [--dry-run]
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_INPUT = path.resolve(
  process.cwd(),
  'data-pipelines/data/enrich-questions/output/enriched-sitecore-xmc.json'
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inputIdx = args.indexOf('--input');
  const examIdx = args.indexOf('--exam');
  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : DEFAULT_INPUT;
  const examId = examIdx >= 0 ? args[examIdx + 1] : 'sitecore-xmc';

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log(`Reading enriched questions from: ${inputPath}`);
  const raw = await readFile(inputPath, 'utf-8');
  const data = JSON.parse(raw);
  const questions: Array<Record<string, unknown>> = data.questions ?? [];

  const enriched = questions.filter(
    (q) => Array.isArray(q.explanationSources) && (q.explanationSources as unknown[]).length > 0
  );

  console.log(`Total questions in file: ${questions.length}`);
  console.log(`Questions with explanationSources: ${enriched.length}`);
  console.log(`Exam ID: ${examId}`);
  if (dryRun) console.log('DRY RUN — no changes will be made\n');

  let updated = 0;
  let notFound = 0;
  let failed = 0;

  for (let i = 0; i < enriched.length; i++) {
    const q = enriched[i];
    const questionText = q.question as string;

    if (!dryRun) {
      const { data: rows, error: fetchErr } = await supabase
        .schema('quiz')
        .from('questions')
        .select('id')
        .eq('exam_id', examId)
        .eq('question', questionText)
        .limit(1);

      if (fetchErr) {
        console.error(`[${i + 1}/${enriched.length}] Fetch error: ${fetchErr.message}`);
        failed++;
        continue;
      }

      if (!rows || rows.length === 0) {
        console.warn(`[${i + 1}/${enriched.length}] Not found: "${questionText.slice(0, 60)}"`);
        notFound++;
        continue;
      }

      const id = rows[0].id;

      const { error: updateErr } = await supabase
        .schema('quiz')
        .from('questions')
        .update({
          explanation: q.explanation ?? null,
          explanation_generated_by_ai: true,
          explanation_sources: q.explanationSources ?? null,
          study: q.study ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateErr) {
        console.error(`[${i + 1}/${enriched.length}] Update error: ${updateErr.message}`);
        failed++;
        continue;
      }
    }

    updated++;
    if (updated % 50 === 0 || updated === enriched.length) {
      console.log(`[${updated}/${enriched.length}] Updated...`);
    }
  }

  console.log('\nSummary:');
  console.log(`  Updated:   ${updated}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped (no sources): ${questions.length - enriched.length}`);
  if (dryRun) console.log('\n(DRY RUN — no actual changes made)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
