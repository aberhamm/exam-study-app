/**
 * Seed Exams to Supabase (quiz schema)
 *
 * Purpose:
 * - Load JSON exam files from data/exams/
 * - Upsert exam metadata into quiz.exams
 * - Upsert questions into quiz.questions
 *
 * Uses SECURITY DEFINER RPC functions to write to the quiz schema,
 * which is not directly exposed via the PostgREST API.
 *
 * Safety:
 * - Upsert on conflict so safe to re-run
 * - Existing explanations are preserved (only set on insert)
 *
 * Env:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 * - pnpm seed:exams:supabase
 * - pnpm seed:exams:supabase --dry-run
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { ExamDetailZ } from '@/lib/validation';

const EXAMS_DIR = path.resolve(process.cwd(), 'data/exams');
const BATCH_SIZE = 100;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const entries = await readdir(EXAMS_DIR);
  const jsonFiles = entries.filter((f) => f.endsWith('.json'));

  if (jsonFiles.length === 0) throw new Error(`No JSON files found in ${EXAMS_DIR}`);

  console.log(`Found ${jsonFiles.length} exam file(s)\n`);

  for (const fileName of jsonFiles) {
    const filePath = path.join(EXAMS_DIR, fileName);
    const raw = await readFile(filePath, 'utf-8');
    const payload = ExamDetailZ.parse(JSON.parse(raw));
    const examId = payload.examId ?? fileName.replace(/\.json$/i, '');

    console.log(`Processing: ${fileName}`);
    console.log(`  Exam ID:   ${examId}`);
    console.log(`  Questions: ${payload.questions.length}`);

    if (dryRun) {
      console.log(`  [DRY RUN] Skipping writes\n`);
      continue;
    }

    // Upsert exam metadata
    const { error: examError } = await supabase.rpc('upsert_quiz_exam', {
      p_exam_id: examId,
      p_exam_title: payload.examTitle ?? null,
      p_welcome_config: payload.welcomeConfig ?? null,
      p_document_groups: payload.documentGroups ?? null,
    });

    if (examError) throw new Error(`Failed to upsert exam "${examId}": ${JSON.stringify(examError)}`);
    console.log(`  ✓ Exam upserted`);

    // Batch questions
    let totalUpserted = 0;
    const questions = payload.questions.map((q) => ({
      exam_id: examId,
      question: q.question,
      options: q.options,
      answer: q.answer,
      question_type: q.question_type ?? 'single',
      explanation: q.explanation ?? null,
      explanation_generated_by_ai: q.explanationGeneratedByAI ?? false,
      explanation_sources: (q as { explanationSources?: unknown }).explanationSources ?? null,
      study: q.study ?? null,
      competency_ids: q.competencyIds ?? null,
      flagged_for_review: q.flaggedForReview ?? false,
      flagged_reason: q.flaggedReason ?? null,
    }));

    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(questions.length / BATCH_SIZE);

      process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} questions)... `);

      const { data, error } = await supabase.rpc('upsert_quiz_questions', {
        p_questions: batch,
      });

      if (error) {
        console.error(`FAILED: ${JSON.stringify(error)}`);
      } else {
        totalUpserted += (data as number) ?? batch.length;
        console.log(`✓`);
      }
    }

    console.log(`  ✓ ${totalUpserted} questions upserted\n`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
