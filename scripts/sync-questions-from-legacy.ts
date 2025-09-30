/**
 * Sync Questions From Legacy (no explanation overwrites)
 *
 * Purpose
 * - Reconcile the dedicated questions collection from the embedded legacy array.
 * - Preserves existing explanation fields at all times.
 *
 * Flags
 * - --exam <id>     Restrict to a single exam
 * - --dry-run       Print actions without writing to DB
 * - --overwrite     Overwrite non-explanation fields when they differ
 * - --insert-only   Insert missing only (default if --overwrite not provided)
 *
 * Env
 * - MONGODB_URI, MONGODB_DB, MONGODB_EXAMS_COLLECTION, MONGODB_QUESTIONS_COLLECTION
 *
 * Usage
 * - pnpm sync:questions --dry-run
 * - pnpm sync:questions --exam sitecore-xmc --overwrite
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';
import { generateQuestionId } from '@/lib/normalize';
import type { ExternalQuestion, ExamDetail } from '@/types/external-question';
import type { QuestionDocument } from '@/types/question';

type ExamDoc = ExamDetail & { examId: string; updatedAt?: Date; legacyQuestionsMigrated?: boolean };

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} environment variable`);
  return v;
}

function sameArray<T>(a?: T[], b?: T[]): boolean {
  if (!Array.isArray(a) && !Array.isArray(b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  }
  return true;
}

function fieldsEqualIgnoringExplanation(legacy: ExternalQuestion, current: QuestionDocument): boolean {
  return (
    legacy.question === current.question &&
    JSON.stringify(legacy.options) === JSON.stringify(current.options) &&
    JSON.stringify(legacy.answer) === JSON.stringify(current.answer) &&
    (legacy.question_type ?? 'single') === (current.question_type ?? 'single') &&
    sameArray(legacy.study, current.study)
  );
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const examsColName = requireEnv('MONGODB_EXAMS_COLLECTION');
  const questionsColName = requireEnv('MONGODB_QUESTIONS_COLLECTION');

  const onlyExam = getArg('--exam');
  const dryRun = hasFlag('--dry-run');
  const overwrite = hasFlag('--overwrite');
  const insertOnly = hasFlag('--insert-only') || (!overwrite); // default behavior: insert-only

  if (overwrite && insertOnly) {
    // If both flags present, prefer overwrite
    console.warn('Both --overwrite and --insert-only specified; proceeding with overwrite and ignoring insert-only.');
  }

  console.log('Sync settings:', { exam: onlyExam ?? '(all)', dryRun, overwrite, insertOnly: !overwrite });

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const examsCol = db.collection<ExamDoc>(examsColName);
  const questionsCol = db.collection<QuestionDocument>(questionsColName);

  try {
    const cursor = onlyExam
      ? examsCol.find({ examId: onlyExam })
      : examsCol.find({}, { sort: { examId: 1 } });

    let processedExams = 0;
    let inserted = 0;
    let overwritten = 0;
    let mismatches = 0;
    let unchanged = 0;

    for await (const exam of cursor) {
      const examId = exam.examId;
      const legacyQs = Array.isArray(exam.questions) ? (exam.questions as Array<ExternalQuestion & { id?: string }>) : [];
      if (legacyQs.length === 0) {
        console.log(`Exam ${examId}: no embedded questions, skipping`);
        continue;
      }

      for (const q of legacyQs) {
        const id = (q.id && q.id.trim().length > 0) ? q.id : generateQuestionId(q);
        const existing = await questionsCol.findOne({ examId, id }, { projection: { _id: 0 } });

        if (!existing) {
          if (!dryRun) {
            const now = new Date();
            await questionsCol.insertOne({
              id,
              examId,
              question: q.question,
              options: q.options,
              answer: q.answer,
              question_type: q.question_type,
              explanation: q.explanation,
              study: q.study,
              createdAt: now,
              updatedAt: now,
            });
          }
          inserted++;
          continue;
        }

        const equalNoExpl = fieldsEqualIgnoringExplanation(q, existing);
        if (equalNoExpl) {
          const legacyExpl = (q.explanation ?? undefined);
          const currentExpl = existing.explanation ?? undefined;
          if (legacyExpl !== currentExpl) {
            console.log(`[SKIP-EXPL] ${examId}/${id} explanation differs; preserving existing value`);
          }
          unchanged++;
          continue;
        }

        if (overwrite) {
          if (!dryRun) {
            await questionsCol.updateOne(
              { examId, id },
              {
                $set: {
                  question: q.question,
                  options: q.options,
                  answer: q.answer,
                  question_type: q.question_type,
                  // Do not overwrite explanation on updates
                  study: q.study,
                  updatedAt: new Date(),
                },
              }
            );
          }
          overwritten++;
        } else {
          mismatches++;
          console.log(`[DIFF] ${examId}/${id} differs (excluding explanation); use --overwrite to apply legacy values`);
        }
      }

      processedExams++;
      console.log(`Exam ${examId}: embedded=${legacyQs.length}, inserted=${inserted}, overwritten=${overwritten}, unchanged=${unchanged}, mismatches=${mismatches}`);
    }

    console.log(`\nSync complete. Exams processed: ${processedExams}`);
    console.log(`Inserted: ${inserted}, Overwritten: ${overwritten}, Unchanged: ${unchanged}, Mismatches: ${mismatches}`);
    if (mismatches > 0 && !overwrite) {
      console.log('Run again with --overwrite to apply legacy values to differing questions (explanations are never overwritten).');
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
