import type { Collection } from 'mongodb';
import type { ExternalQuestion, ExternalQuestionsFile } from '@/types/external-question';
import type { ExamSummary } from '@/types/api';
import { getDb, getExamsCollectionName } from './mongodb';

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
