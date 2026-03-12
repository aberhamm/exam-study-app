import { join, dirname } from 'path';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

// 1) Load workspace root .env  (quiz-app/.env)
// moduleDir = data-pipelines/src/pipelines/enrich-questions  (4 levels below quiz-app root)
const workspaceRoot = join(moduleDir, '../../../..');
loadDotenv({ path: join(workspaceRoot, '.env') });

// 2) Load workspace root .env.local (overrides .env without clobbering already-set vars)
loadDotenv({ path: join(workspaceRoot, '.env.local') });

// 3) Also load CWD .env as final fallback
loadDotenv();

export const config = {
  pipelineName: 'enrich-questions',

  // LLM used for explanation generation (via OpenRouter)
  defaultModel: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',

  // Embedding model (OpenAI)
  embeddingModel: process.env.QUESTIONS_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  embeddingDimensions: parseInt(process.env.QUESTIONS_EMBEDDING_DIMENSIONS ?? '1536', 10),

  // Retrieval parameters
  topKPerSearch: 5,        // chunks fetched per embedding search
  maxDocsAfterRebuild: 3,  // top N rebuilt source-documents kept as context
  maxChunkChars: 4000,     // character cap per rebuilt document

  // Rate-limiting: small pause between LLM calls (ms)
  delayBetweenCallsMs: 1500,
} as const;

// Derive absolute paths for pipeline data directories.
// All relative to workspace root so the pipeline can be invoked from any CWD.
export function getPipelinePaths() {
  const pipelineDataDir = join(workspaceRoot, 'data-pipelines', 'data', config.pipelineName);
  return {
    workspaceRoot,
    pipelineDataDir,
    defaultInputFile: join(workspaceRoot, 'data', 'exams', 'sitecore-xmc.json'),
    defaultOutputDir: join(pipelineDataDir, 'output'),
    defaultLogsDir: join(pipelineDataDir, 'logs'),
  };
}

export function getEnvConfig() {
  const usePortkey = process.env.PIPELINES_USE_PORTKEY === 'true' || process.env.PIPELINES_USE_PORTKEY === '1';

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) throw new Error('Missing OPENAI_API_KEY');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  if (usePortkey) {
    const portkeyApiKey = process.env.PORTKEY_API_KEY;
    if (!portkeyApiKey) throw new Error('Missing PORTKEY_API_KEY (required when PIPELINES_USE_PORTKEY=true)');

    return {
      usePortkey: true as const,
      openaiApiKey,
      supabaseUrl,
      supabaseServiceRoleKey,
      portkeyApiKey,
      portkeyBaseUrl: process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1',
      portkeyProvider: process.env.PORTKEY_PROVIDER,
      portkeyCustomHeaders: process.env.PORTKEY_CUSTOM_HEADERS,
      model: process.env.PORTKEY_MODEL_QUESTION_GENERATION || process.env.PORTKEY_MODEL || config.defaultModel,
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
    };
  }

  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) throw new Error('Missing OPENROUTER_API_KEY');

  return {
    usePortkey: false as const,
    openaiApiKey,
    openrouterApiKey,
    supabaseUrl,
    supabaseServiceRoleKey,
    model: config.defaultModel,
    embeddingModel: config.embeddingModel,
    embeddingDimensions: config.embeddingDimensions,
  };
}
