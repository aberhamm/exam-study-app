import type { Collection, IndexSpecification } from 'mongodb';
import type { ExternalQuestion, ExternalQuestionsFile } from '@/types/external-question';
import type { QuestionDocument, QuestionWithId } from '@/types/question';
import { getDb, getExamsCollectionName, getQuestionsCollectionName } from './mongodb';
import { generateQuestionId } from '@/lib/normalize';
import { DuplicateQuestionIdsError, ExamNotFoundError } from '@/lib/server/exams';

type ExamDocument = ExternalQuestionsFile & {
  _id?: unknown;
  examId: string;
  createdAt?: Date;
  updatedAt?: Date;
  legacyQuestionsMigrated?: boolean;
};

function sanitizeStudy(value: unknown): ExternalQuestion['study'] | undefined {
  return Array.isArray(value) ? (value as ExternalQuestion['study']) : undefined;
}

function mapQuestionDocToExternal(q: QuestionDocument): ExternalQuestion & { id: string } {
  const { id, question, options, answer, question_type, explanation, study } = q;
  return {
    id,
    question,
    options,
    answer,
    question_type,
    explanation,
    study: sanitizeStudy(study as unknown),
  };
}

async function getQuestionsCollection(): Promise<Collection<QuestionDocument>> {
  const db = await getDb();
  const collection = db.collection<QuestionDocument>(getQuestionsCollectionName());

  // Ensure indexes exist (idempotent)
  const textIndex = { question: 'text' } as unknown as IndexSpecification;
  await Promise.allSettled([
    collection.createIndex({ examId: 1, id: 1 }, { unique: true, name: 'unique_examId_id' }),
    collection.createIndex({ examId: 1 }, { name: 'examId_1' }),
    collection.createIndex(textIndex, { name: 'question_text' }),
  ]);

  return collection;
}

async function getExamsCollection(): Promise<Collection<ExamDocument>> {
  const db = await getDb();
  return db.collection<ExamDocument>(getExamsCollectionName());
}

export async function listQuestionsByExam(examId: string): Promise<QuestionDocument[]> {
  const collection = await getQuestionsCollection();
  return collection
    .find({ examId }, { projection: { embedding: 0, embeddingModel: 0, embeddingUpdatedAt: 0 } })
    .sort({ _id: 1 })
    .toArray();
}

export async function addExamQuestions(
  examId: string,
  questions: ExternalQuestion[],
): Promise<QuestionWithId[]> {
  const collection = await getQuestionsCollection();

  // Validate exam exists
  const examsCol = await getExamsCollection();
  const examDoc = await examsCol.findOne({ examId }, { projection: { examId: 1 } });
  if (!examDoc) {
    throw new ExamNotFoundError(examId);
  }

  // Load existing ids for this exam
  const existingIds = new Set<string>();
  // From new questions collection
  const existing = collection.find({ examId }, { projection: { id: 1 } });
  for await (const doc of existing) existingIds.add(doc.id);

  const toInsert: QuestionWithId[] = [];
  const duplicates: string[] = [];

  for (const q of questions) {
    const id = generateQuestionId(q);
    if (existingIds.has(id) || toInsert.some((x) => x.id === id)) {
      duplicates.push(id);
      continue;
    }
    const now = new Date();
    toInsert.push({
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

  if (duplicates.length > 0) {
    throw new DuplicateQuestionIdsError(duplicates);
  }

  if (toInsert.length === 0) return [];

  await collection.insertMany(toInsert, { ordered: true });

  return toInsert;
}

export async function updateQuestion(
  examId: string,
  question: QuestionWithId,
): Promise<QuestionWithId | null> {
  const collection = await getQuestionsCollection();

  const result = await collection.updateOne(
    { examId, id: question.id },
    { $set: { ...question, updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    return null;
  }


  return { ...question };
}

export async function fetchExamDetail(examId: string): Promise<ExternalQuestionsFile | null> {
  const examsCol = await getExamsCollection();
  const exam = await examsCol.findOne({ examId });
  if (!exam) return null;

  // Always use the dedicated questions collection
  const questionsCol = await getQuestionsCollection();
  const questions = await questionsCol
    .find({ examId }, { projection: { embedding: 0, embeddingModel: 0, embeddingUpdatedAt: 0 } })
    .sort({ _id: 1 })
    .toArray();

  const externalQs = questions.map((q) => mapQuestionDocToExternal(q));
  return {
    examId: exam.examId,
    examTitle: exam.examTitle,
    welcomeConfig: exam.welcomeConfig,
    questions: externalQs,
  };
}

export async function getExamCacheTag(examId: string): Promise<string> {
  const db = await getDb();
  const examsCol = db.collection(getExamsCollectionName());
  const questionsCol = db.collection<QuestionDocument>(getQuestionsCollectionName());

  const [exam, agg] = await Promise.all([
    examsCol.findOne({ examId }, { projection: { updatedAt: 1 } }),
    questionsCol
      .aggregate<{
        count: number;
        maxUpdatedAt: Date | null;
      }>([
        { $match: { examId } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            maxUpdatedAt: { $max: '$updatedAt' },
          },
        },
      ])
      .toArray(),
  ]);

  const examUpdatedAt = (exam as { updatedAt?: Date } | null)?.updatedAt ?? new Date(0);
  const summary = agg[0] || { count: 0, maxUpdatedAt: null };
  const questionsUpdatedAt = summary.maxUpdatedAt ?? new Date(0);

  const tag = `W/"v1-ex:${examUpdatedAt.getTime()}-qc:${summary.count}-qu:${questionsUpdatedAt.getTime()}"`;
  return tag;
}

export async function getQuestionById(examId: string, id: string): Promise<QuestionDocument | null> {
  const collection = await getQuestionsCollection();
  return collection.findOne({ examId, id });
}
