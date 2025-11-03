/**
 * LLM Client Wrapper
 *
 * Routes LLM calls to either Portkey or existing providers (OpenAI/OpenRouter)
 * based on the USE_PORTKEY feature flag.
 */

import OpenAI from 'openai';
import { envConfig } from '@/lib/env-config';
import { portkeyClient } from '@/lib/portkey-openai';

export function isBedrockTitanV2(model?: string): boolean {
  return !!model && model.toLowerCase().includes('titan-embed-text-v2');
}

export function buildPortkeyEmbeddingPayload(
  model: string,
  input: string | string[],
  dimensions?: number
): Record<string, unknown> {
  if (isBedrockTitanV2(model)) {
    const textArray = Array.isArray(input) ? input : [input];
    const payload: Record<string, unknown> = {
      model,
      input: Array.isArray(input) ? textArray : textArray[0],
      encoding_format: 'float',
    };

    if (dimensions && dimensions <= 1024) {
      payload.dimensions = dimensions;
    }

    return payload;
  }

  const payload: Record<string, unknown> = {
    model,
    input,
  };

  if (dimensions) {
    payload.dimensions = dimensions;
  }

  return payload;
}

function extractEmbeddingsFromResponse(response: unknown): number[][] {
  const data = (response as { data?: Array<{ embedding?: number[] }> }).data;
  if (Array.isArray(data) && data.length > 0) {
    return data
      .map(item => item.embedding)
      .filter((embedding): embedding is number[] => Array.isArray(embedding));
  }

  const output = (response as { output?: Array<{ embedding?: number[] }> }).output;
  if (Array.isArray(output) && output.length > 0) {
    return output
      .map(item => item.embedding)
      .filter((embedding): embedding is number[] => Array.isArray(embedding));
  }

  return [];
}

/**
 * Options for creating embeddings
 */
export interface CreateEmbeddingOptions {
  model?: string;
  dimensions?: number;
}

/**
 * Options for chat completions
 */
export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

/**
 * Creates an embedding for the provided text using Portkey or OpenAI
 */
export async function createEmbedding(
  text: string,
  options?: CreateEmbeddingOptions
): Promise<number[]> {
  const usePortkey = envConfig.features.usePortkey;
  const model = options?.model || envConfig.portkey.modelEmbeddings || envConfig.openai.embeddingModel;
  const requestedDimensions = options?.dimensions || envConfig.openai.embeddingDimensions;
  const dimensions = isBedrockTitanV2(model)
    ? Math.min(requestedDimensions || 1024, 1024)
    : requestedDimensions;

  if (usePortkey) {
    const client = portkeyClient();
    let payload: Record<string, unknown> | undefined;
    try {
      payload = buildPortkeyEmbeddingPayload(model, text, dimensions);
      const response = await client.embeddings.create(payload as never);

      const embeddings = extractEmbeddingsFromResponse(response);
      const embedding = embeddings[0];
      if (!embedding) {
        throw new Error('Invalid embedding response from Portkey');
      }

      return embedding;
    } catch (error) {
      // Enhanced error logging for Portkey issues
      console.error('[Portkey Embeddings Error]', {
        model,
        dimensions,
        baseUrl: envConfig.portkey.baseUrl,
        error: error instanceof Error ? error.message : String(error),
        requestPayload: payload,
        status: (error as { status?: number }).status,
        response: (error as { response?: unknown }).response,
      });
      throw error;
    }
  }

  // Fallback to OpenAI
  const apiKey = envConfig.openai.apiKey;
  const body: Record<string, unknown> = { model, input: text };
  if (dimensions) {
    body.dimensions = dimensions;
  }

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI embeddings error ${resp.status}`);
  }

  const json = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  if (!json.data?.[0]?.embedding) {
    throw new Error('Invalid embedding response');
  }

  return json.data[0].embedding;
}

/**
 * Creates embeddings for multiple texts using Portkey or OpenAI
 */
export async function createEmbeddings(
  inputs: string[],
  options?: CreateEmbeddingOptions
): Promise<number[][]> {
  const usePortkey = envConfig.features.usePortkey;
  const model = options?.model || envConfig.portkey.modelEmbeddings || envConfig.openai.embeddingModel;
  const requestedDimensions = options?.dimensions || envConfig.openai.embeddingDimensions;
  const dimensions = isBedrockTitanV2(model)
    ? Math.min(requestedDimensions || 1024, 1024)
    : requestedDimensions;

  if (usePortkey) {
    const client = portkeyClient();
    let payload: Record<string, unknown> | undefined;
    try {
      payload = buildPortkeyEmbeddingPayload(model, inputs, dimensions);
      const response = await client.embeddings.create(payload as never);

      const embeddings = extractEmbeddingsFromResponse(response);
      if (embeddings.length === 0) {
        throw new Error('Invalid embedding response from Portkey');
      }

      return embeddings;
    } catch (error) {
      console.error('[Portkey Embeddings Error - batch]', {
        model,
        dimensions,
        baseUrl: envConfig.portkey.baseUrl,
        error: error instanceof Error ? error.message : String(error),
        requestPayload: payload,
        status: (error as { status?: number }).status,
        response: (error as { response?: unknown }).response,
      });
      throw error;
    }
  }

  // Fallback to OpenAI
  const apiKey = envConfig.openai.apiKey;
  const body: Record<string, unknown> = { model, input: inputs };
  if (dimensions) {
    body.dimensions = dimensions;
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

/**
 * Creates a chat completion using Portkey or OpenRouter
 */
export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<string> {
  const usePortkey = envConfig.features.usePortkey;

  if (usePortkey) {
    const client = portkeyClient();
    const model = options.model || envConfig.portkey.modelChat || envConfig.portkey.model;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.max_tokens,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('Invalid chat completion response from Portkey');
      }

      return content;
    } catch (error) {
      // Enhanced error logging for Portkey issues
      console.error('[Portkey Chat Completion Error]', {
        model,
        baseUrl: envConfig.portkey.baseUrl,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  // Fallback to OpenRouter
  const openrouterApiKey = envConfig.pipeline.openrouterApiKey;
  const model = options.model || envConfig.pipeline.openrouterModel;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterApiKey}`,
      'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
      'X-Title': 'Study Utility - LLM Client',
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error ${response.status}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('Invalid chat completion response');
  }

  return content;
}

/**
 * Gets a client for direct use (for advanced scenarios)
 */
export function getLLMClient(): OpenAI {
  const usePortkey = envConfig.features.usePortkey;

  if (usePortkey) {
    return portkeyClient();
  }

  // Fallback to OpenRouter client
  return new OpenAI({
    apiKey: envConfig.pipeline.openrouterApiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}
