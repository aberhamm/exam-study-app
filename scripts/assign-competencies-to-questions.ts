/**
 * Auto-assign Competencies to Questions
 *
 * Purpose:
 * - For each question with an embedding, find the most similar competencies
 *   via Supabase vector search and assign them to the question.
 *
 * Flags:
 * - --exam <id>        Limit to a specific exam (required)
 * - --topN <n>         Number of top competencies to assign per question (default 1)
 * - --threshold <n>    Minimum similarity score 0-1 to assign (default 0.5)
 * - --overwrite        Overwrite existing competency assignments (default: skip if already assigned)
 * - --limit <n>        Limit number of questions to process (for testing)
 *
 * Env:
 * - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 * - pnpm assign:competencies --exam sitecore-xmc
 * - pnpm assign:competencies --exam sitecore-xmc --topN 2 --threshold 0.6 --overwrite
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

type QuestionRow = {
  id: string;
  exam_id: string;
  embedding: number[];
  competency_ids: string[] | null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const params: {
    exam?: string;
    topN?: number;
    threshold?: number;
    overwrite?: boolean;
    limit?: number;
  } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') params.exam = args[++i];
    else if (a === '--topN') params.topN = Number(args[++i]);
    else if (a === '--threshold') params.threshold = Number(args[++i]);
    else if (a === '--overwrite') params.overwrite = true;
    else if (a === '--limit') params.limit = Number(args[++i]);
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: pnpm assign:competencies --exam <examId> [--topN <n>] [--threshold <n>] [--overwrite] [--limit <n>]'
      );
      process.exit(0);
    }
  }
  return params;
}

async function main() {
  const { exam, topN = 1, threshold = 0.5, overwrite = false, limit } = parseArgs();

  if (!exam) {
    console.error('Error: --exam <examId> is required');
    process.exit(1);
  }

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log(`\nAuto-assigning competencies for exam: ${exam}`);
  console.log(`Settings: topN=${topN}, threshold=${threshold}, overwrite=${overwrite}\n`);

  // Fetch questions that need competency assignment
  let query = supabase
    .schema('quiz')
    .from('questions')
    .select('id, exam_id, embedding, competency_ids')
    .eq('exam_id', exam)
    .not('embedding', 'is', null);

  if (!overwrite) {
    query = query.or('competency_ids.is.null,competency_ids.eq.{}') as typeof query;
  }

  const { data: allRows, error: fetchError } = await query.order('id');

  if (fetchError) {
    console.error('Failed to fetch questions:', fetchError.message);
    process.exit(1);
  }

  const rows = (allRows ?? []) as QuestionRow[];
  const toProcess = typeof limit === 'number' ? rows.slice(0, limit) : rows;
  const total = toProcess.length;

  console.log(`Found ${total} question(s) to process\n`);

  if (total === 0) {
    console.log('No questions to process. Done.');
    return;
  }

  let assigned = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const question = toProcess[i];
    const label = `[${i + 1}/${total}]`;

    // Call search_quiz_competencies RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
      'search_quiz_competencies',
      {
        p_exam_id: exam,
        p_embedding: question.embedding,
        p_top_k: topN,
      }
    );

    if (rpcError) {
      console.error(`${label} RPC error: ${rpcError.message}`);
      failed++;
      continue;
    }

    if (!rpcData || (rpcData as unknown[]).length === 0) {
      console.log(`${label} ${question.id}: No competencies matched`);
      skipped++;
      continue;
    }

    type RpcRow = { id: string; title: string; score: number };
    const matches = (rpcData as RpcRow[]).filter((r) => r.score >= threshold);

    if (matches.length === 0) {
      console.log(
        `${label} ${question.id}: No competencies above threshold ${threshold} (best: ${(rpcData as RpcRow[])[0]?.score.toFixed(3)})`
      );
      skipped++;
      continue;
    }

    const competencyIds = matches.map((r) => r.id);

    const { error: updateError } = await supabase
      .schema('quiz')
      .from('questions')
      .update({
        competency_ids: competencyIds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', question.id);

    if (updateError) {
      console.error(`${label} ${question.id}: Update failed: ${updateError.message}`);
      failed++;
      continue;
    }

    const scoreStr = matches
      .map((r) => `${r.title} (${r.score.toFixed(3)})`)
      .join(', ');
    console.log(`${label} ${question.id}: Assigned — ${scoreStr}`);
    assigned++;
  }

  console.log(`\nDone.`);
  console.log(`  Assigned: ${assigned}`);
  console.log(`  Skipped (no match / below threshold): ${skipped}`);
  console.log(`  Failed:   ${failed}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
