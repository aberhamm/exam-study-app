/**
 * Remove Legacy Embedded Questions
 *
 * Purpose
 * - Permanently unset the legacy exams.questions array once migration is complete.
 * - Marks legacyQuestionsMigrated: true and updates updatedAt.
 *
 * Flags
 * - --exam <id>  Restrict to a single exam
 * - --dry-run    Print actions without writing to DB
 *
 * Env
 * - MONGODB_URI, MONGODB_DB, MONGODB_EXAMS_COLLECTION
 *
 * Usage
 * - pnpm remove:legacy-questions
 * - pnpm remove:legacy-questions --exam sitecore-xmc --dry-run
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} environment variable`);
  return v;
}

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const examsColName = requireEnv('MONGODB_EXAMS_COLLECTION');

  const onlyExam = getArg('--exam');
  const dryRun = hasFlag('--dry-run');

  console.log('Removing legacy embedded questions', { exam: onlyExam ?? '(all)', dryRun });

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const examsCol = db.collection(examsColName);

  try {
    const filter = onlyExam ? { examId: onlyExam } : {};
    const cursor = examsCol.find<{ examId: string; questions?: unknown }>(filter, { projection: { examId: 1, questions: 1 } });

    let processed = 0;
    let removed = 0;
    for await (const exam of cursor) {
      processed++;
      const hasQuestions = Array.isArray(exam.questions);
      if (!hasQuestions) continue;
      if (!dryRun) {
        await examsCol.updateOne(
          { examId: exam.examId },
          { $unset: { questions: '' }, $set: { legacyQuestionsMigrated: true, updatedAt: new Date() } }
        );
      }
      removed++;
      console.log(`Unset questions for exam ${exam.examId}`);
    }

    console.log(`\nDone. Exams scanned: ${processed}, Exams modified: ${removed}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
