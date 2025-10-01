/**
 * Centralized environment configuration with defaults and validation.
 * All environment variables should be accessed through this module.
 */

/**
 * Validates that a required environment variable is present
 */
function requireEnvVar(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Parses a string environment variable as an integer with optional default
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

/**
 * Checks if an environment variable value represents a truthy value
 * Truthy values: 1, true, yes, on (case-insensitive)
 */
function isTruthyEnv(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * MongoDB configuration
 */
export const mongoConfig = {
  get uri(): string {
    return requireEnvVar('MONGODB_URI', process.env.MONGODB_URI);
  },

  get database(): string {
    return requireEnvVar('MONGODB_DB', process.env.MONGODB_DB);
  },

  // Collection names (hardcoded)
  examsCollection: 'exams',
  questionsCollection: 'questions',
  questionEmbeddingsCollection: 'question_embeddings',
  dedupePairsCollection: 'question_duplicates',
  questionClustersCollection: 'question_clusters',
  examCompetenciesCollection: 'exam_competencies',

  // Vector index names (hardcoded)
  questionEmbeddingsVectorIndex: 'question_embeddings_vector_index',
  competenciesVectorIndex: 'competencies_vector_index',
} as const;

/**
 * OpenAI and embeddings configuration
 */
export const openaiConfig = {
  get apiKey(): string {
    return requireEnvVar('OPENAI_API_KEY', process.env.OPENAI_API_KEY);
  },

  get embeddingModel(): string {
    return process.env.QUESTIONS_EMBEDDING_MODEL ||
           process.env.OPENAI_EMBEDDING_MODEL ||
           'text-embedding-3-small';
  },

  get embeddingDimensions(): number {
    return parseIntEnv(
      process.env.QUESTIONS_EMBEDDING_DIMENSIONS || process.env.EMBEDDING_DIMENSIONS,
      1536
    );
  },
} as const;

/**
 * Data pipeline configuration
 */
export const pipelineConfig = {
  get embeddingsCollection(): string {
    return process.env.EMBEDDINGS_COLLECTION || 'embeddings';
  },

  get openrouterApiKey(): string {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('Missing required environment variable: OPENROUTER_API_KEY');
    }
    return apiKey;
  },

  get openrouterModel(): string {
    return process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  },
} as const;

/**
 * Feature flags configuration
 */
export const featureFlags = {
  get devFeaturesEnabled(): boolean {
    // Primary: explicit server-side flag
    if (isTruthyEnv(process.env.ENABLE_DEV_FEATURES)) return true;
    // Secondary: public/client build-time flag
    if (isTruthyEnv(process.env.NEXT_PUBLIC_ENABLE_DEV_FEATURES)) return true;
    // Fallback: development environment
    return process.env.NODE_ENV === 'development';
  },
} as const;

/**
 * Application environment configuration
 */
export const appConfig = {
  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  },

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  },

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;

/**
 * Centralized environment configuration object
 */
export const envConfig = {
  mongo: mongoConfig,
  openai: openaiConfig,
  pipeline: pipelineConfig,
  features: featureFlags,
  app: appConfig,
} as const;

/**
 * Validates all required environment variables at startup
 * Call this early in your application to ensure all required config is present
 */
export function validateRequiredEnvVars(): void {
  try {
    // Test access to all required variables
    const requiredVars = [
      mongoConfig.uri,
      mongoConfig.database,
      openaiConfig.apiKey,
    ];
    // If we get here, all required variables are accessible
    console.log(`Environment validation passed for ${requiredVars.length} required variables`);
  } catch (error) {
    console.error('Environment variable validation failed:', error);
    throw error;
  }
}

export default envConfig;