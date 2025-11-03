/**
 * Shared Embedding Service
 *
 * Provides reusable functions for generating vector embeddings for questions and competencies.
 * Routes through Portkey if USE_PORTKEY feature flag is enabled.
 */

import { envConfig } from '@/lib/env-config';
import { createEmbeddings as createEmbeddingsLLM } from '@/lib/llm-client';

/**
 * Create embeddings using Portkey or OpenAI API
 */
export async function createEmbeddings(
  inputs: string[],
  model?: string,
  dimensions?: number
): Promise<number[][]> {
  const embeddingModel = model || envConfig.openai.embeddingModel;
  const embeddingDimensions = dimensions || envConfig.openai.embeddingDimensions;

  // Use LLM client wrapper (routes to Portkey or OpenAI based on feature flag)
  return createEmbeddingsLLM(inputs, { model: embeddingModel, dimensions: embeddingDimensions });
}

/**
 * Build text for embedding a question
 */
export function buildQuestionTextForEmbedding(doc: {
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: 'A' | 'B' | 'C' | 'D' | 'E' | ('A' | 'B' | 'C' | 'D' | 'E')[];
  explanation?: string;
}): string {
  const choices =
    `A) ${doc.options.A}\nB) ${doc.options.B}\nC) ${doc.options.C}\nD) ${doc.options.D}` +
    (doc.options.E ? `\nE) ${doc.options.E}` : '');
  const answer = Array.isArray(doc.answer) ? doc.answer.join(', ') : doc.answer;
  const explanation = doc.explanation ? `\nExplanation: ${doc.explanation}` : '';
  return `Question: ${doc.question}\nOptions:\n${choices}\nAnswer: ${answer}${explanation}`;
}

/**
 * Build text for embedding a competency
 */
export function buildCompetencyTextForEmbedding(doc: {
  title: string;
  description: string;
}): string {
  return `${doc.title}\n\n${doc.description}`;
}

/**
 * Generate and return embedding metadata for a single item
 */
export async function generateEmbedding(
  text: string,
  model?: string,
  dimensions?: number
): Promise<{
  embedding: number[];
  embeddingModel: string;
  embeddingUpdatedAt: Date;
}> {
  const embeddingModel = model || envConfig.openai.embeddingModel;
  // Use LLM client wrapper (routes to Portkey or OpenAI based on feature flag)
  const [embedding] = await createEmbeddings([text], embeddingModel, dimensions);

  return {
    embedding,
    embeddingModel,
    embeddingUpdatedAt: new Date(),
  };
}
