/**
 * Shared Embedding Service
 *
 * Provides reusable functions for generating vector embeddings for questions and competencies.
 */

import { envConfig } from '@/lib/env-config';

/**
 * Create embeddings using OpenAI API
 */
export async function createEmbeddings(
  inputs: string[],
  model?: string,
  dimensions?: number
): Promise<number[][]> {
  const embeddingModel = model || envConfig.openai.embeddingModel;
  const embeddingDimensions = dimensions || envConfig.openai.embeddingDimensions;
  const apiKey = envConfig.openai.apiKey;

  const body: Record<string, unknown> = {
    model: embeddingModel,
    input: inputs,
  };

  if (embeddingDimensions) {
    body.dimensions = embeddingDimensions;
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
  const [embedding] = await createEmbeddings([text], embeddingModel, dimensions);

  return {
    embedding,
    embeddingModel,
    embeddingUpdatedAt: new Date(),
  };
}
