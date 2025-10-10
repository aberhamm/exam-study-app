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
    url?: string;
    tags?: string[];
    createdAt: string;
    model: string;
    dimensions: number;
    sourceBasename?: string;
    sourceMeta?: Record<string, unknown>;
    contentHash?: string;
    groupId?: string;
    headings?: string[];
    sectionPaths?: string[];
  };
}

export interface EmbeddingProcessingResult {
  success: boolean;
  document?: EmbeddingDocument;
  error?: string;
  processingTime: number;
  chunkCount?: number;
}

export interface EmbeddingChunkDocument {
  embedding: number[];
  text: string;
  sourceFile: string;
  sourceBasename?: string;
  groupId?: string;
  title?: string;
  description?: string;
  url?: string;
  tags?: string[];
  sectionPath?: string;
  nearestHeading?: string;
  chunkIndex: number;
  chunkTotal: number;
  startIndex: number;
  endIndex: number;
  model: string;
  dimensions: number;
  contentHash?: string; // file-level content hash
  chunkContentHash: string; // hash of this chunk's text
  sourceMeta?: Record<string, unknown>;
}
