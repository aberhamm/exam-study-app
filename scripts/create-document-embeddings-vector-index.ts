/**
 * Create/Update Atlas Vector Search Index for document embeddings
 *
 * Usage:
 *   tsx scripts/create-document-embeddings-vector-index.ts [--update]
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';
import { envConfig } from '../lib/env-config.js';

async function main() {
  const update = process.argv.includes('--update');

  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const collection = envConfig.pipeline.documentEmbeddingsCollection;
  const indexName = envConfig.pipeline.documentEmbeddingsVectorIndex;
  const dims = 1536;
  const similarity = 'cosine';

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
    let hasExisting = false;
    try {
      const res = await db.command({ listSearchIndexes: collection, name: indexName });
      const batch = (res as { cursor?: { firstBatch?: unknown[] } }).cursor?.firstBatch ?? [];
      hasExisting = (batch?.length ?? 0) > 0;
    } catch {
      console.warn('Could not list existing search indexes (ensure Atlas Search is enabled). Proceeding…');
    }

    const definition = {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: dims,
          similarity,
        },
        {
          type: 'filter',
          path: 'groupId',
        },
        {
          type: 'filter',
          path: 'sourceFile',
        },
      ],
    };

    if (hasExisting) {
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
        console.log('Use --update to update the existing index, or set a different index name.');
      }
    } else {
      console.log('Creating search index…');
      const res = await db.command({
        createSearchIndexes: collection,
        indexes: [
          {
            name: indexName,
            type: 'vectorSearch',
            definition,
          },
        ],
      });
      console.log('Create response:', res);
    }

    console.log('\nDone. Note: Atlas Search indexes may take time to build.');
    console.log('The index should be ready in a few seconds for local Atlas deployments.');
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
