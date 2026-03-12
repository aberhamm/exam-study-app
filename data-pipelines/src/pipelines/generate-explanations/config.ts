import { join, dirname } from 'path';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(moduleDir, '../../../..');

loadDotenv({ path: join(workspaceRoot, '.env') });
loadDotenv({ path: join(workspaceRoot, '.env.local') });
loadDotenv();

export const config = {
  pipelineName: 'generate-explanations',
  defaultModel: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
  delayBetweenCallsMs: 1500,
} as const;

export function getPipelinePaths() {
  const pipelineDataDir = join(workspaceRoot, 'data-pipelines', 'data', config.pipelineName);
  return {
    workspaceRoot,
    pipelineDataDir,
    // Default input is the output of find-question-sources
    defaultInputFile: join(
      workspaceRoot,
      'data-pipelines',
      'data',
      'find-question-sources',
      'output',
      'sourced-sitecore-xmc.json'
    ),
    defaultOutputDir: join(pipelineDataDir, 'output'),
  };
}

export function getEnvConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  const usePortkey =
    process.env.PIPELINES_USE_PORTKEY === 'true' || process.env.PIPELINES_USE_PORTKEY === '1';

  if (usePortkey) {
    const portkeyApiKey = process.env.PORTKEY_API_KEY;
    if (!portkeyApiKey) throw new Error('Missing PORTKEY_API_KEY');
    return {
      usePortkey: true as const,
      supabaseUrl,
      supabaseServiceRoleKey,
      portkeyApiKey,
      portkeyBaseUrl: process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1',
      portkeyProvider: process.env.PORTKEY_PROVIDER,
      portkeyCustomHeaders: process.env.PORTKEY_CUSTOM_HEADERS,
      model:
        process.env.PORTKEY_MODEL_QUESTION_GENERATION ||
        process.env.PORTKEY_MODEL ||
        config.defaultModel,
    };
  }

  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) throw new Error('Missing OPENROUTER_API_KEY');

  return {
    usePortkey: false as const,
    supabaseUrl,
    supabaseServiceRoleKey,
    openrouterApiKey,
    model: config.defaultModel,
  };
}
