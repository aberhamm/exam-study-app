/**
 * Seed Exams (metadata + questions, no embedded arrays)
 *
 * Purpose
 * - Load JSON exams from data/exams/, validate with ExamDetailZ, and upsert:
 *   - Exam metadata into MONGODB_EXAMS_COLLECTION (questions field is unset)
 *   - Questions into MONGODB_QUESTIONS_COLLECTION with stable ids
 *
 * Safety
 * - Preserves existing explanation fields: explanation is only set on insert, never overwritten.
 *
 * Env
 * - MONGODB_URI, MONGODB_DB, MONGODB_EXAMS_COLLECTION, MONGODB_QUESTIONS_COLLECTION
 *
 * Usage
 * - pnpm seed:exams
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { ExamDetailZ } from '@/lib/validation';
import { generateQuestionId } from '@/lib/normalize';
import type { QuestionDocument } from '@/types/question';

const EXAMS_DIR = path.resolve(process.cwd(), 'data/exams');

async function ensureDirExists(dirPath: string) {
  try {
    const stats = await stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`${dirPath} is not a directory`);
    }
  } catch {
    throw new Error(`Exam directory not found at ${dirPath}`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

async function loadExamFiles(): Promise<Array<{ fileName: string; payload: ReturnType<typeof ExamDetailZ.parse> }>> {
  await ensureDirExists(EXAMS_DIR);
  const entries = await readdir(EXAMS_DIR);
  const jsonFiles = entries.filter((entry) => entry.endsWith('.json'));

  if (jsonFiles.length === 0) {
    throw new Error(`No JSON exam files found in ${EXAMS_DIR}`);
  }

  const exams = [] as Array<{ fileName: string; payload: ReturnType<typeof ExamDetailZ.parse> }>;

  for (const fileName of jsonFiles) {
    const filePath = path.join(EXAMS_DIR, fileName);
    const raw = await readFile(filePath, 'utf8');
    const parsed = ExamDetailZ.parse(JSON.parse(raw));
    exams.push({ fileName, payload: parsed });
  }

  return exams;
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const examsColName = requireEnv('MONGODB_EXAMS_COLLECTION');
  const questionsColName = requireEnv('MONGODB_QUESTIONS_COLLECTION');

  const client = new MongoClient(uri);

  try {
    const exams = await loadExamFiles();
    await client.connect();
    const db = client.db(dbName);
    const examsCol = db.collection(examsColName);
    const questionsCol = db.collection<QuestionDocument>(questionsColName);

    // Ensure indexes for questions collection
    await Promise.allSettled([
      questionsCol.createIndex({ examId: 1, id: 1 }, { unique: true, name: 'unique_examId_id' }),
      questionsCol.createIndex({ examId: 1 }, { name: 'examId_1' }),
    ]);

    for (const { fileName, payload } of exams) {
      const examId = payload.examId ?? fileName.replace(/\.json$/i, '');
      // Upsert exam metadata only (no embedded questions)
      await examsCol.updateOne(
        { examId },
        {
          $set: {
            examId,
            examTitle: payload.examTitle,
            welcomeConfig: payload.welcomeConfig,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
          $unset: { questions: '' },
        },
        { upsert: true }
      );

      // Upsert questions into dedicated collection; do not overwrite explanation if present
      const ops: Array<Promise<unknown>> = [];
      for (const q of payload.questions) {
        const id = generateQuestionId(q);
        const now = new Date();
        ops.push(
          questionsCol.updateOne(
            { examId, id },
            {
              $setOnInsert: {
                id,
                examId,
                createdAt: now,
                explanation: q.explanation,
                explanationSources: (q as { explanationSources?: unknown }).explanationSources,
              },
              $set: {
                question: q.question,
                options: q.options,
                answer: q.answer,
                question_type: q.question_type,
                study: q.study,
                updatedAt: now,
              },
            },
            { upsert: true }
          )
        );
      }
      await Promise.all(ops);

      console.log(`Seeded exam "${examId}" (${payload.questions.length} question(s)) from ${fileName}`);
    }

    console.log(`\nSeeded ${exams.length} exam(s) into ${examsColName} and ${questionsColName}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
