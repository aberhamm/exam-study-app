import type { Collection } from 'mongodb';
import type { CompetencyDocument } from '@/types/competency';
import { getDb } from './mongodb';
import { envConfig } from '@/lib/env-config';
import { nanoid } from 'nanoid';
import { buildCompetencyTextForEmbedding, generateEmbedding } from './embeddings';

async function getCompetenciesCollection(): Promise<Collection<CompetencyDocument>> {
  const db = await getDb();
  return db.collection<CompetencyDocument>(envConfig.mongo.examCompetenciesCollection);
}

export async function fetchCompetenciesByExamId(examId: string): Promise<CompetencyDocument[]> {
  const collection = await getCompetenciesCollection();
  const cursor = collection.find({ examId }).sort({ title: 1 });
  const results: CompetencyDocument[] = [];
  for await (const doc of cursor) {
    const { _id: _ignored, ...rest } = doc as CompetencyDocument & { _id?: unknown };
    void _ignored;
    results.push(rest);
  }
  return results;
}

export async function fetchCompetencyById(
  competencyId: string,
  examId: string
): Promise<CompetencyDocument | null> {
  const collection = await getCompetenciesCollection();
  const doc = await collection.findOne({ id: competencyId, examId });
  if (!doc) {
    return null;
  }
  const { _id: _ignored, ...rest } = doc as CompetencyDocument & { _id?: unknown };
  void _ignored;
  return rest;
}

export type CreateCompetencyInput = {
  examId: string;
  title: string;
  description: string;
  examPercentage: number;
};

export async function createCompetency(input: CreateCompetencyInput): Promise<CompetencyDocument> {
  const collection = await getCompetenciesCollection();

  const now = new Date();
  const newCompetency: CompetencyDocument = {
    id: nanoid(),
    examId: input.examId,
    title: input.title,
    description: input.description,
    examPercentage: input.examPercentage,
    questionCount: 0, // Initialize denormalized count
    createdAt: now,
    updatedAt: now,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await collection.insertOne(newCompetency as any);
  return newCompetency;
}

export type UpdateCompetencyInput = {
  title?: string;
  description?: string;
  examPercentage?: number;
};

export async function updateCompetency(
  competencyId: string,
  examId: string,
  updates: UpdateCompetencyInput
): Promise<CompetencyDocument | null> {
  const collection = await getCompetenciesCollection();

  const updateDoc: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (updates.title !== undefined) updateDoc.title = updates.title;
  if (updates.description !== undefined) updateDoc.description = updates.description;
  if (updates.examPercentage !== undefined) updateDoc.examPercentage = updates.examPercentage;

  const result = await collection.findOneAndUpdate(
    { id: competencyId, examId },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );

  if (!result) {
    return null;
  }

  // If title or description changed, automatically regenerate the embedding
  if (updates.title !== undefined || updates.description !== undefined) {
    try {
      const embeddingText = buildCompetencyTextForEmbedding({
        title: result.title,
        description: result.description,
      });
      const embeddingData = await generateEmbedding(embeddingText);

      // Update the competency with the new embedding
      await collection.updateOne(
        { id: competencyId, examId },
        {
          $set: {
            embedding: embeddingData.embedding,
            embeddingModel: embeddingData.embeddingModel,
            embeddingUpdatedAt: embeddingData.embeddingUpdatedAt,
          },
        }
      );

      // Update the result object with the new embedding data
      result.embedding = embeddingData.embedding;
      result.embeddingModel = embeddingData.embeddingModel;
      result.embeddingUpdatedAt = embeddingData.embeddingUpdatedAt;
    } catch (embeddingError) {
      // Log embedding error but don't fail the update
      console.error(`Failed to regenerate embedding for competency ${competencyId}:`, embeddingError);
    }
  }

  const { _id: _ignored, ...rest } = result as CompetencyDocument & { _id?: unknown };
  void _ignored;
  return rest;
}

/**
 * Delete a competency
 *
 * This function implements cascading delete to maintain data integrity:
 * 1. Deletes the competency
 * 2. Automatically removes the competency ID from all questions that reference it
 *
 * No orphaned references are left behind - everything is cleaned up automatically!
 */
export async function deleteCompetency(competencyId: string, examId: string): Promise<boolean> {
  const db = await getDb();
  const competenciesCol = await getCompetenciesCollection();
  const questionsCol = db.collection(envConfig.mongo.questionsCollection);

  // Delete the competency and remove it from all questions in a consistent manner
  const competencyResult = await competenciesCol.deleteOne({ id: competencyId, examId });

  if (competencyResult.deletedCount > 0) {
    // Cascading delete: Remove this competency ID from all questions that reference it
    await questionsCol.updateMany(
      { examId, competencyIds: competencyId },
      {
        $pull: { competencyIds: competencyId },
        $set: { updatedAt: new Date() },
      } as any // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  return competencyResult.deletedCount > 0;
}

export type CompetencyStats = {
  competencyId: string;
  title: string;
  questionCount: number;
  examPercentage: number;
};

/**
 * Aggregate question counts per competency for a given exam.
 *
 * Implementation details:
 * - Unwinds competencyIds and groups by id, returning a single query result.
 * - Avoids N+1 queries over the competencies list.
 */
export async function getCompetencyAssignmentStats(examId: string): Promise<CompetencyStats[]> {
  const db = await getDb();
  const questionsCol = db.collection(envConfig.mongo.questionsCollection);

  // Get all competencies for this exam
  const competencies = await fetchCompetenciesByExamId(examId);

  // Aggregate counts grouped by competencyIds
  type CountRow = { _id: string; count: number };
  const counts = await questionsCol.aggregate<CountRow>([
    { $match: { examId, competencyIds: { $exists: true, $ne: [] } } },
    { $unwind: '$competencyIds' },
    { $group: { _id: '$competencyIds', count: { $sum: 1 } } },
  ]).toArray();

  const countMap = new Map(counts.map(r => [r._id, r.count]));

  // Build stats in the order of competencies list
  const stats: CompetencyStats[] = competencies.map((comp) => ({
    competencyId: comp.id,
    title: comp.title,
    questionCount: countMap.get(comp.id) || 0,
    examPercentage: comp.examPercentage,
  }));

  return stats;
}

export class CompetencyNotFoundError extends Error {
  constructor(competencyId: string) {
    super(`Competency "${competencyId}" not found`);
    this.name = 'CompetencyNotFoundError';
  }
}
