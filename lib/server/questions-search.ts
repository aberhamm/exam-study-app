import type { Collection, Document } from 'mongodb';
import { getDb, getQuestionsCollectionName, getQuestionEmbeddingsCollectionName } from '@/lib/server/mongodb';
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
  const indexName = process.env.MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX
    || process.env.MONGODB_QUESTIONS_VECTOR_INDEX
    || 'question_embedding';
  const embCol = await getEmbeddingsCollection();
  const questionsCol = await getQuestionsCollection();

  try {
    // MongoDB Atlas Vector Search pipeline
    const pipeline: Document[] = [
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
      // Join question fields
      {
        $lookup: {
          from: questionsCol.collectionName,
          let: { qid: '$id', qexam: '$examId' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$id', '$$qid'] }, { $eq: ['$examId', '$$qexam'] } ] } } },
            { $project: { _id: 0, embedding: 0, embeddingModel: 0, embeddingUpdatedAt: 0 } },
          ],
          as: 'q',
        },
      },
      { $unwind: '$q' },
      {
        $project: {
          _id: 0,
          id: '$q.id',
          examId: '$q.examId',
          question: '$q.question',
          options: '$q.options',
          answer: '$q.answer',
          question_type: '$q.question_type',
          explanation: '$q.explanation',
          study: '$q.study',
          createdAt: '$q.createdAt',
          updatedAt: '$q.updatedAt',
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const cursor = embCol.aggregate(pipeline);
    const results: SimilarQuestion[] = [];
    for await (const doc of cursor) {
      const { score, ...rest } = doc as unknown as QuestionDocument & { score: number };
      results.push({ question: rest, score });
    }
    return results;
  } catch (error) {
    // If vector search is unavailable, return empty result (or implement a text fallback if desired)
    console.warn('Vector search failed or unsupported; returning empty results.', error);
    return [];
  }
}
