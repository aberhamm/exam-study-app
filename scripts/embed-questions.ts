/**
 * Generate Question Embeddings
 *
 * Purpose
 * - Create vector embeddings for questions (question, options, answer, optional explanation) to support semantic search.
 *
 * Flags
 * - --exam <id>   Limit to a specific exam
 * - --limit <n>   Cap number of questions processed
 * - --batch <n>   Batch size for embedding API calls (default 16)
 * - --recompute   Recompute embeddings even if present (otherwise, embed missing only)
 *
 * Env
 * - OPENAI_API_KEY, MONGODB_URI, MONGODB_DB
 * - MONGODB_QUESTIONS_COLLECTION, MONGODB_QUESTION_EMBEDDINGS_COLLECTION
 * - Optional: QUESTIONS_EMBEDDING_MODEL (default text-embedding-3-small), QUESTIONS_EMBEDDING_DIMENSIONS
 *
 * Usage
 * - pnpm embed:questions
 * - pnpm embed:questions --exam sitecore-xmc --recompute --batch 32
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';

type QuestionDoc = {
  id: string;
  examId: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: 'A'|'B'|'C'|'D'|'E'|('A'|'B'|'C'|'D'|'E')[];
  explanation?: string;
  embedding?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: Date;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

function getEnv(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v ?? fallback;
}

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
      console.log(`Usage: pnpm embed:questions [--exam <examId>] [--limit <n>] [--recompute] [--batch <n>]`);
      process.exit(0);
    }
  }
  return params;
}

function buildTextForEmbedding(q: QuestionDoc): string {
  const choices = `A) ${q.options.A}\nB) ${q.options.B}\nC) ${q.options.C}\nD) ${q.options.D}` + (q.options.E ? `\nE) ${q.options.E}` : '');
  const answer = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
  const explanation = q.explanation ? `\nExplanation: ${q.explanation}` : '';
  return `Question: ${q.question}\nOptions:\n${choices}\nAnswer: ${answer}${explanation}`;
}

async function createEmbeddings(inputs: string[], model: string, dimensions?: number): Promise<number[][]> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const url = 'https://api.openai.com/v1/embeddings';
  const body: Record<string, unknown> = { model, input: inputs };
  if (dimensions) body.dimensions = dimensions;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
  }
  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data.map(d => d.embedding);
}

async function main() {
  const { exam, limit, recompute, batch } = parseArgs();
  const model = getEnv('QUESTIONS_EMBEDDING_MODEL', 'text-embedding-3-small')!;
  const dimsStr = getEnv('QUESTIONS_EMBEDDING_DIMENSIONS');
  const dimensions = dimsStr ? Number(dimsStr) : undefined;

  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const questionsColName = requireEnv('MONGODB_QUESTIONS_COLLECTION');
  const embeddingsColName = requireEnv('MONGODB_QUESTION_EMBEDDINGS_COLLECTION');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection<QuestionDoc>(questionsColName);
  const embCol = db.collection(embeddingsColName);

  try {
    const batchSize = batch && batch > 0 ? batch : 16;
    let toProcess: QuestionDoc[] = [];

    if (recompute) {
      // Simple path: all questions (optionally filtered by exam)
      const filter: Record<string, unknown> = {};
      if (exam) filter.examId = exam;
      const cursor = col.find(filter, { projection: { embedding: 0, embeddingModel: 0, embeddingUpdatedAt: 0 } }).sort({ examId: 1, id: 1 });
      for await (const doc of cursor) {
        toProcess.push(doc);
        if (typeof limit === 'number' && toProcess.length >= limit) break;
      }
    } else {
      // Missing-only path: join with embeddings collection and keep only those without a match
      const pipeline: Record<string, unknown>[] = [];
      if (exam) pipeline.push({ $match: { examId: exam } });
      pipeline.push({
        $lookup: {
          from: embeddingsColName,
          let: { qid: '$id', qexam: '$examId' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$id', '$$qid'] }, { $eq: ['$examId', '$$qexam'] } ] } } },
            { $project: { _id: 0, id: 1 } },
          ],
          as: 'e',
        },
      });
      pipeline.push({ $match: { e: { $size: 0 } } });
      pipeline.push({ $project: { _id: 0, id: 1, examId: 1, question: 1, options: 1, answer: 1, explanation: 1 } });
      if (typeof limit === 'number') pipeline.push({ $limit: limit });

      const missing = await col.aggregate<QuestionDoc>(pipeline).toArray();
      toProcess = missing;
    }

    console.log(`Embedding ${toProcess.length} question(s) using model ${model}${dimensions ? ` (${dimensions} dims)` : ''}`);

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batchDocs = toProcess.slice(i, i + batchSize);
      const inputs = batchDocs.map(buildTextForEmbedding);
      const embeddings = await createEmbeddings(inputs, model, dimensions);
      const now = new Date();

      const ops = batchDocs.map((doc, idx) =>
        embCol.updateOne(
          { examId: doc.examId, id: doc.id },
          {
            $setOnInsert: {
              createdAt: now,
              id: doc.id,
              examId: doc.examId,
            },
            $set: {
              embedding: embeddings[idx],
              embeddingModel: model,
              embeddingUpdatedAt: now,
              updatedAt: now,
            },
          },
          { upsert: true }
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
