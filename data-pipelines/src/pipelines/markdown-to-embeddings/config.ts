import { join } from 'path';
import { config as loadDotenv } from 'dotenv';

// Load environment variables from .env file
loadDotenv();

export const config = {
  // Pipeline name
  pipelineName: 'markdown-to-embeddings',

  // API configuration
  defaultModel: 'text-embedding-3-small',
  defaultEmbeddingDimensions: 1536,

  // Environment variables
  apiKeyEnvVar: 'OPENAI_API_KEY',

  // File patterns
  supportedInputExtensions: ['.md', '.markdown'],

  // Processing configuration
  chunkSize: 1000, // characters per chunk
  chunkOverlap: 200, // character overlap between chunks
};

export function getPipelinePaths(pipelineName: string = config.pipelineName) {
  const pipelineDataDir = join(process.cwd(), 'data', pipelineName);

  return {
    defaultInputDir: join(pipelineDataDir, 'input'),
    defaultOutputDir: join(pipelineDataDir, 'output'),
    defaultLogsDir: join(pipelineDataDir, 'logs'),
    defaultTempDir: join(pipelineDataDir, 'temp'),
  };
}

export function getEnvConfig() {
  const apiKey = process.env[config.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(`${config.apiKeyEnvVar} environment variable is required`);
  }

  return {
    apiKey,
    model: process.env.OPENAI_EMBEDDING_MODEL || config.defaultModel,
    dimensions: process.env.EMBEDDING_DIMENSIONS ? parseInt(process.env.EMBEDDING_DIMENSIONS, 10) : config.defaultEmbeddingDimensions,
  };
}

export function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const database = process.env.MONGODB_DATABASE;

  if (!uri || !database) {
    throw new Error('MONGODB_URI and MONGODB_DATABASE environment variables are required for MongoDB integration');
  }

  return {
    uri,
    database,
  };
}