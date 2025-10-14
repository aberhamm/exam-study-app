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
  // Optional positional metadata for smarter reconstruction
  chunkIndex?: number;
  startIndex?: number;
  endIndex?: number;
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
          console.warn(
            `[retryWithBackoff] Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
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
  topK: number = envConfig.pipeline.maxContextChunks,
  groupIds?: string[]
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
    console.info(
      `[searchDocumentChunks] topK=${topK}, candidates=${numCandidates}, dimensions=${
        queryEmbedding.length
      }, groupIds=${groupIds?.join(',') || 'all'}`
    );
  }

  try {
    // Build filter based on groupIds
    let filter: Record<string, unknown> | undefined;
    if (groupIds && groupIds.length > 0) {
      filter = { groupId: { $in: groupIds } };
    }

    // Step 1: Vector search for IDs and scores only
    const vectorPipeline = [
      {
        $vectorSearch: {
          index: indexName,
          queryVector: queryEmbedding,
          path: 'embedding',
          numCandidates,
          limit: topK,
          ...(filter ? { filter } : {}),
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
    const ids = vectorResults.map((r) => r._id);
    const scoreMap = new Map(vectorResults.map((r) => [String(r._id), r.score]));

    type DocProjection = {
      _id: unknown;
      text?: string;
      url?: string;
      title?: string;
      description?: string;
      sourceFile?: string;
      sourceBasename?: string;
      sectionPath?: string;
      nearestHeading?: string;
      chunkIndex?: number;
      chunkTotal?: number;
      startIndex?: number;
      endIndex?: number;
    };

    const documents = (await embeddingsCol
      .find({ _id: { $in: ids } } as unknown as Record<string, unknown>)
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
        chunkIndex: 1,
        chunkTotal: 1,
        startIndex: 1,
        endIndex: 1,
      })
      .toArray()) as DocProjection[];

    // Map results with scores
    const results = documents.map((doc) => ({
      text: doc.text || '',
      url: doc.url,
      title: doc.title || doc.description,
      sourceFile: doc.sourceFile || doc.sourceBasename || 'unknown',
      sectionPath: doc.sectionPath,
      nearestHeading: doc.nearestHeading,
      score: scoreMap.get(String(doc._id)) || 0,
      chunkIndex: doc.chunkIndex,
      startIndex: doc.startIndex,
      endIndex: doc.endIndex,
    }));

    // Reset circuit breaker on success
    vectorSearchFailures = 0;

    if (featureFlags.debugRetrieval) {
      console.info(
        `[searchDocumentChunks] Retrieved ${
          results.length
        } chunks, best score: ${results[0]?.score.toFixed(4)}`
      );
    }

    return results;
  } catch (error) {
    console.error(
      '[searchDocumentChunks] Vector search failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    // Increment circuit breaker
    vectorSearchFailures++;
    if (vectorSearchFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_DURATION_MS;
      console.warn(
        `[searchDocumentChunks] Circuit breaker activated for ${CIRCUIT_BREAKER_DURATION_MS}ms`
      );
    }

    return [];
  }
}

/**
 * Rebuild full documents from retrieved chunks, grouped by source file.
 * - Sorts by startIndex (or chunkIndex) to ensure correct order
 * - Merges overlapping text regions using original indices
 * - Clamps each rebuilt document to maxChunkChars
 * - Returns top N documents by max chunk score in each group
 */
function rebuildDocumentsFromChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  if (!chunks || chunks.length === 0) return [];

  const maxDocs = envConfig.pipeline.maxContextChunks;
  const maxChars = envConfig.pipeline.maxChunkChars;

  // Group chunks by sourceFile
  const bySource = new Map<string, DocumentChunk[]>();
  for (const c of chunks) {
    const key = c.sourceFile || 'unknown';
    const arr = bySource.get(key) || [];
    arr.push(c);
    bySource.set(key, arr);
  }

  // For each group, sort and merge
  const rebuilt: DocumentChunk[] = [];

  for (const [sourceFile, group] of bySource.entries()) {
    // Use the highest scoring chunk for metadata
    const top = group.reduce((a, b) => (a.score >= b.score ? a : b));

    // Sort by startIndex, then chunkIndex as fallback
    const sorted = [...group].sort((a, b) => {
      const aHasStart = typeof a.startIndex === 'number';
      const bHasStart = typeof b.startIndex === 'number';
      if (aHasStart && bHasStart) return (a.startIndex as number) - (b.startIndex as number);
      if (aHasStart) return -1;
      if (bHasStart) return 1;
      // Fallback to chunkIndex if available
      const ai =
        typeof a.chunkIndex === 'number' ? (a.chunkIndex as number) : Number.MAX_SAFE_INTEGER;
      const bi =
        typeof b.chunkIndex === 'number' ? (b.chunkIndex as number) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    // Merge text with overlap handling using start/end indices
    let merged = '';
    let currentEnd = -1;

    for (const ch of sorted) {
      const text = ch.text || '';
      const hasPos = typeof ch.startIndex === 'number' && typeof ch.endIndex === 'number';

      if (!hasPos) {
        // No positional data; append with a separator if needed
        merged += (merged ? '\n\n' : '') + text;
        continue;
      }

      const start = ch.startIndex as number;
      const end = ch.endIndex as number;

      if (merged.length === 0) {
        merged = text;
        currentEnd = end;
      } else {
        if (start <= currentEnd) {
          // Overlap: compute overlap length within current text
          const overlap = Math.max(0, currentEnd - start + 1);
          const suffix = overlap > 0 ? text.slice(overlap) : text;
          merged += suffix;
          currentEnd = Math.max(currentEnd, end);
        } else {
          // Gap: add minimal separator
          merged += '\n\n' + text;
          currentEnd = end;
        }
      }

      // Optional early clamp to avoid excessive growth
      if (merged.length > maxChars * 1.5) {
        merged = merged.slice(0, Math.ceil(maxChars * 1.5));
      }
    }

    // Final clamp per document
    if (merged.length > maxChars) {
      merged = merged.slice(0, maxChars) + '...';
    }

    rebuilt.push({
      text: merged,
      url: top.url,
      title: top.title,
      sourceFile,
      score: top.score,
    });
  }

  // Sort rebuilt docs by score desc and keep top N
  rebuilt.sort((a, b) => b.score - a.score);
  return rebuilt.slice(0, maxDocs);
}

async function generateExplanationWithLLM(
  question: NormalizedQuestion,
  documentChunks: DocumentChunk[]
): Promise<string> {
  return retryWithBackoff(async () => {
    const openrouterApiKey = envConfig.pipeline.openrouterApiKey;
    const model = envConfig.pipeline.openrouterModel;

    if (featureFlags.debugRetrieval) {
      console.info(
        `[generateExplanationWithLLM] question=${hashText(question.prompt)}, chunks=${
          documentChunks.length
        }, model=${model}`
      );
    }

    // Create the correct answer text
    const correctAnswerText = Array.isArray(question.answerIndex)
      ? question.answerIndex
          .map((idx) => `${String.fromCharCode(65 + idx)}. ${question.choices[idx]}`)
          .join(', ')
      : `${String.fromCharCode(65 + question.answerIndex)}. ${
          question.choices[question.answerIndex]
        }`;

    // Prepare context from rebuilt document sections with citation IDs
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
3) includes at most TWO inline citations (links) to the most relevant excerpts, you may include more in the Sources section,
4) stays within 120-200 words,
5) contains no chit-chat, no follow-ups, no greetings, no meta-commentary.

HARD RULES
- If the excerpts are insufficient to justify the answer, output exactly:
  The available documentation does not contain enough information to explain the answer.
- Do NOT invent facts or rely on outside knowledge.
- Do NOT reveal or restate the answer choices or the letter keys.
- Do NOT mention "snippets," "context," or "I".
- Do NOT refer to the reference chunks by number or say "the excerpt says."
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
`;

    const userPrompt = `Question:
${question.prompt}

Correct answer:
${correctAnswerText}

Relevant documentation excerpts (each excerpt may include a URL):
${contextSections}

Available citations (include as markdown links when relevant):
${availableCitations}
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
  question: NormalizedQuestion,
  documentGroups?: string[],
  questionEmbedding?: number[]
): Promise<ExplanationResult> {
  const questionHash = hashText(question.id);

  if (featureFlags.debugRetrieval) {
    console.info(
      `[generateQuestionExplanation] Starting for question ${questionHash}, documentGroups=${
        documentGroups?.join(',') || 'all'
      }, hasEmbedding=${!!questionEmbedding}`
    );
  }

  try {
    // Use provided embedding or create one for the question text
    let queryEmbedding: number[];
    if (questionEmbedding && questionEmbedding.length > 0) {
      queryEmbedding = questionEmbedding;
      if (featureFlags.debugRetrieval) {
        console.info(
          `[generateQuestionExplanation] Using provided embedding (${queryEmbedding.length}d) for question ${questionHash}`
        );
      }
    } else {
      const questionText = `${question.prompt} ${question.choices.join(' ')}`;
      queryEmbedding = await createEmbedding(questionText);
      if (featureFlags.debugRetrieval) {
        console.info(
          `[generateQuestionExplanation] Created embedding (${queryEmbedding.length}d) for question ${questionHash}`
        );
      }
    }

    // Retrieve more chunks per search than final limit to ensure best results survive deduplication
    const chunksPerSearch = Math.ceil(envConfig.pipeline.maxContextChunks * 1.5);

    // Search for relevant document chunks using question embedding
    const questionChunks = await searchDocumentChunks(
      queryEmbedding,
      chunksPerSearch,
      documentGroups
    );

    // Extract correct answer text and create embedding for it
    const correctAnswerText = Array.isArray(question.answerIndex)
      ? question.answerIndex
          .map((idx) => question.choices[idx])
          .filter(Boolean)
          .join(' ')
      : question.choices[question.answerIndex];

    if (!correctAnswerText) {
      throw new Error('Unable to extract correct answer text');
    }

    if (featureFlags.debugRetrieval) {
      console.info(
        `[generateQuestionExplanation] Correct answer text: ${correctAnswerText.substring(0, 100)}`
      );
    }

    const answerEmbedding = await createEmbedding(correctAnswerText);

    if (featureFlags.debugRetrieval) {
      console.info(
        `[generateQuestionExplanation] Created answer embedding (${answerEmbedding.length}d) for question ${questionHash}`
      );
    }

    // Search for relevant document chunks using answer embedding
    const answerChunks = await searchDocumentChunks(
      answerEmbedding,
      chunksPerSearch,
      documentGroups
    );

    // Merge chunks from both searches and sort by score (highest first)
    const allChunks = [...questionChunks, ...answerChunks].sort((a, b) => b.score - a.score);

    if (featureFlags.debugRetrieval) {
      console.info(
        `[generateQuestionExplanation] Combined ${questionChunks.length} question chunks + ${answerChunks.length} answer chunks = ${allChunks.length} total`
      );
      if (allChunks.length > 0) {
        console.info(
          `[generateQuestionExplanation] Score range: ${allChunks[0].score.toFixed(
            4
          )} to ${allChunks[allChunks.length - 1].score.toFixed(4)}`
        );
      }
    }

    // Rebuild full documents from retrieved chunks grouped by source file
    const processedChunks = rebuildDocumentsFromChunks(allChunks);

    if (featureFlags.debugRetrieval) {
      console.info(
        `[generateQuestionExplanation] Processed ${processedChunks.length} chunks (from ${allChunks.length})`
      );
    }

    // Generate explanation using LLM
    const explanation = await generateExplanationWithLLM(question, processedChunks);

    // Extract sources at document level
    const sources = processedChunks.map((chunk) => ({
      url: chunk.url,
      title: chunk.title,
      sourceFile: chunk.sourceFile,
      sectionPath: chunk.sectionPath,
    }));

    if (featureFlags.debugRetrieval) {
      console.info(
        `[generateQuestionExplanation] Generated explanation (${explanation.length} chars) with ${sources.length} sources`
      );
    }

    return {
      explanation,
      sources,
    };
  } catch (error) {
    console.error(
      `[generateQuestionExplanation] Failed for question ${questionHash}:`,
      error instanceof Error ? error.message : 'Unknown error'
    );
    throw new Error(
      `Failed to generate explanation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
