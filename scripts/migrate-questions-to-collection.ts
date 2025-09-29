import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';
import { generateQuestionId } from '@/lib/normalize';
import type { ExternalQuestion, ExternalQuestionsFile } from '@/types/external-question';

type ExamDoc = ExternalQuestionsFile & { examId: string; updatedAt?: Date; legacyQuestionsMigrated?: boolean };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const examsColName = requireEnv('MONGODB_EXAMS_COLLECTION');
  const questionsColName = requireEnv('MONGODB_QUESTIONS_COLLECTION');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const examsCol = db.collection<ExamDoc>(examsColName);
  const questionsCol = db.collection(questionsColName);

  // Indexes for questions collection
  await Promise.allSettled([
    questionsCol.createIndex({ examId: 1, id: 1 }, { unique: true, name: 'unique_examId_id' }),
    questionsCol.createIndex({ examId: 1 }, { name: 'examId_1' }),
  ]);

  try {
    const cursor = examsCol.find({}, { sort: { examId: 1 } });
    let migratedExams = 0;
    let insertedQuestions = 0;
    for await (const exam of cursor) {
      const examId = exam.examId;
      const questions = Array.isArray(exam.questions) ? exam.questions : [];
      if (questions.length === 0) {
        console.log(`Exam ${examId}: no embedded questions, skipping`);
        continue;
      }

      const ops = [] as Array<Promise<unknown>>;
      for (const q of questions as Array<ExternalQuestion & { id?: string }>) {
        const id = (q.id && q.id.trim().length > 0) ? q.id : generateQuestionId(q);
        const now = new Date();
        ops.push(
          questionsCol.updateOne(
            { examId, id },
            {
              $setOnInsert: {
                id,
                examId,
                createdAt: now,
              },
              $set: {
                question: q.question,
                options: q.options,
                answer: q.answer,
                question_type: q.question_type,
                explanation: q.explanation,
                study: q.study,
                updatedAt: now,
              },
            },
            { upsert: true }
          )
        );
      }

      const results = await Promise.all(ops);
      insertedQuestions += results.length;

      await examsCol.updateOne(
        { examId },
        { $set: { legacyQuestionsMigrated: true, updatedAt: new Date() } }
      );
      migratedExams++;
      console.log(`Exam ${examId}: migrated ${questions.length} question(s)`);
    }

    console.log(`\nMigration complete. Exams processed: ${migratedExams}, Questions upserted: ${insertedQuestions}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

