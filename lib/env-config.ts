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
  usersCollection: 'users',

  // Vector index names (hardcoded)
  questionEmbeddingsVectorIndex: 'question_embeddings_vector_index',
  competenciesVectorIndex: 'competencies_vector_index',
  documentEmbeddingsVectorIndex: 'embedding_vector',
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
  // Collection names (hardcoded - these are schema/structural, not environment-specific)
  documentEmbeddingsCollection: 'document_embeddings',
  documentEmbeddingsVectorIndex: 'embedding_vector',

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

  // Vector search configuration
  get candidateMultiplier(): number {
    return parseInt(process.env.CANDIDATE_MULTIPLIER || '10');
  },

  get maxCandidates(): number {
    return parseInt(process.env.MAX_CANDIDATES || '100');
  },

  get maxContextChunks(): number {
    return parseInt(process.env.MAX_CONTEXT_CHUNKS || '4');
  },

  get maxChunkChars(): number {
    return parseInt(process.env.MAX_CHUNK_CHARS || '1500');
  },

  // API timeouts and retries
  get apiTimeoutMs(): number {
    return parseInt(process.env.API_TIMEOUT_MS || '30000');
  },

  get maxRetries(): number {
    return parseInt(process.env.MAX_RETRIES || '3');
  },
} as const;

/**
 * Feature flags configuration
 */
export const featureFlags = {
  get debugRetrieval(): boolean {
    return isTruthyEnv(process.env.DEBUG_RETRIEVAL);
  },
} as const;

/**
 * Authentication and session configuration
 */
export const authConfig = {
  /**
   * Session max age in seconds
   * Default: 28800 (8 hours)
   * Special values:
   *   - "never" or "0": Sets to 30 years (effectively never expires)
   */
  get sessionMaxAge(): number {
    const value = process.env.SESSION_MAX_AGE;

    // Handle "never" or "0" as never expiring (30 years)
    if (value === 'never' || value === '0') {
      return 30 * 365 * 24 * 60 * 60; // 30 years in seconds (946,080,000)
    }

    // Parse as integer with 8 hour default
    return parseIntEnv(value, 8 * 60 * 60); // Default: 8 hours
  },

  /**
   * Session update age in seconds (how often to update session activity)
   * Default: 3600 (1 hour)
   */
  get sessionUpdateAge(): number {
    return parseIntEnv(process.env.SESSION_UPDATE_AGE, 60 * 60); // Default: 1 hour
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
  auth: authConfig,
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
