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

  await questionsCol.updateOne(
    { _id: new ObjectId(questionId), examId },
    {
      $set: {
        competencyIds,
        updatedAt: new Date(),
      },
    }
  );
}

export async function unassignCompetenciesFromQuestion(
  questionId: string,
  examId: string
): Promise<void> {
  const questionsCol = await getQuestionsCollection();
  const { ObjectId } = await import('mongodb');

  if (!ObjectId.isValid(questionId)) {
    throw new Error('Invalid question ID format');
  }

  await questionsCol.updateOne(
    { _id: new ObjectId(questionId), examId },
    {
      $set: {
        competencyIds: [],
        updatedAt: new Date(),
      },
    }
  );
}
