/**
 * Generate Competency Embeddings
 *
 * Purpose
 * - Create vector embeddings for competencies (title + description) to support semantic matching with questions.
 *
 * Flags
 * - --exam <id>   Limit to a specific exam
 * - --limit <n>   Cap number of competencies processed
 * - --batch <n>   Batch size for embedding API calls (default 16)
 * - --recompute   Recompute embeddings even if present (otherwise, embed missing only)
 *
 * Env
 * - OPENAI_API_KEY, MONGODB_URI, MONGODB_DB
 * - MONGODB_EXAM_COMPETENCIES_COLLECTION
 * - Optional: QUESTIONS_EMBEDDING_MODEL (default text-embedding-3-small), QUESTIONS_EMBEDDING_DIMENSIONS
 *
 * Usage
 * - pnpm embed:competencies
 * - pnpm embed:competencies --exam sitecore-xmc --recompute --batch 32
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';
import { envConfig } from '../lib/env-config.js';

type CompetencyDoc = {
  id: string;
  examId: string;
  title: string;
  description: string;
  examPercentage: number;
  embedding?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: Date;
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
        `Usage: pnpm embed:competencies [--exam <examId>] [--limit <n>] [--recompute] [--batch <n>]`
      );
      process.exit(0);
    }
  }
  return params;
}

function buildTextForEmbedding(c: CompetencyDoc): string {
  return `${c.title}\n\n${c.description}`;
}

async function createEmbeddings(
  inputs: string[],
  model: string,
  dimensions?: number
): Promise<number[][]> {
  const apiKey = envConfig.openai.apiKey;
  const url = 'https://api.openai.com/v1/embeddings';
  const body: Record<string, unknown> = { model, input: inputs };
  if (dimensions) body.dimensions = dimensions;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

async function main() {
  const { exam, limit, recompute, batch } = parseArgs();
  const model = envConfig.openai.embeddingModel;
  const dimensions = envConfig.openai.embeddingDimensions;

  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const competenciesColName = envConfig.mongo.examCompetenciesCollection;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection<CompetencyDoc>(competenciesColName);

  try {
    const batchSize = batch && batch > 0 ? batch : 16;
    const toProcess: CompetencyDoc[] = [];

    if (recompute) {
      // Simple path: all competencies (optionally filtered by exam)
      const filter: Record<string, unknown> = {};
      if (exam) filter.examId = exam;
      const cursor = col
        .find(filter, {
          projection: { embedding: 0, embeddingModel: 0, embeddingUpdatedAt: 0 },
        })
        .sort({ examId: 1, id: 1 });
      for await (const doc of cursor) {
        toProcess.push(doc);
        if (typeof limit === 'number' && toProcess.length >= limit) break;
      }
    } else {
      // Missing-only path: find competencies without embeddings
      const filter: Record<string, unknown> = {
        $or: [{ embedding: { $exists: false } }, { embedding: null }, { embedding: [] }],
      };
      if (exam) filter.examId = exam;

      const cursor = col
        .find(filter, {
          projection: { _id: 0, id: 1, examId: 1, title: 1, description: 1, examPercentage: 1 },
        })
        .sort({ examId: 1, id: 1 });

      for await (const doc of cursor) {
        toProcess.push(doc);
        if (typeof limit === 'number' && toProcess.length >= limit) break;
      }
    }

    console.log(
      `Embedding ${toProcess.length} competenc${toProcess.length === 1 ? 'y' : 'ies'} using model ${model}${dimensions ? ` (${dimensions} dims)` : ''}`
    );

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batchDocs = toProcess.slice(i, i + batchSize);
      const inputs = batchDocs.map(buildTextForEmbedding);
      const embeddings = await createEmbeddings(inputs, model, dimensions);
      const now = new Date();

      const ops = batchDocs.map((doc, idx) =>
        col.updateOne(
          { examId: doc.examId, id: doc.id },
          {
            $set: {
              embedding: embeddings[idx],
              embeddingModel: model,
              embeddingUpdatedAt: now,
              updatedAt: now,
            },
          }
        )
      );
      await Promise.all(ops);
      console.log(`Processed ${Math.min(i + batchDocs.length, toProcess.length)} / ${toProcess.length}`);
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
