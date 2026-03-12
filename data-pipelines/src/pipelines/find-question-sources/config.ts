import { join, dirname } from 'path';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(moduleDir, '../../../..');

loadDotenv({ path: join(workspaceRoot, '.env') });
loadDotenv({ path: join(workspaceRoot, '.env.local') });
loadDotenv();

export const config = {
  pipelineName: 'find-question-sources',

  embeddingModel: process.env.QUESTIONS_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  embeddingDimensions: parseInt(process.env.QUESTIONS_EMBEDDING_DIMENSIONS ?? '1536', 10),

  topKPerSearch: 5,       // chunks per embedding search (question + answer = 10 total)
  maxDocsAfterRebuild: 3, // top N rebuilt documents kept as context
  maxChunkChars: 4000,    // character cap per rebuilt document
} as const;

export function getPipelinePaths() {
  const pipelineDataDir = join(workspaceRoot, 'data-pipelines', 'data', config.pipelineName);
  return {
    workspaceRoot,
    pipelineDataDir,
    defaultInputFile: join(workspaceRoot, 'data', 'exams', 'sitecore-xmc.json'),
    defaultOutputDir: join(pipelineDataDir, 'output'),
  };
}

export function getEnvConfig() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) throw new Error('Missing OPENAI_API_KEY');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  return {
    openaiApiKey,
    supabaseUrl,
    supabaseServiceRoleKey,
    embeddingModel: config.embeddingModel,
    embeddingDimensions: config.embeddingDimensions,
  };
}
