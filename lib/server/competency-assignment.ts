import type { Collection, Document } from 'mongodb';
import { getDb } from '@/lib/server/mongodb';
import { envConfig } from '@/lib/env-config';
import type { CompetencyDocument } from '@/types/competency';
import type { QuestionDocument } from '@/types/question';

export type SimilarCompetency = {
  competency: CompetencyDocument;
  score: number;
};

async function getCompetenciesCollection(): Promise<Collection<CompetencyDocument>> {
  const db = await getDb();
  return db.collection<CompetencyDocument>(envConfig.mongo.examCompetenciesCollection);
}

async function getQuestionsCollection(): Promise<Collection<QuestionDocument>> {
  const db = await getDb();
  return db.collection<QuestionDocument>(envConfig.mongo.questionsCollection);
}

export async function searchSimilarCompetencies(
  queryEmbedding: number[],
  examId: string,
  topK: number = 3
): Promise<SimilarCompetency[]> {
  const indexName = envConfig.mongo.competenciesVectorIndex;
  const competenciesCol = await getCompetenciesCollection();

  try {
    if (envConfig.app.isDevelopment) {
      console.info(
        `[searchSimilarCompetencies] index=${indexName} examId=${examId} topK=${topK} candidates=${Math.max(
          50,
          topK * 5
        )}`
      );
    }

    // MongoDB Atlas Vector Search pipeline
    const pipeline: Document[] = [
      {
        $vectorSearch: {
          index: indexName,
          queryVector: queryEmbedding,
          path: 'embedding',
          numCandidates: Math.max(50, topK * 5),
          limit: topK,
          filter: { examId },
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          examId: 1,
          title: 1,
          description: 1,
          examPercentage: 1,
          embedding: 1,
          embeddingModel: 1,
          embeddingUpdatedAt: 1,
          createdAt: 1,
          updatedAt: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const cursor = competenciesCol.aggregate(pipeline);
    const results: SimilarCompetency[] = [];
    for await (const doc of cursor) {
      const { score, ...rest } = doc as unknown as CompetencyDocument & { score: number };
      results.push({ competency: rest, score });
    }

    if (results.length > 0) {
      return results;
    }

    // Fallback: if vector search returns empty
    if (envConfig.app.isDevelopment) {
      try {
        const count = await competenciesCol.countDocuments({ examId });
        const sample = await competenciesCol.findOne(
          { examId },
          { projection: { _id: 0, embedding: 1 } }
        );
        const dim = Array.isArray(sample?.embedding)
          ? (sample!.embedding as number[]).length
          : null;
        console.info(
          `[searchSimilarCompetencies] 0 results. competenciesForExam=${count} sampleDim=${dim ?? 'n/a'}`
        );
      } catch (e) {
        console.warn('[searchSimilarCompetencies] diagnostics failed', e);
      }
    }
    return results;
  } catch (error) {
    console.warn(
      `[searchSimilarCompetencies] Failed or unsupported; returning empty results. index=${indexName} examId=${examId} topK=${topK}`,
      error
    );
    return [];
  }
}

/**
 * Helper function to update competency question counts
 *
 * This maintains the denormalized `questionCount` field on competencies.
 * Called automatically by assignCompetenciesToQuestion and unassignCompetenciesFromQuestion.
 *
 * @param examId - The exam ID
 * @param competenciesToIncrement - Array of competency IDs to increment count
 * @param competenciesToDecrement - Array of competency IDs to decrement count
 */
async function updateCompetencyQuestionCounts(
  examId: string,
  competenciesToIncrement: string[],
  competenciesToDecrement: string[]
): Promise<void> {
  const competenciesCol = await getCompetenciesCollection();

  // Increment counts for newly assigned competencies
  if (competenciesToIncrement.length > 0) {
    await competenciesCol.updateMany(
      { examId, id: { $in: competenciesToIncrement } },
      { $inc: { questionCount: 1 }, $set: { updatedAt: new Date() } }
    );
  }

  // Decrement counts for unassigned competencies
  if (competenciesToDecrement.length > 0) {
    await competenciesCol.updateMany(
      { examId, id: { $in: competenciesToDecrement } },
      { $inc: { questionCount: -1 }, $set: { updatedAt: new Date() } }
    );
  }
}

/**
 * Assign competencies to a question
 *
 * This function automatically maintains sync by:
 * 1. Updating the question's competencyIds
 * 2. Incrementing questionCount for newly assigned competencies
 * 3. Decrementing questionCount for removed competencies
 *
 * No manual sync needed - everything happens automatically!
 */
export async function assignCompetenciesToQuestion(
  questionId: string,
  examId: string,
  competencyIds: string[]
): Promise<void> {
  const questionsCol = await getQuestionsCollection();
  const { ObjectId } = await import('mongodb');

  if (!ObjectId.isValid(questionId)) {
    throw new Error('Invalid question ID format');
  }

  // Get current competency assignments to calculate the diff
  const currentQuestion = await questionsCol.findOne(
    { _id: new ObjectId(questionId), examId },
    { projection: { competencyIds: 1 } }
  );

  const currentCompetencyIds = currentQuestion?.competencyIds || [];
  const newCompetencyIds = competencyIds;

  // Calculate which competencies are being added and removed
  const competenciesToAdd = newCompetencyIds.filter(id => !currentCompetencyIds.includes(id));
  const competenciesToRemove = currentCompetencyIds.filter(id => !newCompetencyIds.includes(id));

  // Update the question
  await questionsCol.updateOne(
    { _id: new ObjectId(questionId), examId },
    {
      $set: {
        competencyIds,
        updatedAt: new Date(),
      },
    }
  );

  // Update denormalized counts in competencies
  await updateCompetencyQuestionCounts(examId, competenciesToAdd, competenciesToRemove);
}

/**
 * Unassign all competencies from a question
 *
 * This function automatically maintains sync by:
 * 1. Clearing the question's competencyIds
 * 2. Decrementing questionCount for all previously assigned competencies
 *
 * No manual sync needed - everything happens automatically!
 */
export async function unassignCompetenciesFromQuestion(
  questionId: string,
  examId: string
): Promise<void> {
  const questionsCol = await getQuestionsCollection();
  const { ObjectId } = await import('mongodb');

  if (!ObjectId.isValid(questionId)) {
    throw new Error('Invalid question ID format');
  }

  // Get current competency assignments to decrement their counts
  const currentQuestion = await questionsCol.findOne(
    { _id: new ObjectId(questionId), examId },
    { projection: { competencyIds: 1 } }
  );

  const currentCompetencyIds = currentQuestion?.competencyIds || [];

  // Update the question
  await questionsCol.updateOne(
    { _id: new ObjectId(questionId), examId },
    {
      $set: {
        competencyIds: [],
        updatedAt: new Date(),
      },
    }
  );

  // Decrement counts for all previously assigned competencies
  await updateCompetencyQuestionCounts(examId, [], currentCompetencyIds);
}
