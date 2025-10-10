/**
 * Auto-assign Competencies to Questions
 *
 * Purpose
 * - For each question, find similar competencies using vector similarity
 * - Auto-assign top N matching competencies to each question
 *
 * Flags
 * - --exam <id>      Limit to a specific exam (required)
 * - --topN <n>       Number of top competencies to assign per question (default 1)
 * - --threshold <n>  Minimum similarity score (0-1) to assign (default 0.5)
 * - --overwrite      Overwrite existing competency assignments (default: skip if already assigned)
 * - --limit <n>      Limit number of questions to process (for testing)
 *
 * Env
 * - OPENAI_API_KEY, MONGODB_URI, MONGODB_DB
 * - MONGODB_QUESTIONS_COLLECTION, MONGODB_QUESTION_EMBEDDINGS_COLLECTION
 * - MONGODB_EXAM_COMPETENCIES_COLLECTION, MONGODB_COMPETENCIES_VECTOR_INDEX
 *
 * Usage
 * - pnpm assign:competencies --exam sitecore-xmc
 * - pnpm assign:competencies --exam sitecore-xmc --topN 2 --threshold 0.6 --overwrite
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient, ObjectId } from 'mongodb';
import { envConfig } from '../lib/env-config.js';
import { searchSimilarCompetencies } from '../lib/server/competency-assignment.js';

type QuestionEmbeddingDoc = {
  id: string;
  examId: string;
  embedding: number[];
};

type QuestionDoc = {
  _id: ObjectId;
  examId: string;
  competencyIds?: string[];
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
        `Usage: pnpm assign:competencies --exam <examId> [--topN <n>] [--threshold <n>] [--overwrite] [--limit <n>]`
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

  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const questionsColName = envConfig.mongo.questionsCollection;
  const embeddingsColName = envConfig.mongo.questionEmbeddingsCollection;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const questionsCol = db.collection<QuestionDoc>(questionsColName);
  const embeddingsCol = db.collection<QuestionEmbeddingDoc>(embeddingsColName);

  try {
    console.log(`\nAuto-assigning competencies to questions for exam: ${exam}`);
    console.log(`Settings: topN=${topN}, threshold=${threshold}, overwrite=${overwrite}`);

    // Find questions that need competency assignment
    const filter: Record<string, unknown> = { examId: exam };
    if (!overwrite) {
      // Only process questions without competency assignments
      filter.$or = [
        { competencyIds: { $exists: false } },
        { competencyIds: null },
        { competencyIds: [] },
      ];
    }

    const questionsToProcess: QuestionDoc[] = [];
    const cursor = questionsCol
      .find(filter, { projection: { _id: 0, id: 1, examId: 1, competencyIds: 1 } })
      .sort({ id: 1 });

    for await (const doc of cursor) {
      questionsToProcess.push(doc);
      if (typeof limit === 'number' && questionsToProcess.length >= limit) break;
    }

    console.log(`Found ${questionsToProcess.length} questions to process\n`);

    if (questionsToProcess.length === 0) {
      console.log('No questions to process. Done.');
      return;
    }

    let processed = 0;
    let assigned = 0;
    let skipped = 0;

    for (const question of questionsToProcess) {
      processed++;

      // Get question embedding using _id
      const embeddingDoc = await embeddingsCol.findOne(
        { questionId: question._id },
        { projection: { embedding: 1 } }
      );

      if (!embeddingDoc?.embedding || embeddingDoc.embedding.length === 0) {
        console.log(
          `[${processed}/${questionsToProcess.length}] Question ${question._id.toString()}: No embedding found, skipping`
        );
        skipped++;
        continue;
      }

      // Search for similar competencies
      const similarCompetencies = await searchSimilarCompetencies(
        embeddingDoc.embedding,
        exam,
        topN
      );

      // Filter by threshold and get IDs
      const competencyIds = similarCompetencies
        .filter((c) => c.score >= threshold)
        .map((c) => c.competency.id);

      if (competencyIds.length === 0) {
        console.log(
          `[${processed}/${questionsToProcess.length}] Question ${question._id.toString()}: No competencies above threshold ${threshold}, skipping`
        );
        skipped++;
        continue;
      }

      // Assign competencies to question using _id
      await questionsCol.updateOne(
        { _id: question._id, examId: question.examId },
        {
          $set: {
            competencyIds,
            updatedAt: new Date(),
          },
        }
      );

      const scores = similarCompetencies
        .filter((c) => c.score >= threshold)
        .map((c) => `${c.competency.title} (${c.score.toFixed(3)})`)
        .join(', ');

      console.log(
        `[${processed}/${questionsToProcess.length}] Question ${question._id.toString()}: Assigned ${competencyIds.length} competenc${competencyIds.length === 1 ? 'y' : 'ies'} - ${scores}`
      );
      assigned++;
    }

    console.log(`\nDone.`);
    console.log(`Total processed: ${processed}`);
    console.log(`Successfully assigned: ${assigned}`);
    console.log(`Skipped (no embedding or below threshold): ${skipped}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
