export interface TextChunk {
  content: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingVector {
  embedding: number[];
  chunk: TextChunk;
  model: string;
  dimensions: number;
}

export interface EmbeddingDocument {
  sourceFile: string;
  totalChunks: number;
  embeddings: EmbeddingVector[];
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
    createdAt: string;
    model: string;
    dimensions: number;
  };
}

export interface EmbeddingProcessingResult {
  success: boolean;
  document?: EmbeddingDocument;
  error?: string;
  processingTime: number;
  chunkCount?: number;
}