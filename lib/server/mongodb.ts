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

if (globalForMongo.__mongoClientPromise) {
  clientPromise = globalForMongo.__mongoClientPromise;
} else {
  const client = new MongoClient(getMongoUri());
  clientPromise = client.connect();
  if (process.env.NODE_ENV !== 'production') {
    globalForMongo.__mongoClientPromise = clientPromise;
  }
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(getMongoDbName());
}

export function getExamsCollectionName(): string {
  const collection = process.env.MONGODB_EXAMS_COLLECTION;
  if (!collection) {
    throw new Error('Missing MONGODB_EXAMS_COLLECTION environment variable');
  }
  return collection;
}
