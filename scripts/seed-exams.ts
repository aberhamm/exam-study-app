import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { ExternalQuestionsFileZ } from '@/lib/validation';
import { generateQuestionId } from '@/lib/normalize';

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

async function loadExamFiles(): Promise<Array<{ fileName: string; payload: ReturnType<typeof ExternalQuestionsFileZ.parse> }>> {
  await ensureDirExists(EXAMS_DIR);
  const entries = await readdir(EXAMS_DIR);
  const jsonFiles = entries.filter((entry) => entry.endsWith('.json'));

  if (jsonFiles.length === 0) {
    throw new Error(`No JSON exam files found in ${EXAMS_DIR}`);
  }

  const exams = [] as Array<{ fileName: string; payload: ReturnType<typeof ExternalQuestionsFileZ.parse> }>;

  for (const fileName of jsonFiles) {
    const filePath = path.join(EXAMS_DIR, fileName);
    const raw = await readFile(filePath, 'utf8');
    const parsed = ExternalQuestionsFileZ.parse(JSON.parse(raw));
    exams.push({ fileName, payload: parsed });
  }

  return exams;
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const collectionName = requireEnv('MONGODB_EXAMS_COLLECTION');

  const client = new MongoClient(uri);

  try {
    const exams = await loadExamFiles();
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);

    for (const { fileName, payload } of exams) {
      const examId = payload.examId ?? fileName.replace(/\.json$/i, '');
      const questionsWithIds = payload.questions.map((question) => ({
        ...question,
        id: generateQuestionId(question),
      }));

      const document = {
        ...payload,
        examId,
        questions: questionsWithIds,
        updatedAt: new Date(),
      };

      await collection.updateOne(
        { examId },
        {
          $set: document,
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      console.log(`Upserted exam "${examId}" from ${fileName}`);
    }

    console.log(`\nSeeded ${exams.length} exam(s) into ${collectionName}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
