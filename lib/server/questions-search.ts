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

    if (results.length > 0) {
      return results;
    }

    // Fallback path: if join returned 0, fetch questions by id from raw hits
    if (envConfig.app.isDevelopment) {
      try {
        const count = await embCol.countDocuments({ examId });
        const sample = await embCol.findOne({ examId }, { projection: { _id: 0, embedding: 1 } });
        const dim = Array.isArray(sample?.embedding) ? (sample!.embedding as number[]).length : null;
        console.info(`[vectorSearch] 0 results. embeddingsForExam=${count} sampleDim=${dim ?? 'n/a'}`);

        // Extra diagnostics: check raw hits before join
        type RawHit = { id: string; examId: string; score?: number };
        const rawHits = await embCol
          .aggregate<RawHit>([
            { $vectorSearch: { index: indexName, queryVector: queryEmbedding, path: 'embedding', numCandidates: Math.max(100, topK * 5), limit: topK, filter: { examId } } },
            { $project: { _id: 0, id: 1, examId: 1, score: { $meta: 'vectorSearchScore' } } },
          ])
          .toArray();
        const rawCount = rawHits.length;
        const sampleHit = rawHits[0];
        console.info(`[vectorSearch] pre-join hits=${rawCount} sampleHitId=${sampleHit?.id ?? 'n/a'} sampleHitExam=${sampleHit?.examId ?? 'n/a'}`);

        // Global hits without exam filter (diagnostic only)
        const globalHits = await embCol
          .aggregate<RawHit>([
            { $vectorSearch: { index: indexName, queryVector: queryEmbedding, path: 'embedding', numCandidates: Math.max(100, topK * 5), limit: topK } },
            { $project: { _id: 0, id: 1, examId: 1, score: { $meta: 'vectorSearchScore' } } },
          ])
          .toArray();
        const globalCount = globalHits.length;
        const sampleGlobal = globalHits[0];
        console.info(`[vectorSearch] global hits=${globalCount} sampleGlobalExam=${sampleGlobal?.examId ?? 'n/a'} sampleGlobalId=${sampleGlobal?.id ?? 'n/a'}`);

        // Dimension histogram (exam)
        const dimHist = await embCol
          .aggregate([
            { $match: { examId } },
            { $project: { dim: { $size: { $ifNull: ['$embedding', []] } } } },
            { $group: { _id: '$dim', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ])
          .toArray();
        console.info(`[vectorSearch] dim histogram (exam=${examId}): ${dimHist.map(d => `${d._id}:${d.count}`).join(', ') || 'n/a'}`);

        if (rawCount > 0 && sampleHit?.id && sampleHit?.examId) {
          const hasQuestion = await questionsCol.findOne({ id: sampleHit.id, examId: sampleHit.examId }, { projection: { _id: 0, id: 1 } });
          console.info(`[vectorSearch] join check for sampleHitId=${sampleHit.id}: questionExists=${!!hasQuestion}`);
        }

        // Attempt fallback: materialize results via app-side join
        if (rawCount > 0) {
          const fallback: SimilarQuestion[] = [];
          for (const hit of rawHits) {
            const q = await questionsCol.findOne({ id: hit.id, examId: hit.examId });
            if (q) fallback.push({ question: q as QuestionDocument, score: hit.score ?? 0 });
          }
          if (fallback.length > 0) {
            console.info(`[vectorSearch] returning ${fallback.length} fallback result(s) after app-side join.`);
            return fallback.slice(0, topK);
          }
        }
      } catch (e) {
        console.warn('[vectorSearch] diagnostics failed', e);
      }
    }
    return results; // empty
  } catch (error) {
    // If vector search is unavailable, return empty result (or implement a text fallback if desired)
    console.warn(`[vectorSearch] Failed or unsupported; returning empty results. index=${indexName} examId=${examId} topK=${topK}`, error);
    return [];
  }
}
