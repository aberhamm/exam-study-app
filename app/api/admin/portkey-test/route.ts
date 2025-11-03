import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-supabase';
import {
  envConfig,
  buildPortkeyCustomHeaders,
  extractPortkeyProvider,
} from '@/lib/env-config';
import OpenAI from 'openai';
import { createHeaders } from 'portkey-ai';
import { buildPortkeyEmbeddingPayload } from '@/lib/llm-client';

const DATABASE_EMBEDDING_DIMS = 1536;

function getExpectedEmbeddingDims(model?: string): number {
  if (!model) {
    return DATABASE_EMBEDDING_DIMS;
  }

  const normalized = model.toLowerCase();

  if (normalized.includes('titan-embed-text-v2')) {
    return 1024;
  }

  if (normalized.includes('cohere.embed-english') || normalized.includes('cohere.embed-multilingual')) {
    return 1024;
  }

  if (normalized.includes('text-embedding-3-large')) {
    return 3072;
  }

  if (normalized.includes('text-embedding-3-small')) {
    return 1536;
  }

  return DATABASE_EMBEDDING_DIMS;
}

type PortkeyTestConfig = {
  apiKey?: string;
  baseUrl?: string;
  customHeaders?: string;
  provider?: string;
  model?: string;
  modelChat?: string;
  modelExplanation?: string;
  modelEmbeddings?: string;
};

type TestResult = {
  test: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  details?: unknown;
  duration?: number;
};

/**
 * Test Portkey configuration
 * POST /api/admin/portkey-test
 */
export async function POST(request: Request) {
  try {
    // Require admin access
    await requireAdmin();

    const body = await request.json();
    const { testEmbeddings = true, testChat = true, config: customConfig } = body;

    const results: TestResult[] = [];

    const envDefaults: PortkeyTestConfig = {
      apiKey: envConfig.portkey.apiKey,
      baseUrl: envConfig.portkey.baseUrl,
      customHeaders: envConfig.portkey.customHeaders,
      provider: envConfig.portkey.provider,
      model: envConfig.portkey.model,
      modelChat: envConfig.portkey.modelChat,
      modelExplanation: envConfig.portkey.modelExplanation,
      modelEmbeddings: envConfig.portkey.modelEmbeddings,
    };

    const mergedConfig: PortkeyTestConfig = {
      ...envDefaults,
      ...(customConfig as PortkeyTestConfig | undefined),
    };

    const resolvedProvider =
      mergedConfig.provider ||
      extractPortkeyProvider({ headerString: mergedConfig.customHeaders }) ||
      undefined;

    const config: Required<Pick<PortkeyTestConfig, 'apiKey' | 'baseUrl'>> & PortkeyTestConfig = {
      ...mergedConfig,
      provider: resolvedProvider,
    } as Required<Pick<PortkeyTestConfig, 'apiKey' | 'baseUrl'>> & PortkeyTestConfig;

    // Test 1: Check configuration
    results.push({
      test: 'Configuration Check',
      status: config.apiKey ? 'success' : 'error',
      message: config.apiKey
        ? `Base URL: ${config.baseUrl}, API Key: ${config.apiKey?.substring(0, 8)}...`
        : 'API Key not provided',
      details: {
        baseUrl: config.baseUrl,
        hasApiKey: !!config.apiKey,
        provider: config.provider || null,
        hasCustomHeaders: !!config.customHeaders,
        models: {
          default: config.model,
          chat: config.modelChat,
          explanation: config.modelExplanation,
          embeddings: config.modelEmbeddings,
        },
      },
    });

    if (!config.apiKey) {
      return NextResponse.json({ results }, { status: 400 });
    }

    // Parse custom headers (including provider when supplied separately)
    const customHeaders = buildPortkeyCustomHeaders({
      headerString: config.customHeaders,
      provider: config.provider,
      apiKey: config.apiKey,
    });

    if (Object.keys(customHeaders).length > 0) {
      results.push({
        test: 'Custom Headers',
        status: 'success',
        message: `Prepared ${Object.keys(customHeaders).length} custom header(s)`,
        details: Object.keys(customHeaders).reduce((acc, key) => {
          const value = customHeaders[key];
          const normalizedKey = key.toLowerCase();
          if (!value) {
            acc[key] = '';
            return acc;
          }

          if (normalizedKey === 'x-portkey-api-key') {
            acc[key] = `${value.slice(0, 4)}...`;
          } else {
            const truncated = value.length > 50 ? `${value.slice(0, 50)}...` : value;
            acc[key] = truncated;
          }
          return acc;
        }, {} as Record<string, string>),
      });
    }

    // Create Portkey client
    const client = new OpenAI({
      baseURL: config.baseUrl,
      defaultHeaders: {
        ...createHeaders({ apiKey: config.apiKey }),
        ...customHeaders,
      },
    });

    // Test 2: Embeddings
    if (testEmbeddings) {
      const embeddingModel = config.modelEmbeddings || config.model;
      if (!embeddingModel) {
        results.push({
          test: 'Embeddings Test',
          status: 'error',
          message: 'No embedding model configured. Set PORTKEY_MODEL_EMBEDDINGS or PORTKEY_MODEL.',
          details: {
            modelEmbeddings: config.modelEmbeddings,
            modelFallback: config.model,
          },
        });
      } else {
      const startEmbed = Date.now();

      let requestPayload: Record<string, unknown> | undefined;
      try {
        const dimensionsOverride = embeddingModel.includes('titan-embed-text-v2')
          ? 1024
          : embeddingModel.includes('text-embedding')
            ? 1536
            : undefined;

        requestPayload = buildPortkeyEmbeddingPayload(
          embeddingModel,
          'Test embedding for Portkey configuration',
          dimensionsOverride
        );

        const response = await client.embeddings.create(requestPayload as never);

        const embedding =
          (response as { data?: Array<{ embedding?: number[] }> }).data?.[0]?.embedding ??
          // Some Bedrock responses surface embeddings under output[0].embedding
          (response as { output?: Array<{ embedding?: number[] }> }).output?.[0]?.embedding;
        const duration = Date.now() - startEmbed;

        const expectedDims = getExpectedEmbeddingDims(embeddingModel);
        const isExpectedModelDims = embedding && embedding.length === expectedDims;
        const matchesDatabase = embedding && embedding.length === DATABASE_EMBEDDING_DIMS;

        results.push({
          test: 'Embeddings Test',
          status: embedding ? (isExpectedModelDims ? 'success' : 'error') : 'error',
          message: embedding
            ? isExpectedModelDims
              ? `✓ Generated embedding with ${embedding.length} dimensions${matchesDatabase ? ' (matches database)' : ' - differs from current database vectors (1536 dims). Re-embed before switching.'}`
              : `⚠ Generated ${embedding.length} dimensions, but expected ${expectedDims} for ${embeddingModel}.`
            : 'Invalid embedding response',
          duration,
          details: {
            model: embeddingModel,
            dimensions: embedding?.length || 0,
            expectedDimensions: expectedDims,
            databaseDimensions: DATABASE_EMBEDDING_DIMS,
            matchesDatabase,
            compatible: isExpectedModelDims,
            sampleValues: embedding?.slice(0, 5) || [],
            note: matchesDatabase
              ? 'Embedding dimensions match existing database vectors.'
              : 'Database currently stores 1536-dimensional vectors. Re-embed content before switching production traffic.',
          },
        });
      } catch (error) {
        const duration = Date.now() - startEmbed;
        console.error('[portkey-test] Embeddings error', {
          model: embeddingModel,
          error,
          requestPayload,
          response: (error as { response?: { data?: unknown; status?: number } }).response,
        });

        results.push({
          test: 'Embeddings Test',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
          details: {
            model: embeddingModel,
            requestPayload,
            status: (error as { status?: number }).status,
            providerResponse: (error as { response?: { data?: unknown } }).response?.data,
            error: error instanceof Error ? error.stack : String(error),
          },
        });
      }
      }
    } else {
      results.push({
        test: 'Embeddings Test',
        status: 'skipped',
        message: 'Skipped by request',
      });
    }

    // Test 3: Chat Completion
    if (testChat) {
      const chatModel = config.modelChat || config.model;
      if (!chatModel) {
        results.push({
          test: 'Chat Completion Test',
          status: 'error',
          message: 'No chat model configured. Set PORTKEY_MODEL_CHAT or PORTKEY_MODEL.',
          details: {
            modelChat: config.modelChat,
            modelFallback: config.model,
          },
        });
      } else {
        const startChat = Date.now();

        try {
          const completion = await client.chat.completions.create({
            model: chatModel,
            messages: [
              { role: 'system', content: 'You are a test assistant.' },
              { role: 'user', content: 'Say "Hello from Portkey!" if you can read this.' },
            ],
            temperature: 0.2,
            max_tokens: 50,
          });

          const content = completion.choices[0]?.message?.content;
          const duration = Date.now() - startChat;

          results.push({
            test: 'Chat Completion Test',
            status: content ? 'success' : 'error',
            message: content || 'No content in response',
            duration,
            details: {
              model: chatModel,
              usage: completion.usage,
              finishReason: completion.choices[0]?.finish_reason,
            },
          });
        } catch (error) {
          const duration = Date.now() - startChat;
          results.push({
            test: 'Chat Completion Test',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            duration,
            details: {
              model: chatModel,
              error: error instanceof Error ? error.stack : String(error),
            },
          });
        }
      }
    } else {
      results.push({
        test: 'Chat Completion Test',
        status: 'skipped',
        message: 'Skipped by request',
      });
    }

    // Overall status
    const hasErrors = results.some(r => r.status === 'error');
    const allSuccess = results.every(r => r.status === 'success' || r.status === 'skipped');

    return NextResponse.json({
      success: allSuccess,
      hasErrors,
      results,
      recommendation: allSuccess
        ? 'All tests passed! You can enable USE_PORTKEY=true'
        : 'Some tests failed. Check configuration and try again.',
    });

  } catch (error) {
    console.error('[portkey-test] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}
