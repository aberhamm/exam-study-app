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

export async function getEnvConfig() {
  // Dynamic import to avoid import issues in this ESM module
  const { envConfig } = await import('../../../../lib/env-config.js');

  return {
    apiKey: envConfig.openai.apiKey,
    model: envConfig.openai.embeddingModel,
    dimensions: envConfig.openai.embeddingDimensions,
  };
}

export async function getMongoConfig() {
  // Dynamic import to avoid import issues in this ESM module
  const { envConfig } = await import('../../../../lib/env-config.js');

  return {
    uri: envConfig.mongo.uri,
    database: envConfig.mongo.database,
    collection: envConfig.pipeline.embeddingsCollection,
  };
}
