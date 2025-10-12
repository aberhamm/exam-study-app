import { MongoClient, type Db } from 'mongodb';
import { envConfig } from '@/lib/env-config';

const globalForMongo = globalThis as typeof globalThis & {
  __mongoClientPromise?: Promise<MongoClient>;
};

let clientPromise: Promise<MongoClient>;

function getMongoClientPromise(): Promise<MongoClient> {
  if (!clientPromise) {
    if (!globalForMongo.__mongoClientPromise) {
      const client = new MongoClient(envConfig.mongo.uri);
      globalForMongo.__mongoClientPromise = client.connect();
    }
    clientPromise = globalForMongo.__mongoClientPromise;
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClientPromise();
  return client.db(envConfig.mongo.database);
}

export function getExamsCollectionName(): string {
  return envConfig.mongo.examsCollection;
}

export function getQuestionsCollectionName(): string {
  return envConfig.mongo.questionsCollection;
}

export function getQuestionEmbeddingsCollectionName(): string {
  return envConfig.mongo.questionEmbeddingsCollection;
}

export function getDedupePairsCollectionName(): string {
  return envConfig.mongo.dedupePairsCollection;
}

export function getQuestionClustersCollectionName(): string {
  return envConfig.mongo.questionClustersCollection;
}

export function getDocumentEmbeddingsCollectionName(): string {
  return 'document_embeddings';
}

/**
 * Close the MongoDB connection
 * Useful for scripts that need to exit cleanly
 */
export async function closeConnection(): Promise<void> {
  if (globalForMongo.__mongoClientPromise) {
    const client = await globalForMongo.__mongoClientPromise;
    await client.close();
    delete globalForMongo.__mongoClientPromise;
    clientPromise = undefined as unknown as Promise<MongoClient>;
  }
}
