/**
 * Dev Check: Vector Search
 *
 * Purpose:
 * - Sanity check Atlas Vector Search on the embeddings collection used by the app.
 * - Uses an existing embedding as the query vector (should return non-zero hits).
 *
 * Usage:
 *   tsx scripts/check-vector-search.ts [--exam <examId>] [--limit <n>] [--candidates <n>] [--index <name>]
 *
 * Env:
 *   MONGODB_URI, MONGODB_DB
 *   MONGODB_QUESTION_EMBEDDINGS_COLLECTION (defaults to question_embeddings)
 *   MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX (defaults to question_embedding)
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient, Document } from 'mongodb';

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v == null || v === '') return fallback ?? '';
  return v;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === '') throw new Error(`Missing ${name}`);
  return v;
}

type ParsedArgs = { exam?: string; limit: number; candidates: number; index?: string };

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const out: ParsedArgs = {
    limit: 3,
    candidates: 200,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') out.exam = args[++i];
    else if (a === '--limit') out.limit = Number(args[++i] || '3');
    else if (a === '--candidates') out.candidates = Number(args[++i] || '200');
    else if (a === '--index') out.index = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/check-vector-search.ts [--exam <id>] [--limit <n>] [--candidates <n>] [--index <name>]');
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const { exam, limit, candidates, index } = parseArgs();
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const colName = getEnv('MONGODB_QUESTION_EMBEDDINGS_COLLECTION', 'question_embeddings');
  const indexName = index || getEnv('MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX', 'question_embedding');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection(colName);

  try {
    const match: Document = exam ? { examId: exam } : {};
    const sample = await col.findOne<{ id: string; examId: string; embedding: number[] }>(match, { projection: { _id: 0, id: 1, examId: 1, embedding: 1 } });
    if (!sample || !Array.isArray(sample.embedding)) {
      console.log('No sample embedding found. Verify the collection and examId.');
      return;
    }
    const q = sample.embedding;
    console.log(`Sample: id=${sample.id} examId=${sample.examId} dim=${q.length}`);

    const pipelineFiltered: Document[] = [
      {
        $vectorSearch: {
          index: indexName,
          path: 'embedding',
          queryVector: q,
          numCandidates: candidates,
          limit,
          ...(exam ? { filter: { examId: exam } } : {}),
        },
      },
      { $project: { _id: 0, id: 1, examId: 1, score: { $meta: 'vectorSearchScore' } } },
    ];

    const pipelineGlobal: Document[] = [
      {
        $vectorSearch: {
          index: indexName,
          path: 'embedding',
          queryVector: q,
          numCandidates: candidates,
          limit,
        },
      },
      { $project: { _id: 0, id: 1, examId: 1, score: { $meta: 'vectorSearchScore' } } },
    ];

    console.log(`\nRunning $vectorSearch (index=${indexName}) with${exam ? ' exam filter' : 'out exam filter'}...`);
    try {
      const hitsFiltered = await col.aggregate<{ id: string; examId: string; score?: number }>(pipelineFiltered).toArray();
      console.table(hitsFiltered);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Filtered vector search failed:', msg);
      if (msg.includes("needs to be indexed as token")) {
        console.error('\nHint: fields used in $vectorSearch.filter must be mapped as type "token".');
        console.error('Run: pnpm create:vector-index --update');
      }
    }

    console.log(`\nRunning $vectorSearch (index=${indexName}) globally...`);
    const hitsGlobal = await col.aggregate<{ id: string; examId: string; score?: number }>(pipelineGlobal).toArray();
    console.table(hitsGlobal);

    console.log('\nDimension histogram for embeddings:');
    const dimHist = await col
      .aggregate([
        { $project: { dim: { $size: { $ifNull: ['$embedding', []] } } } },
        { $group: { _id: '$dim', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    console.table(dimHist);
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
