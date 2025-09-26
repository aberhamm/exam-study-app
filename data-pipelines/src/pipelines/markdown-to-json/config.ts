import { join } from 'path';
import { config as loadDotenv } from 'dotenv';

// Load environment variables from .env file
loadDotenv();

export const config = {
  // Default paths (can be overridden via CLI args)
  defaultInputDir: join(process.cwd(), 'data', 'input'),
  defaultOutputDir: join(process.cwd(), 'data', 'output'),
  defaultLogsDir: join(process.cwd(), 'data', 'logs'),

  // API configuration
  defaultModel: 'anthropic/claude-3.5-sonnet',

  // Environment variables
  apiKeyEnvVar: 'OPENROUTER_API_KEY',

  // File patterns
  supportedInputExtensions: ['.md', '.markdown'],
};

export function getEnvConfig() {
  const apiKey = process.env[config.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(`${config.apiKeyEnvVar} environment variable is required`);
  }

  return {
    apiKey,
    model: process.env.OPENROUTER_MODEL || config.defaultModel,
  };
}