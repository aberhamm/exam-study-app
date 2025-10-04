import type { Collection, Document } from 'mongodb';
import { getDb, getDocumentEmbeddingsCollectionName } from '@/lib/server/mongodb';
import { envConfig } from '@/lib/env-config';
import type { EmbeddingChunkDocument } from '@/data-pipelines/src/shared/types/embedding';

export type SimilarDocument = {
  document: EmbeddingChunkDocument;
  score: number;
};

async function getDocumentEmbeddingsCollection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection<Document>(getDocumentEmbeddingsCollectionName());
}

export async function searchSimilarDocuments(
  queryEmbedding: number[],
  topK: number = 10,
  groupIds?: string | string[]
): Promise<SimilarDocument[]> {
  const indexName = envConfig.mongo.documentEmbeddingsVectorIndex;
  const embCol = await getDocumentEmbeddingsCollection();

  try {
    if (envConfig.app.isDevelopment) {
      console.info(`[documentVectorSearch] index=${indexName} groupIds=${Array.isArray(groupIds) ? groupIds.join(',') : groupIds || 'all'} topK=${topK} candidates=${Math.max(100, topK * 5)}`);
    }

    // Build filter based on groupIds
    let filter: Document | undefined;
    if (groupIds) {
      if (Array.isArray(groupIds) && groupIds.length > 0) {
        filter = { groupId: { $in: groupIds } };
      } else if (typeof groupIds === 'string') {
        filter = { groupId: groupIds };
      }
    }

    // Vector search pipeline
    const vectorPipeline: Document[] = [
      {
        $vectorSearch: {
          index: indexName,
          queryVector: queryEmbedding,
          path: 'embedding',
          numCandidates: Math.max(100, topK * 5),
          limit: topK,
          ...(filter ? { filter } : {}),
        },
      },
      {
        $project: {
          text: 1,
          sourceFile: 1,
          sourceBasename: 1,
          groupId: 1,
          title: 1,
          description: 1,
          url: 1,
          tags: 1,
          sectionPath: 1,
          nearestHeading: 1,
          chunkIndex: 1,
          chunkTotal: 1,
          startIndex: 1,
          endIndex: 1,
          model: 1,
          dimensions: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const results: SimilarDocument[] = [];
    const cursor = embCol.aggregate(vectorPipeline);

    for await (const doc of cursor) {
      results.push({
        document: doc as unknown as EmbeddingChunkDocument,
        score: (doc as { score?: number }).score || 0,
      });
    }

    if (envConfig.app.isDevelopment && results.length > 0) {
      console.info(`[documentVectorSearch] Retrieved ${results.length} results, best score: ${results[0]?.score.toFixed(4)}`);
    }

    return results;
  } catch (error) {
    // If vector search is unavailable, return empty result
    console.warn(`[documentVectorSearch] Failed or unsupported; returning empty results. index=${indexName} groupIds=${Array.isArray(groupIds) ? groupIds.join(',') : groupIds || 'all'} topK=${topK}`, error);
    return [];
  }
}
