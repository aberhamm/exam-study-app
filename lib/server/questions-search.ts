import type { Collection, Document } from 'mongodb';
import { getDb, getQuestionsCollectionName, getQuestionEmbeddingsCollectionName } from '@/lib/server/mongodb';
import { envConfig } from '@/lib/env-config';
import type { QuestionDocument } from '@/types/question';

export type SimilarQuestion = {
  question: QuestionDocument;
  score: number;
};

async function getQuestionsCollection(): Promise<Collection<QuestionDocument>> {
  const db = await getDb();
  return db.collection<QuestionDocument>(getQuestionsCollectionName());
}

async function getEmbeddingsCollection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection<Document>(getQuestionEmbeddingsCollectionName());
}

export async function searchSimilarQuestions(
  examId: string,
  queryEmbedding: number[],
  topK: number = 10
): Promise<SimilarQuestion[]> {
  const indexName = envConfig.mongo.questionEmbeddingsVectorIndex;
  const embCol = await getEmbeddingsCollection();
  const questionsCol = await getQuestionsCollection();

  try {
    if (envConfig.app.isDevelopment) {
      console.info(`[vectorSearch] index=${indexName} examId=${examId} topK=${topK} candidates=${Math.max(100, topK * 5)}`);
    }

    // Step 1: Vector search for question_id and scores only
    const vectorPipeline: Document[] = [
      {
        $vectorSearch: {
          index: indexName,
          queryVector: queryEmbedding,
          path: 'embedding',
          numCandidates: Math.max(100, topK * 5),
          limit: topK,
          filter: { examId },
        },
      },
      {
        $project: {
          question_id: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const vectorResults: Array<{ question_id: unknown; score: number }> = [];
    const cursor = embCol.aggregate(vectorPipeline);

    for await (const doc of cursor) {
      vectorResults.push(doc as { question_id: unknown; score: number });
    }

    if (vectorResults.length === 0) {
      if (envConfig.app.isDevelopment) {
        console.warn('[vectorSearch] No results from vector search');
      }
      return [];
    }

    // Step 2: Extract ObjectIds for question lookup
    const questionIds = vectorResults.map(r => r.question_id);
    const scoreMap = new Map(vectorResults.map(r => [String(r.question_id), r.score]));

    // Step 3: Fetch full documents from questions collection
    const documents = await questionsCol
      .find({ _id: { $in: questionIds } } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .toArray();

    // Step 4: Map results with scores
    const results: SimilarQuestion[] = documents.map(doc => ({
      question: {
        ...doc,
        id: (doc as any)._id.toString(), // eslint-disable-line @typescript-eslint/no-explicit-any
      },
      score: scoreMap.get(String((doc as any)._id)) || 0, // eslint-disable-line @typescript-eslint/no-explicit-any
    }));

    if (envConfig.app.isDevelopment && results.length > 0) {
      console.info(`[vectorSearch] Retrieved ${results.length} results, best score: ${results[0]?.score.toFixed(4)}`);
    }

    return results;
  } catch (error) {
    // If vector search is unavailable, return empty result (or implement a text fallback if desired)
    console.warn(`[vectorSearch] Failed or unsupported; returning empty results. index=${indexName} examId=${examId} topK=${topK}`, error);
    return [];
  }
}
