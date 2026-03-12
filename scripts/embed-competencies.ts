/**
 * Generate Competency Embeddings
 *
 * Purpose:
 * - Create vector embeddings for competencies (title + description) to support
 *   semantic matching with questions.
 *
 * Flags:
 * - --exam <id>     Limit to a specific exam
 * - --limit <n>     Cap number of competencies processed
 * - --batch <n>     Batch size for embedding API calls (default 16)
 * - --recompute     Recompute embeddings even if present (default: skip existing)
 *
 * Env:
 * - OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 * - pnpm embed:competencies
 * - pnpm embed:competencies --exam sitecore-xmc --recompute
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

type CompetencyRow = {
  id: string;
  exam_id: string;
  title: string;
  description: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const params: { exam?: string; limit?: number; recompute?: boolean; batch?: number } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') params.exam = args[++i];
    else if (a === '--limit') params.limit = Number(args[++i]);
    else if (a === '--recompute') params.recompute = true;
    else if (a === '--batch') params.batch = Number(args[++i]);
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: pnpm embed:competencies [--exam <examId>] [--limit <n>] [--recompute] [--batch <n>]'
      );
      process.exit(0);
    }
  }
  return params;
}

async function main() {
  const { exam, limit, recompute, batch } = parseArgs();
  const batchSize = batch && batch > 0 ? batch : 16;

  const model = process.env.QUESTIONS_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const dimensions = process.env.QUESTIONS_EMBEDDING_DIMENSIONS
    ? parseInt(process.env.QUESTIONS_EMBEDDING_DIMENSIONS, 10)
    : 1536;

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });

  // Fetch competencies to process
  let query = supabase
    .schema('quiz')
    .from('competencies')
    .select('id, exam_id, title, description');

  if (exam) query = query.eq('exam_id', exam) as typeof query;
  if (!recompute) query = query.is('embedding', null) as typeof query;

  const { data: allRows, error } = await query.order('title');

  if (error) {
    console.error('Failed to fetch competencies:', error.message);
    process.exit(1);
  }

  const rows = (allRows ?? []) as CompetencyRow[];
  const toProcess = typeof limit === 'number' ? rows.slice(0, limit) : rows;

  console.log(
    `Embedding ${toProcess.length} competenc${toProcess.length === 1 ? 'y' : 'ies'} using model ${model} (${dimensions} dims)`
  );

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batchDocs = toProcess.slice(i, i + batchSize);
    const inputs = batchDocs.map((c) => `${c.title}\n\n${c.description}`);

    let embeddings: number[][];
    try {
      const response = await openai.embeddings.create({ model, input: inputs, dimensions });
      embeddings = response.data.map((d) => d.embedding);
    } catch (err) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} embedding failed:`, err);
      failed += batchDocs.length;
      continue;
    }

    const now = new Date().toISOString();
    await Promise.all(
      batchDocs.map((doc, idx) =>
        supabase
          .schema('quiz')
          .from('competencies')
          .update({
            embedding: embeddings[idx],
            embedding_model: model,
            embedding_updated_at: now,
            updated_at: now,
          })
          .eq('id', doc.id)
      )
    );

    processed += batchDocs.length;
    console.log(`Processed ${Math.min(i + batchDocs.length, toProcess.length)} / ${toProcess.length}`);
  }

  console.log(`\nDone. Embedded: ${processed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
