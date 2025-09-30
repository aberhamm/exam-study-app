/**
 * Create/Update Atlas Vector Search Index for question embeddings
 *
 * Usage:
 *   tsx scripts/create-vector-index.ts [--index <name>] [--dims <n>] [--similarity <cosine|euclidean|dotProduct>] [--update]
 *   env: MONGODB_URI, MONGODB_DB, MONGODB_QUESTION_EMBEDDINGS_COLLECTION, MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX, QUESTIONS_EMBEDDING_DIMENSIONS
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function getEnv(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v ?? fallback;
}

type Args = {
  indexName?: string;
  dims?: number;
  similarity?: 'cosine' | 'euclidean' | 'dotProduct';
  update?: boolean;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--index') out.indexName = args[++i];
    else if (a === '--dims') out.dims = Number(args[++i]);
    else if (a === '--similarity') out.similarity = args[++i] as any;
    else if (a === '--update') out.update = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/create-vector-index.ts [--index <name>] [--dims <n>] [--similarity <cosine|euclidean|dotProduct>] [--update]');
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const { indexName: cliIndex, dims: cliDims, similarity: cliSim, update } = parseArgs();

  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const collection = getEnv('MONGODB_QUESTION_EMBEDDINGS_COLLECTION', 'question_embeddings')!;
  const indexName = cliIndex || getEnv('MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX', 'question_embedding')!;
  const dims = typeof cliDims === 'number' && !Number.isNaN(cliDims)
    ? cliDims
    : (() => {
        const s = getEnv('QUESTIONS_EMBEDDING_DIMENSIONS');
        const n = s ? Number(s) : 1536;
        return Number.isNaN(n) ? 1536 : n;
      })();
  const similarity = cliSim || 'cosine';

  console.log(`Connecting to MongoDB…`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  try {
    console.log(`
DB: ${dbName}
Collection: ${collection}
Index name: ${indexName}
Dimensions: ${dims}
Similarity: ${similarity}
Mode: ${update ? 'update if exists' : 'create if absent'}
`);

    // Check if index exists
    let existing: any = null;
    try {
      const res = await db.command({ listSearchIndexes: collection, name: indexName });
      const batch = (res as any)?.cursor?.firstBatch || [];
      existing = batch[0] || null;
    } catch (e) {
      console.warn('Could not list existing search indexes (ensure Atlas Search is enabled). Proceeding…');
    }

    const definition = {
      mappings: {
        dynamic: false,
        fields: {
          // Fields used in $vectorSearch.filter must be indexed as 'token'
          examId: { type: 'token' },
          id: { type: 'token' },
          embedding: { type: 'knnVector', dimensions: dims, similarity },
        },
      },
    } as const;

    if (existing) {
      console.log(`Index "${indexName}" already exists.`);
      if (update) {
        console.log('Updating index definition…');
        const res = await db.command({
          updateSearchIndex: collection,
          name: indexName,
          definition,
        });
        console.log('Update response:', res);
      } else {
        console.log('Use --update to update the existing index, or set a different --index name.');
      }
    } else {
      console.log('Creating search index…');
      const res = await db.command({
        createSearchIndexes: collection,
        indexes: [
          {
            name: indexName,
            definition,
          },
        ],
      });
      console.log('Create response:', res);
    }

    console.log('\nDone. Note: Atlas Search indexes may take time to build. Check the Atlas UI for status.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
