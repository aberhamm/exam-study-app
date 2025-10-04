import type { Collection } from 'mongodb';
import { getDb } from '@/lib/server/mongodb';
import { envConfig, featureFlags } from '@/lib/env-config';
import type { NormalizedQuestion } from '@/types/normalized';
import type { EmbeddingChunkDocument } from '@/data-pipelines/src/shared/types/embedding';
import crypto from 'crypto';

export type DocumentChunk = {
  text: string;
  url?: string;
  title?: string;
  sourceFile: string;
  sectionPath?: string;
  nearestHeading?: string;
  score: number;
};

export type ExplanationResult = {
  explanation: string;
  sources: Array<{
    url?: string;
    title?: string;
    sourceFile: string;
    sectionPath?: string;
  }>;
};

// Circuit breaker state
let vectorSearchFailures = 0;
let circuitBreakerUntil: number | null = null;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_DURATION_MS = 2 * 60 * 1000; // 2 minutes

// Helper to create hash for logging
function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 8);
}

// Retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = envConfig.pipeline.maxRetries,
  timeoutMs: number = envConfig.pipeline.apiTimeoutMs
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const result = await fn();
        clearTimeout(timeout);
        return result;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        if (featureFlags.debugRetrieval) {
          console.warn(`[retryWithBackoff] Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

async function getEmbeddingsCollection(): Promise<Collection<EmbeddingChunkDocument>> {
  const db = await getDb();
  return db.collection<EmbeddingChunkDocument>(envConfig.pipeline.documentEmbeddingsCollection);
}

async function createEmbedding(text: string): Promise<number[]> {
  return retryWithBackoff(async () => {
    const apiKey = envConfig.openai.apiKey;
    const model = envConfig.openai.embeddingModel;
    const dimensions = envConfig.openai.embeddingDimensions;

    const body = { model, input: text, dimensions };

    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OpenAI embeddings error ${resp.status}`);
    }

    const json = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };

    if (!json.data?.[0]?.embedding) {
      throw new Error('Invalid embedding response');
    }

    return json.data[0].embedding;
  });
}

async function searchDocumentChunks(
  queryEmbedding: number[],
  topK: number = envConfig.pipeline.maxContextChunks
): Promise<DocumentChunk[]> {
  // Circuit breaker check
  if (circuitBreakerUntil && Date.now() < circuitBreakerUntil) {
    if (featureFlags.debugRetrieval) {
      console.warn('[searchDocumentChunks] Circuit breaker active, skipping vector search');
    }
    return [];
  }

  const embeddingsCol = await getEmbeddingsCollection();
  const indexName = envConfig.pipeline.documentEmbeddingsVectorIndex;
  const candidateMultiplier = envConfig.pipeline.candidateMultiplier;
  const maxCandidates = envConfig.pipeline.maxCandidates;
  const numCandidates = Math.min(topK * candidateMultiplier, maxCandidates);

  if (featureFlags.debugRetrieval) {
    console.info(`[searchDocumentChunks] topK=${topK}, candidates=${numCandidates}, dimensions=${queryEmbedding.length}`);
  }

  try {
    // Step 1: Vector search for IDs and scores only
    const vectorPipeline = [
      {
        $vectorSearch: {
          index: indexName,
          queryVector: queryEmbedding,
          path: 'embedding',
          numCandidates,
          limit: topK,
        },
      },
      {
        $project: {
          _id: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const vectorResults: Array<{ _id: unknown; score: number }> = [];
    const cursor = embeddingsCol.aggregate(vectorPipeline);

    for await (const doc of cursor) {
      vectorResults.push(doc as { _id: unknown; score: number });
    }

    if (vectorResults.length === 0) {
      if (featureFlags.debugRetrieval) {
        console.warn('[searchDocumentChunks] No results from vector search');
      }
      return [];
    }

    // Step 2: Targeted find for full documents
    const ids = vectorResults.map(r => r._id);
    const scoreMap = new Map(vectorResults.map(r => [String(r._id), r.score]));

    const documents = await embeddingsCol
      .find({ _id: { $in: ids } } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .project({
        _id: 1,
        text: 1,
        url: 1,
        title: 1,
        description: 1,
        sourceFile: 1,
        sourceBasename: 1,
        sectionPath: 1,
        nearestHeading: 1,
      })
      .toArray();

    // Map results with scores
    const results = documents.map(doc => ({
      text: doc.text || '',
      url: doc.url,
      title: doc.title || doc.description,
      sourceFile: doc.sourceFile || doc.sourceBasename || 'unknown',
      sectionPath: doc.sectionPath,
      nearestHeading: doc.nearestHeading,
      score: scoreMap.get(String(doc._id)) || 0,
    }));

    // Reset circuit breaker on success
    vectorSearchFailures = 0;

    if (featureFlags.debugRetrieval) {
      console.info(`[searchDocumentChunks] Retrieved ${results.length} chunks, best score: ${results[0]?.score.toFixed(4)}`);
    }

    return results;
  } catch (error) {
    console.error('[searchDocumentChunks] Vector search failed:', error instanceof Error ? error.message : 'Unknown error');

    // Increment circuit breaker
    vectorSearchFailures++;
    if (vectorSearchFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_DURATION_MS;
      console.warn(`[searchDocumentChunks] Circuit breaker activated for ${CIRCUIT_BREAKER_DURATION_MS}ms`);
    }

    return [];
  }
}

function deduplicateAndClampChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  const maxChunks = envConfig.pipeline.maxContextChunks;
  const maxChars = envConfig.pipeline.maxChunkChars;

  // Deduplicate by (sourceFile, url)
  const seen = new Set<string>();
  const unique: DocumentChunk[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.sourceFile}::${chunk.url || ''}`;
    if (!seen.has(key)) {
      seen.add(key);

      // Clamp text length
      const clampedChunk = {
        ...chunk,
        text: chunk.text.length > maxChars
          ? chunk.text.substring(0, maxChars) + '...'
          : chunk.text
      };

      unique.push(clampedChunk);

      if (unique.length >= maxChunks) {
        break;
      }
    }
  }

  return unique;
}

async function generateExplanationWithLLM(
  question: NormalizedQuestion,
  documentChunks: DocumentChunk[]
): Promise<string> {
  return retryWithBackoff(async () => {
    const openrouterApiKey = envConfig.pipeline.openrouterApiKey;
    const model = envConfig.pipeline.openrouterModel;

    if (featureFlags.debugRetrieval) {
      console.info(`[generateExplanationWithLLM] question=${hashText(question.prompt)}, chunks=${documentChunks.length}, model=${model}`);
    }

    // Create the correct answer text
    const correctAnswerText = Array.isArray(question.answerIndex)
      ? question.answerIndex
          .map((idx) => `${String.fromCharCode(65 + idx)}. ${question.choices[idx]}`)
          .join(', ')
      : `${String.fromCharCode(65 + question.answerIndex)}. ${
          question.choices[question.answerIndex]
        }`;

    // Prepare context from document chunks with citation IDs
    const contextSections = documentChunks
      .map((chunk, index) => {
        const header = chunk.nearestHeading || chunk.sectionPath || 'Documentation';
        const source = chunk.title || chunk.sourceFile;
        const citationId = `[${index + 1}]`;
        return `### Context ${citationId}: ${header} (from ${source})\n${chunk.text}`;
      })
      .join('\n\n');

    // Prepare available citations for the LLM
    const availableCitations = documentChunks
      .map((chunk, index) => {
        const citationId = `[${index + 1}]`;
        const title = chunk.title || chunk.sourceFile;
        const url = chunk.url;
        return `${citationId}: ${title}${url ? ` - ${url}` : ''}`;
      })
      .join('\n');

    const systemPrompt = `You are an Exam Explanation Engine for software/technology topics.

TASK
Given: (a) one multiple-choice or true/false question, (b) the correct answer, and (c) 1-N short documentation excerpts.
Output a concise, instructional explanation in Markdown that:
1) teaches why the provided answer is correct,
2) uses ONLY the provided documentation as evidence,
3) includes at most TWO inline citations (links) to the most relevant excerpts,
4) stays within 120-200 words,
5) contains no chit-chat, no follow-ups, no greetings, no meta-commentary.

HARD RULES
- If the excerpts are insufficient to justify the answer, output exactly:
  The provided documentation does not contain enough information to explain the answer.
- Do NOT invent facts or rely on outside knowledge.
- Do NOT reveal or restate the answer choices or the letter keys.
- Do NOT mention "snippets," "context," or "I".
- Use clear headings only if helpful (e.g., **Why this is correct**).
- Prefer quotes or paraphrases anchored to the excerpts.
- Phrases like "according to the documentation," "the docs state," "as per …," "the excerpt shows," etc. You present **direct explanations** supported implicitly by the facts, not by referencing *where* they came from.
- Instead of saying "as described in the documentation," just use the documentation's content as part of your explanation.
- Use assertive yet grounded language
   * Use active voice: "sitecore.json defines…" rather than "is defined by…"
   * Avoid signal phrases like "the document says" or "the docs show."
- Make your explanation self-contained
   Phrase your explanation so it doesn't rely on reminding the reader of the source. The support is in the logic and evidence, not in mentioning where it came from.

FORMAT
- Markdown only. One paragraph so simpler questions; three short paragraphs max. Breaking up long paragraphs is preferred.
- At least 1-2 inline links to the excerpts you judge most relevant.
- If the excerpt did not help, do not cite it.
- If the answer is justified by common knowledge, do not cite any excerpts.
- If the answer is ambiguous, explain why the other possibly likely answers are wrong without citing excerpts.


SOURCES SECTION FORMAT:
End your explanation with:

_Sources:_
- [Source Title 1 | Website Name](URL1) (if you used citation [1])
- [Source Title 2 | Website Docs](URL2) (if you used citation [2])
- etc.`;

    const userPrompt = `Question:
${question.prompt}

Correct answer:
${correctAnswerText}

Relevant documentation excerpts (each excerpt may include a URL):
${contextSections}

Available citations (include as markdown links when relevant):
${availableCitations}

Instructions:
Explain why the correct answer is correct using ONLY the excerpts above.
- Keep to 80-160 words.
- Include one to two inline citations by linking directly to the most relevant excerpt URLs.
- Do not mention option letters, option text, "excerpts," or "context."
- Do not engage in conversation or add greetings.
`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'Study Utility - Question Explanation Generator',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error ${response.status}`);
    }

    const json = await response.json();
    const explanation = json.choices?.[0]?.message?.content;

    if (!explanation || typeof explanation !== 'string') {
      throw new Error('Invalid explanation response');
    }

    return explanation;
  });
}

export async function generateQuestionExplanation(
  question: NormalizedQuestion
): Promise<ExplanationResult> {
  const questionHash = hashText(question.id);

  if (featureFlags.debugRetrieval) {
    console.info(`[generateQuestionExplanation] Starting for question ${questionHash}`);
  }

  try {
    // Create embedding for the question text
    const questionText = `${question.prompt} ${question.choices.join(' ')}`;
    const queryEmbedding = await createEmbedding(questionText);

    if (featureFlags.debugRetrieval) {
      console.info(`[generateQuestionExplanation] Created embedding (${queryEmbedding.length}d) for question ${questionHash}`);
    }

    // Search for relevant document chunks
    const documentChunks = await searchDocumentChunks(queryEmbedding);

    // Deduplicate and clamp chunks
    const processedChunks = deduplicateAndClampChunks(documentChunks);

    if (featureFlags.debugRetrieval) {
      console.info(`[generateQuestionExplanation] Processed ${processedChunks.length} chunks (from ${documentChunks.length})`);
    }

    // Generate explanation using LLM
    const explanation = await generateExplanationWithLLM(question, processedChunks);

    // Extract unique sources
    const sources = processedChunks.map((chunk) => ({
      url: chunk.url,
      title: chunk.title,
      sourceFile: chunk.sourceFile,
      sectionPath: chunk.sectionPath,
    }));

    if (featureFlags.debugRetrieval) {
      console.info(`[generateQuestionExplanation] Generated explanation (${explanation.length} chars) with ${sources.length} sources`);
    }

    return {
      explanation,
      sources,
    };
  } catch (error) {
    console.error(`[generateQuestionExplanation] Failed for question ${questionHash}:`, error instanceof Error ? error.message : 'Unknown error');
    throw new Error(
      `Failed to generate explanation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
