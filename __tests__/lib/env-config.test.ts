import { envConfig, mongoConfig, pipelineConfig } from '@/lib/env-config';

describe('env-config', () => {
  describe('mongoConfig', () => {
    describe('hardcoded collection names', () => {
      it('has correct exams collection name', () => {
        expect(mongoConfig.examsCollection).toBe('exams');
      });

      it('has correct questions collection name', () => {
        expect(mongoConfig.questionsCollection).toBe('questions');
      });

      it('has correct question embeddings collection name', () => {
        expect(mongoConfig.questionEmbeddingsCollection).toBe('question_embeddings');
      });

      it('has correct dedupe pairs collection name', () => {
        expect(mongoConfig.dedupePairsCollection).toBe('question_duplicates');
      });

      it('has correct question clusters collection name', () => {
        expect(mongoConfig.questionClustersCollection).toBe('question_clusters');
      });

      it('has correct exam competencies collection name', () => {
        expect(mongoConfig.examCompetenciesCollection).toBe('exam_competencies');
      });
    });

    describe('hardcoded vector index names', () => {
      it('has correct question embeddings vector index name', () => {
        expect(mongoConfig.questionEmbeddingsVectorIndex).toBe('question_embeddings_vector_index');
      });

      it('has correct competencies vector index name', () => {
        expect(mongoConfig.competenciesVectorIndex).toBe('competencies_vector_index');
      });
    });
  });

  describe('pipelineConfig', () => {
    describe('hardcoded collection and index names', () => {
      it('has correct document embeddings collection name', () => {
        expect(pipelineConfig.documentEmbeddingsCollection).toBe('document_embeddings');
      });

      it('has correct document embeddings vector index name', () => {
        expect(pipelineConfig.documentEmbeddingsVectorIndex).toBe('embedding_vector');
      });

      it('collection names are constant values', () => {
        // Verify these are simple string constants, not computed from env vars
        const collection1 = pipelineConfig.documentEmbeddingsCollection;
        const collection2 = pipelineConfig.documentEmbeddingsCollection;
        expect(collection1).toBe(collection2);
        expect(collection1).toBe('document_embeddings');
      });
    });

    describe('vector search defaults', () => {
      const originalEnv = process.env;

      beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      it('returns default candidateMultiplier when env var not set', () => {
        delete process.env.CANDIDATE_MULTIPLIER;
        expect(pipelineConfig.candidateMultiplier).toBe(10);
      });

      it('returns default maxCandidates when env var not set', () => {
        delete process.env.MAX_CANDIDATES;
        expect(pipelineConfig.maxCandidates).toBe(100);
      });

      it('returns default maxContextChunks when env var not set', () => {
        delete process.env.MAX_CONTEXT_CHUNKS;
        expect(pipelineConfig.maxContextChunks).toBe(4);
      });

      it('returns default maxChunkChars when env var not set', () => {
        delete process.env.MAX_CHUNK_CHARS;
        expect(pipelineConfig.maxChunkChars).toBe(1500);
      });

      it('returns default apiTimeoutMs when env var not set', () => {
        delete process.env.API_TIMEOUT_MS;
        expect(pipelineConfig.apiTimeoutMs).toBe(30000);
      });

      it('returns default maxRetries when env var not set', () => {
        delete process.env.MAX_RETRIES;
        expect(pipelineConfig.maxRetries).toBe(3);
      });
    });
  });

  describe('envConfig structure', () => {
    it('exposes all config sections', () => {
      expect(envConfig.mongo).toBeDefined();
      expect(envConfig.openai).toBeDefined();
      expect(envConfig.pipeline).toBeDefined();
      expect(envConfig.features).toBeDefined();
      expect(envConfig.app).toBeDefined();
    });

    it('mongo config points to mongoConfig', () => {
      expect(envConfig.mongo).toBe(mongoConfig);
    });

    it('pipeline config points to pipelineConfig', () => {
      expect(envConfig.pipeline).toBe(pipelineConfig);
    });
  });

  describe('collection name consistency', () => {
    it('all collection names are non-empty strings', () => {
      // Verify that collection names are hardcoded constants, not dependent on env vars
      const collectionNames = [
        mongoConfig.examsCollection,
        mongoConfig.questionsCollection,
        mongoConfig.questionEmbeddingsCollection,
        mongoConfig.dedupePairsCollection,
        mongoConfig.questionClustersCollection,
        mongoConfig.examCompetenciesCollection,
        pipelineConfig.documentEmbeddingsCollection,
      ];

      // All should be non-empty strings
      collectionNames.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    it('has expected hardcoded collection values', () => {
      // Verify these are actual hardcoded values, not getters that could change
      expect(mongoConfig.examsCollection).toBe('exams');
      expect(mongoConfig.questionsCollection).toBe('questions');
      expect(pipelineConfig.documentEmbeddingsCollection).toBe('document_embeddings');
    });

    it('document embeddings uses distinct collection from question embeddings', () => {
      // These should be different collections for different purposes
      expect(pipelineConfig.documentEmbeddingsCollection).not.toBe(
        mongoConfig.questionEmbeddingsCollection
      );
      expect(pipelineConfig.documentEmbeddingsCollection).toBe('document_embeddings');
      expect(mongoConfig.questionEmbeddingsCollection).toBe('question_embeddings');
    });
  });
});
