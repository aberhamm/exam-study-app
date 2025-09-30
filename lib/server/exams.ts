import type { Collection } from 'mongodb';
import type { ExamDetail } from '@/types/external-question';
import type { ExamSummary } from '@/types/api';
import { getDb, getExamsCollectionName } from './mongodb';

type ExamDocument = ExamDetail & {
  _id?: unknown;
  examId: string;
};

// Questions are managed in a separate collection; no embedded question types here.

function mapExamDocument(doc: ExamDocument): ExamDetail {
  const { _id: _ignored, ...rest } = doc;
  void _ignored;
  return rest;
}

async function getExamsCollection(): Promise<Collection<ExamDocument>> {
  const db = await getDb();
  return db.collection<ExamDocument>(getExamsCollectionName());
}

export async function fetchExamById(examId: string): Promise<ExamDetail | null> {
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

// Legacy embedded-question writers have been removed; questions live in their own collection.
