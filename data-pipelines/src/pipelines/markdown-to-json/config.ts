import { join } from 'path';
import { config as loadDotenv } from 'dotenv';

// Load environment variables from .env file
loadDotenv();

export const config = {
  // Pipeline name
  pipelineName: 'markdown-to-json',

  // API configuration
  defaultModel: 'anthropic/claude-3.5-sonnet',

  // Environment variables
  apiKeyEnvVar: 'OPENROUTER_API_KEY',

  // File patterns
  supportedInputExtensions: ['.md', '.markdown'],
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

export async function getEnvConfig() {
  // Dynamic import to avoid import issues in this ESM module
  const { envConfig } = await import('../../../../lib/env-config.js');

  if (envConfig.features.pipelinesUsePortkey) {
    if (!envConfig.portkey.apiKey) {
      throw new Error('PORTKEY_API_KEY is required when PIPELINES_USE_PORTKEY=true');
    }
    return {
      usePortkey: true as const,
      apiKey: envConfig.portkey.apiKey,
      baseUrl: envConfig.portkey.baseUrl,
      provider: envConfig.portkey.provider,
      customHeaders: envConfig.portkey.customHeaders,
      model: envConfig.portkey.modelGeneration || envConfig.portkey.model,
    };
  }

  return {
    usePortkey: false as const,
    apiKey: envConfig.pipeline.openrouterApiKey,
    model: envConfig.pipeline.openrouterModel,
  };
}