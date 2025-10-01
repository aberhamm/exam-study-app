import { join, dirname } from 'path';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables from both the workspace and the current CWD
// 1) Load data-pipelines/.env (relative to this file)
const moduleDir = dirname(fileURLToPath(import.meta.url));
const workspaceEnvPath = join(moduleDir, '../../../.env');
loadDotenv({ path: workspaceEnvPath });
// 2) Also load CWD .env as fallback without overriding existing values
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
  supportedInputExtensions: ['.json'],

  // Processing configuration
  chunkSize: 2000, // characters per chunk (docs Q&A sweet spot)
  chunkOverlap: 300, // character overlap for continuity
};

// Default JSON field containing markdown text
export const JSON_MARKDOWN_FIELD = 'markdown';

export function getPipelinePaths(pipelineName: string = config.pipelineName) {
  // Prefer workspace-relative data dir; fall back to CWD-based if needed
  const moduleRoot = join(moduleDir, '../../..');
  const base = join(moduleRoot, 'data', pipelineName);

  return {
    defaultInputDir: join(base, 'input'),
    defaultOutputDir: join(base, 'output'),
    defaultLogsDir: join(base, 'logs'),
    defaultTempDir: join(base, 'temp'),
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
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const database = process.env.MONGODB_DATABASE || process.env.MONGODB_DB;
  const collection = process.env.EMBEDDINGS_COLLECTION || 'embeddings';

  if (!uri || !database) {
    const hadUri = Boolean(uri);
    const hadDb = Boolean(database);
    throw new Error(
      `MongoDB env missing (uri? ${hadUri}, database? ${hadDb}). Checked keys uri=[MONGODB_URI,MONGO_URI], db=[MONGODB_DATABASE,MONGODB_DB]`
    );
  }

  return {
    uri,
    database,
    collection,
  };
}
