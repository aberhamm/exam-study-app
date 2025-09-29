import { MongoClient, Db } from 'mongodb';
import type { CreateIndexesOptions, IndexSpecification } from 'mongodb';
import type { EmbeddingDocument } from '../types/embedding.js';

export interface MongoConfig {
  uri: string;
  database: string;
}

export class MongoDBService {
  private client: MongoClient;
  private db: Db | null = null;
  private isConnected = false;

  constructor(private config: MongoConfig) {
    this.client = new MongoClient(config.uri);
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

    const embeddingsCollection = this.db.collection('embeddings');

    // Create indexes for common query patterns
    const indexes: Array<{ key: IndexSpecification; options: CreateIndexesOptions }> = [
      { key: { sourceFile: 1 }, options: { name: 'sourceFile_1' } },
      { key: { 'metadata.createdAt': -1 }, options: { name: 'createdAt_-1' } },
      { key: { 'metadata.model': 1 }, options: { name: 'model_1' } },
      { key: { 'metadata.tags': 1 }, options: { name: 'tags_1' } },
      { key: { sourceFile: 1, 'metadata.createdAt': -1 }, options: { name: 'sourceFile_createdAt_compound' } },
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

    const collection = this.db.collection('embeddings');

    // Add MongoDB-specific fields
    const documentWithId = {
      ...document,
      _id: undefined, // Let MongoDB generate the ID
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const result = await collection.insertOne(documentWithId);
      return result.insertedId.toString();
    } catch (error) {
      throw new Error(`Failed to save embedding document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findEmbeddingsBySourceFile(sourceFile: string): Promise<EmbeddingDocument[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection('embeddings');
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

    const collection = this.db.collection('embeddings');
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

    const collection = this.db.collection('embeddings');
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

    const collection = this.db.collection('embeddings');
    const result = await collection.deleteMany({ sourceFile });

    return result.deletedCount;
  }

  async updateEmbeddingDocument(sourceFile: string, document: Partial<EmbeddingDocument>): Promise<boolean> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collection = this.db.collection('embeddings');
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

export function createMongoDBService(uri: string, database: string): MongoDBService {
  return new MongoDBService({ uri, database });
}
