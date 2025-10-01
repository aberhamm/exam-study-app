import { MongoClient, type Db } from 'mongodb';

const globalForMongo = globalThis as typeof globalThis & {
  __mongoClientPromise?: Promise<MongoClient>;
};

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI environment variable');
  }
  return uri;
}

function getMongoDbName(): string {
  const dbName = process.env.MONGODB_DB;
  if (!dbName) {
    throw new Error('Missing MONGODB_DB environment variable');
  }
  return dbName;
}

let clientPromise: Promise<MongoClient>;

function getMongoClientPromise(): Promise<MongoClient> {
  if (!clientPromise) {
    if (!globalForMongo.__mongoClientPromise) {
      const client = new MongoClient(getMongoUri());
      globalForMongo.__mongoClientPromise = client.connect();
    }
    clientPromise = globalForMongo.__mongoClientPromise;
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClientPromise();
  return client.db(getMongoDbName());
}

export function getExamsCollectionName(): string {
  const collection = process.env.MONGODB_EXAMS_COLLECTION;
  if (!collection) {
    throw new Error('Missing MONGODB_EXAMS_COLLECTION environment variable');
  }
  return collection;
}

export function getQuestionsCollectionName(): string {
  const collection = process.env.MONGODB_QUESTIONS_COLLECTION;
  if (!collection) {
    throw new Error('Missing MONGODB_QUESTIONS_COLLECTION environment variable');
  }
  return collection;
}

export function getQuestionEmbeddingsCollectionName(): string {
  const collection = process.env.MONGODB_QUESTION_EMBEDDINGS_COLLECTION;
  if (!collection) {
    throw new Error('Missing MONGODB_QUESTION_EMBEDDINGS_COLLECTION environment variable');
  }
  return collection;
}

export function getDedupePairsCollectionName(): string {
  const collection = process.env.MONGODB_DEDUPE_PAIRS_COLLECTION;
  if (!collection) {
    throw new Error('Missing MONGODB_DEDUPE_PAIRS_COLLECTION environment variable');
  }
  return collection;
}

export function getQuestionClustersCollectionName(): string {
  const collection = process.env.MONGODB_QUESTION_CLUSTERS_COLLECTION || 'question_clusters';
  return collection;
}
