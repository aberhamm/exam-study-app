import type { Collection } from 'mongodb';
import type { CompetencyDocument } from '@/types/competency';
import { getDb } from './mongodb';
import { envConfig } from '@/lib/env-config';
import { nanoid } from 'nanoid';

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

  // If title or description changed, clear embedding so it can be regenerated
  if (updates.title !== undefined || updates.description !== undefined) {
    updateDoc.embedding = undefined;
    updateDoc.embeddingModel = undefined;
    updateDoc.embeddingUpdatedAt = undefined;
  }

  const result = await collection.findOneAndUpdate(
    { id: competencyId, examId },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );

  if (!result) {
    return null;
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
        $pull: { competencyIds: competencyId } as any,
        $set: { updatedAt: new Date() },
      }
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

export async function getCompetencyAssignmentStats(examId: string): Promise<CompetencyStats[]> {
  const db = await getDb();
  const competenciesCol = await getCompetenciesCollection();
  const questionsCol = db.collection(envConfig.mongo.questionsCollection);

  // Get all competencies for this exam
  const competencies = await fetchCompetenciesByExamId(examId);

  // Count questions for each competency
  const stats: CompetencyStats[] = [];
  for (const comp of competencies) {
    const count = await questionsCol.countDocuments({
      examId,
      competencyIds: comp.id,
    });

    stats.push({
      competencyId: comp.id,
      title: comp.title,
      questionCount: count,
      examPercentage: comp.examPercentage,
    });
  }

  return stats;
}

export class CompetencyNotFoundError extends Error {
  constructor(competencyId: string) {
    super(`Competency "${competencyId}" not found`);
    this.name = 'CompetencyNotFoundError';
  }
}
