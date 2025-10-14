import type { Collection, IndexSpecification, ObjectId } from 'mongodb';
import type { ExternalQuestion, ExamDetail } from '@/types/external-question';
import type { QuestionDocument, QuestionWithId } from '@/types/question';
import { getDb, getExamsCollectionName, getQuestionsCollectionName } from './mongodb';
import { ExamNotFoundError } from '@/lib/server/exams';
import { ObjectId as MongoObjectId } from 'mongodb';

type ExamDocument = ExamDetail & {
  _id?: unknown;
  examId: string;
  createdAt?: Date;
  updatedAt?: Date;
  legacyQuestionsMigrated?: boolean;
};

function sanitizeStudy(value: unknown): ExternalQuestion['study'] | undefined {
  return Array.isArray(value) ? (value as ExternalQuestion['study']) : undefined;
}

function mapQuestionDocToExternal(q: QuestionDocument & { _id: ObjectId }): ExternalQuestion & { id: string } {
  const { _id, question, options, answer, question_type, explanation, explanationGeneratedByAI, explanationSources, study } = q;
  return {
    id: _id.toString(),
    question,
    options,
    answer,
    question_type,
    explanation,
    explanationGeneratedByAI,
    explanationSources,
    study: sanitizeStudy(study as unknown),
  };
}

async function getQuestionsCollection(): Promise<Collection<QuestionDocument>> {
  const db = await getDb();
  const collection = db.collection<QuestionDocument>(getQuestionsCollectionName());

  // Ensure indexes exist (idempotent)
  const textIndex = { question: 'text' } as unknown as IndexSpecification;
  await Promise.allSettled([
    collection.createIndex({ examId: 1 }, { name: 'examId_1' }),
    collection.createIndex(textIndex, { name: 'question_text' }),
    // Index for filtering questions by competency
    collection.createIndex({ examId: 1, competencyIds: 1 }, { name: 'examId_competencyIds' }),
    // Index for filtering flagged questions
    collection.createIndex({ examId: 1, flaggedForReview: 1 }, { name: 'examId_flaggedForReview' }),
    // Index for admin flagged questions view
    collection.createIndex({ flaggedForReview: 1, flaggedAt: -1 }, { name: 'flaggedForReview_flaggedAt' }),
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

export type QuestionInsertResult = QuestionWithId & { _id: ObjectId };

export async function addExamQuestions(
  examId: string,
  questions: ExternalQuestion[],
): Promise<QuestionInsertResult[]> {
  const collection = await getQuestionsCollection();

  // Validate exam exists
  const examsCol = await getExamsCollection();
  const examDoc = await examsCol.findOne({ examId }, { projection: { examId: 1 } });
  if (!examDoc) {
    throw new ExamNotFoundError(examId);
  }

  const toInsert: QuestionWithId[] = [];

  for (const q of questions) {
    const now = new Date();
    toInsert.push({
      examId,
      question: q.question,
      options: q.options,
      answer: q.answer,
      question_type: q.question_type,
      explanation: q.explanation,
      explanationSources: q.explanationSources,
      study: q.study,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (toInsert.length === 0) return [];

  const result = await collection.insertMany(toInsert, { ordered: true });

  // Return inserted documents with their _id values
  const insertedWithIds = toInsert.map((doc, index) => ({
    ...doc,
    _id: result.insertedIds[index],
  }));

  return insertedWithIds;
}

export async function updateQuestion(
  examId: string,
  questionId: string,
  question: QuestionWithId,
): Promise<QuestionWithId | null> {
  const collection = await getQuestionsCollection();

  if (!MongoObjectId.isValid(questionId)) {
    return null;
  }

  // Exclude _id and createdAt from the update to avoid MongoDB errors
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, ...updateFields } = question as QuestionWithId & { _id?: unknown; createdAt?: Date };

  const result = await collection.updateOne(
    { _id: new MongoObjectId(questionId), examId },
    { $set: { ...updateFields, updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    return null;
  }

  return { ...question };
}

export async function fetchExamDetail(examId: string): Promise<ExamDetail | null> {
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
    documentGroups: exam.documentGroups,
    questions: externalQs,
  };
}

export type ExamStats = {
  total: number;
  byType: { single: number; multiple: number };
  byExplanation: { with: number; without: number };
  matrix: {
    single: { with: number; without: number };
    multiple: { with: number; without: number };
  };
};

export async function computeExamStats(examId: string): Promise<ExamStats> {
  const questionsCol = await getQuestionsCollection();

  const agg = await questionsCol
    .aggregate<{
      _id: { type: 'single' | 'multiple' | null; hasExplanation: boolean };
      count: number;
    }>([
      { $match: { examId } },
      {
        $group: {
          _id: {
            type: '$question_type',
            hasExplanation: {
              $gt: [
                {
                  $strLenCP: {
                    $trim: { input: { $ifNull: ['$explanation', ''] } },
                  },
                },
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  let total = 0;
  let single = 0;
  let multiple = 0;
  let singleWith = 0;
  let singleWithout = 0;
  let multipleWith = 0;
  let multipleWithout = 0;

  for (const row of agg) {
    const type = row._id.type;
    const hasExp = row._id.hasExplanation;
    const count = row.count;
    total += count;
    if (type === 'single') {
      single += count;
      if (hasExp) singleWith += count; else singleWithout += count;
    } else if (type === 'multiple') {
      multiple += count;
      if (hasExp) multipleWith += count; else multipleWithout += count;
    }
  }

  return {
    total,
    byType: { single, multiple },
    byExplanation: { with: singleWith + multipleWith, without: singleWithout + multipleWithout },
    matrix: {
      single: { with: singleWith, without: singleWithout },
      multiple: { with: multipleWith, without: multipleWithout },
    },
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

export async function getQuestionById(examId: string, questionId: string): Promise<(QuestionDocument & { _id: ObjectId }) | null> {
  const collection = await getQuestionsCollection();

  if (!MongoObjectId.isValid(questionId)) {
    return null;
  }

  return collection.findOne({ _id: new MongoObjectId(questionId), examId }) as Promise<(QuestionDocument & { _id: ObjectId }) | null>;
}
