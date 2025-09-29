import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const questionsColName = requireEnv('MONGODB_QUESTIONS_COLLECTION');
  const embeddingsColName = requireEnv('MONGODB_QUESTION_EMBEDDINGS_COLLECTION');

  const unset = process.argv.includes('--unset-in-questions');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const qCol = db.collection(questionsColName);
  const embCol = db.collection(embeddingsColName);

  // Indexes
  await Promise.allSettled([
    embCol.createIndex({ examId: 1, id: 1 }, { unique: true, name: 'unique_examId_id' }),
  ]);

  try {
    const cursor = qCol.find({ embedding: { $exists: true } }, { projection: { id: 1, examId: 1, embedding: 1, embeddingModel: 1, embeddingUpdatedAt: 1 } });
    let moved = 0;
    for await (const doc of cursor) {
      const now = new Date();
      await embCol.updateOne(
        { examId: doc.examId, id: doc.id },
        {
          $setOnInsert: { createdAt: now, id: doc.id, examId: doc.examId },
          $set: {
            embedding: doc.embedding,
            embeddingModel: doc.embeddingModel || 'unknown',
            embeddingUpdatedAt: doc.embeddingUpdatedAt || now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      if (unset) {
        await qCol.updateOne(
          { examId: doc.examId, id: doc.id },
          { $unset: { embedding: 1, embeddingModel: 1, embeddingUpdatedAt: 1 } }
        );
      }

      moved++;
    }

    console.log(`Embeddings migrated: ${moved} document(s).${unset ? ' Unset fields from questions.' : ''}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

