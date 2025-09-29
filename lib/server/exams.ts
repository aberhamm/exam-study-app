import type { Collection } from 'mongodb';
import type { ExternalQuestion, ExternalQuestionsFile } from '@/types/external-question';
import type { ExamSummary } from '@/types/api';
import { getDb, getExamsCollectionName } from './mongodb';
import { generateQuestionId } from '@/lib/normalize';

type ExamDocument = ExternalQuestionsFile & {
  _id?: unknown;
  examId: string;
};

type QuestionWithId = ExternalQuestion & { id: string };

function mapExamDocument(doc: ExamDocument): ExternalQuestionsFile {
  const { _id: _ignored, ...rest } = doc;
  void _ignored;
  return rest;
}

async function getExamsCollection(): Promise<Collection<ExamDocument>> {
  const db = await getDb();
  return db.collection<ExamDocument>(getExamsCollectionName());
}

export async function fetchExamById(examId: string): Promise<ExternalQuestionsFile | null> {
  const collection = await getExamsCollection();
  const doc = await collection.findOne({ examId });
  if (!doc) {
    return null;
  }
  return mapExamDocument(doc);
}

export async function listExamSummaries(): Promise<ExamSummary[]> {
  const collection = await getExamsCollection();
  const cursor = collection.find({}, { projection: { examId: 1, examTitle: 1 } }).sort({ examId: 1 });
  const results: ExamSummary[] = [];
  for await (const doc of cursor) {
    results.push({ examId: doc.examId, examTitle: doc.examTitle });
  }
  return results;
}

export class ExamNotFoundError extends Error {
  constructor(examId: string) {
    super(`Exam "${examId}" not found`);
    this.name = 'ExamNotFoundError';
  }
}

export class DuplicateQuestionIdsError extends Error {
  constructor(public readonly duplicates: string[]) {
    super(`Duplicate question ids: ${duplicates.join(', ')}`);
    this.name = 'DuplicateQuestionIdsError';
  }
}

export async function addExamQuestions(
  examId: string,
  questions: ExternalQuestion[]
): Promise<QuestionWithId[]> {
  const collection = await getExamsCollection();
  const doc = await collection.findOne({ examId }, { projection: { questions: 1 } });

  if (!doc) {
    throw new ExamNotFoundError(examId);
  }

  const existingIds = new Set(
    (doc.questions ?? []).map((question) => generateQuestionId(question))
  );

  const toInsert: QuestionWithId[] = [];
  const seenNewIds = new Set<string>();
  const duplicates: string[] = [];

  for (const question of questions) {
    const id = generateQuestionId(question);
    if (existingIds.has(id) || seenNewIds.has(id)) {
      duplicates.push(id);
      continue;
    }
    seenNewIds.add(id);
    toInsert.push({ ...question, id });
  }

  if (duplicates.length > 0) {
    throw new DuplicateQuestionIdsError(duplicates);
  }

  if (toInsert.length === 0) {
    return [];
  }

  await collection.updateOne(
    { examId },
    {
      $push: { questions: { $each: toInsert } },
      $set: { updatedAt: new Date() },
    }
  );

  return toInsert;
}

export async function updateExamQuestion(
  examId: string,
  question: QuestionWithId
): Promise<QuestionWithId | null> {
  const collection = await getExamsCollection();
  const result = await collection.updateOne(
    { examId, 'questions.id': question.id },
    {
      $set: {
        'questions.$': question,
        updatedAt: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    return null;
  }

  return question;
}
