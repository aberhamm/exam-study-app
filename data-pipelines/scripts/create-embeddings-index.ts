/**
 * Create/update indexes for the embeddings chunk collection.
 * - B-tree indexes (including unique dedupe index)
 * - Atlas Search vector index on top-level `embedding`
 *
 * Usage (from data-pipelines/):
 *   pnpm tsx scripts/create-embeddings-index.ts [--collection <name>] [--dims <n>] [--similarity <cosine|euclidean|dotProduct>] [--index <name>] [--update]
 *
 * Env:
 *   MONGODB_URI or MONGO_URI
 *   MONGODB_DATABASE or MONGODB_DB
 *   EMBEDDINGS_COLLECTION (default: embeddings)
 */
import { config as loadDotenv } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

// Load workspace-local .env first, then process.cwd() fallback
const moduleDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: join(moduleDir, '../.env'), quiet: true });
loadDotenv({ quiet: true });

type Args = {
  collection?: string;
  dims?: number;
  similarity?: 'cosine' | 'euclidean' | 'dotProduct';
  indexName?: string;
  update?: boolean;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--collection') out.collection = args[++i];
    else if (a === '--dims') out.dims = Number(args[++i]);
    else if (a === '--similarity') out.similarity = args[++i] as Args['similarity'];
    else if (a === '--index') out.indexName = args[++i];
    else if (a === '--update') out.update = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: pnpm tsx scripts/create-embeddings-index.ts [--collection <name>] [--dims <n>] [--similarity <cosine|euclidean|dotProduct>] [--index <name>] [--update]');
      process.exit(0);
    }
  }
  return out;
}

function env(name: string, alt?: string): string | undefined {
  return process.env[name] || (alt ? process.env[alt] : undefined);
}

function requireEnv(name: string, alt?: string): string {
  const v = env(name, alt);
  if (!v) throw new Error(`Missing env: ${name}${alt ? ` (or ${alt})` : ''}`);
  return v;
}

async function main() {
  const { collection: cliCollection, dims: cliDims, similarity: cliSim, indexName: cliIndex, update } = parseArgs();
  const uri = requireEnv('MONGODB_URI', 'MONGO_URI');
  const database = requireEnv('MONGODB_DATABASE', 'MONGODB_DB');
  const collection = cliCollection || process.env.EMBEDDINGS_COLLECTION || 'embeddings';
  const dims = typeof cliDims === 'number' && !Number.isNaN(cliDims) ? cliDims : (process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : 1536);
  const similarity = cliSim || 'cosine';
  const indexName = cliIndex || 'embedding_vector';

  console.log(`Connecting: db=${database}, collection=${collection}`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(database);
  const coll = db.collection(collection);

  try {
    console.log('Creating B-tree indexes (idempotent)…');
    // Unique dedupe on (sourceFile, chunkContentHash)
    try { await coll.createIndex({ sourceFile: 1, chunkContentHash: 1 }, { name: 'uniq_sourceFile_chunkHash', unique: true }); }
    catch (e) { console.warn('uniq_sourceFile_chunkHash:', (e as Error).message); }
    // Helpful filters
    try { await coll.createIndex({ sourceFile: 1 }, { name: 'sourceFile_1' }); } catch {}
    try { await coll.createIndex({ groupId: 1 }, { name: 'groupId_1' }); } catch {}
    try { await coll.createIndex({ url: 1 }, { name: 'url_1' }); } catch {}
    try { await coll.createIndex({ tags: 1 }, { name: 'tags_1' }); } catch {}
    try { await coll.createIndex({ sectionPath: 1 }, { name: 'sectionPath_1' }); } catch {}
    try { await coll.createIndex({ nearestHeading: 1 }, { name: 'nearestHeading_1' }); } catch {}
    try { await coll.createIndex({ updatedAt: -1 }, { name: 'updatedAt_-1' }); } catch {}
    try { await coll.createIndex({ createdAt: -1 }, { name: 'createdAt_-1' }); } catch {}

    console.log('Ensuring Atlas Search vector index…');
    const definition = {
      mappings: {
        dynamic: false,
        fields: {
          embedding: { type: 'knnVector', dimensions: dims, similarity },
          groupId: { type: 'token' },
          sourceFile: { type: 'token' },
          tags: { type: 'token' },
          url: { type: 'token' },
          sectionPath: { type: 'token' },
        },
      },
    } as const;

    // Try list existing
    let hasExisting = false;
    try {
      const res = await db.command({ listSearchIndexes: collection, name: indexName });
      const batch = (res as { cursor?: { firstBatch?: unknown[] } }).cursor?.firstBatch ?? [];
      hasExisting = (batch?.length ?? 0) > 0;
    } catch {
      console.warn('listSearchIndexes failed (Atlas Search not enabled or self-hosted Mongo). Skipping vector index creation.');
    }

    if (hasExisting) {
      console.log(`Search index "${indexName}" exists.`);
      if (update) {
        console.log('Updating search index…');
        const res = await db.command({ updateSearchIndex: collection, name: indexName, definition });
        console.log('Update response:', res);
      }
    } else {
      try {
        console.log('Creating search index…');
        const res = await db.command({ createSearchIndexes: collection, indexes: [{ name: indexName, definition }] });
        console.log('Create response:', res);
      } catch {
        console.warn('createSearchIndexes failed. If using self-hosted Mongo without Atlas Search, create a $vectorSearch index manually or use Atlas.');
      }
    }

    console.log('Done.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
