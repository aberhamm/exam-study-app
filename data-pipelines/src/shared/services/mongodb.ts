import { MongoClient, Db } from 'mongodb';
import type { CreateIndexesOptions, IndexSpecification } from 'mongodb';
import type { EmbeddingDocument, EmbeddingChunkDocument } from '../types/embedding.js';

export interface MongoConfig {
  uri: string;
  database: string;
  collectionName?: string;
}

export class MongoDBService {
  private client: MongoClient;
  private db: Db | null = null;
  private isConnected = false;
  private collectionName: string;

  constructor(private config: MongoConfig) {
    this.client = new MongoClient(config.uri);
    this.collectionName = config.collectionName || 'embeddings';
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.client.connect();
      this.db = this.client.db(this.config.database);
      this.isConnected = true;

      // Create indexes for optimal query performance
      await this.createIndexes();
    } catch (error) {
      throw new Error(`Failed to connect to MongoDB: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      this.db = null;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const embeddingsCollection = this.db.collection(this.collectionName);

    // Create indexes for per-chunk document schema
    const indexes: Array<{ key: IndexSpecification; options: CreateIndexesOptions }> = [
      { key: { sourceFile: 1 }, options: { name: 'sourceFile_1' } },
      { key: { groupId: 1 }, options: { name: 'groupId_1' } },
      { key: { model: 1 }, options: { name: 'model_1' } },
      { key: { tags: 1 }, options: { name: 'tags_1' } },
      { key: { url: 1 }, options: { name: 'url_1' } },
      { key: { sectionPath: 1 }, options: { name: 'sectionPath_1' } },
      { key: { nearestHeading: 1 }, options: { name: 'nearestHeading_1' } },
      { key: { chunkContentHash: 1 }, options: { name: 'chunkContentHash_1', unique: false } },
      { key: { sourceFile: 1, chunkIndex: 1 }, options: { name: 'sourceFile_chunkIndex_1', unique: false } },
      { key: { sourceFile: 1, chunkContentHash: 1 }, options: { name: 'uniq_sourceFile_chunkHash', unique: true } },
      { key: { updatedAt: -1 }, options: { name: 'updatedAt_-1' } },
      { key: { createdAt: -1 }, options: { name: 'createdAt_-1' } },
    ];

    for (const { key, options } of indexes) {
      try {
        await embeddingsCollection.createIndex(key, options);
      } catch (error) {
        // Index might already exist, continue with other indexes
        console.warn(`Failed to create index ${options.name}:`, error);
      }
    }
  }

  async saveEmbeddingDocument(document: EmbeddingDocument): Promise<string> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection(this.collectionName);

    // Add MongoDB-specific fields (let MongoDB generate _id)
    const now = new Date();
    const documentWithTimestamps = {
      ...document,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const result = await collection.insertOne(documentWithTimestamps);
      return result.insertedId.toString();
    } catch (error) {
      throw new Error(`Failed to save embedding document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async bulkUpsertEmbeddingChunks(docs: EmbeddingChunkDocument[]): Promise<{ matched: number; modified: number; upserted: number }> {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    if (!docs.length) {
      return { matched: 0, modified: 0, upserted: 0 };
    }
    const collection = this.db.collection(this.collectionName);
    const now = new Date();
    const ops = docs.map((doc) => ({
      updateOne: {
        filter: { sourceFile: doc.sourceFile, chunkContentHash: doc.chunkContentHash },
        update: {
          $set: { ...doc, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));
    const result = await collection.bulkWrite(ops, { ordered: false });
    return {
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
      upserted: result.upsertedCount ?? 0,
    };
  }

  async upsertEmbeddingDocument(document: EmbeddingDocument): Promise<string> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection(this.collectionName);

    const now = new Date();
    const toSet = {
      ...document,
      updatedAt: now,
    } as Partial<EmbeddingDocument> & { updatedAt: Date };

    try {
      const result = await collection.updateOne(
        { sourceFile: document.sourceFile },
        {
          $set: toSet,
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );

      // If upsert occurred, upsertedId is present; otherwise return sourceFile
      return result.upsertedId ? result.upsertedId.toString() : document.sourceFile;
    } catch (error) {
      throw new Error(`Failed to upsert embedding document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findEmbeddingsBySourceFile(sourceFile: string): Promise<EmbeddingDocument[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection(this.collectionName);
    const documents = await collection.find({ sourceFile }).toArray();

    return documents.map(doc => ({
      sourceFile: doc.sourceFile,
      totalChunks: doc.totalChunks,
      embeddings: doc.embeddings,
      metadata: doc.metadata,
    }));
  }

  async findEmbeddingsByModel(model: string): Promise<EmbeddingDocument[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection(this.collectionName);
    const documents = await collection.find({ 'metadata.model': model }).toArray();

    return documents.map(doc => ({
      sourceFile: doc.sourceFile,
      totalChunks: doc.totalChunks,
      embeddings: doc.embeddings,
      metadata: doc.metadata,
    }));
  }

  async findEmbeddingsByTags(tags: string[]): Promise<EmbeddingDocument[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection(this.collectionName);
    const documents = await collection.find({
      'metadata.tags': { $in: tags }
    }).toArray();

    return documents.map(doc => ({
      sourceFile: doc.sourceFile,
      totalChunks: doc.totalChunks,
      embeddings: doc.embeddings,
      metadata: doc.metadata,
    }));
  }

  async deleteEmbeddingsBySourceFile(sourceFile: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection(this.collectionName);
    const result = await collection.deleteMany({ sourceFile });

    return result.deletedCount;
  }

  async updateEmbeddingDocument(sourceFile: string, document: Partial<EmbeddingDocument>): Promise<boolean> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection(this.collectionName);
    const updateDoc = {
      ...document,
      updatedAt: new Date(),
    };

    const result = await collection.updateOne(
      { sourceFile },
      { $set: updateDoc }
    );

    return result.modifiedCount > 0;
  }

  async getAllEmbeddings(): Promise<EmbeddingDocument[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection('embeddings');
    const documents = await collection.find({}).toArray();

    return documents.map(doc => ({
      sourceFile: doc.sourceFile,
      totalChunks: doc.totalChunks,
      embeddings: doc.embeddings,
      metadata: doc.metadata,
    }));
  }

  async getEmbeddingStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    models: string[];
    latestUpdate: Date | null;
  }> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection('embeddings');

    const [totalDocuments, aggregationResult] = await Promise.all([
      collection.countDocuments(),
      collection.aggregate([
        {
          $group: {
            _id: null,
            totalChunks: { $sum: '$totalChunks' },
            models: { $addToSet: '$metadata.model' },
            latestUpdate: { $max: '$updatedAt' }
          }
        }
      ]).toArray()
    ]);

    const stats = aggregationResult[0] || {
      totalChunks: 0,
      models: [],
      latestUpdate: null
    };

    return {
      totalDocuments,
      totalChunks: stats.totalChunks,
      models: stats.models,
      latestUpdate: stats.latestUpdate
    };
  }
}

export function createMongoDBService(uri: string, database: string, collectionName: string = 'embeddings'): MongoDBService {
  return new MongoDBService({ uri, database, collectionName });
}
