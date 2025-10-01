import type { Collection, Document } from 'mongodb';
import { getDb } from '@/lib/server/mongodb';
import { envConfig } from '@/lib/env-config';
import type { NormalizedQuestion } from '@/types/normalized';
import type { EmbeddingChunkDocument } from '@/data-pipelines/src/shared/types/embedding';

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

async function getEmbeddingsCollection(): Promise<Collection<EmbeddingChunkDocument>> {
  const db = await getDb();
  return db.collection<EmbeddingChunkDocument>(envConfig.pipeline.embeddingsCollection);
}

async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = envConfig.openai.apiKey;
  const model = envConfig.openai.embeddingModel;
  const dimensions = envConfig.openai.embeddingDimensions;

  const body: Record<string, unknown> = { model, input: text, dimensions };

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
    throw new Error(`OpenAI embeddings error ${resp.status}: ${text}`);
  }

  const json = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? [];
}

async function searchDocumentChunks(
  queryEmbedding: number[],
  topK: number = 5
): Promise<DocumentChunk[]> {
  const embeddingsCol = await getEmbeddingsCollection();

  console.info(
    `[searchDocumentChunks] Starting vector search with topK=${topK}, embedding dimensions=${queryEmbedding.length}`
  );

  try {
    // Check if embeddings collection has documents
    const totalDocs = await embeddingsCol.countDocuments();
    console.info(`[searchDocumentChunks] Total documents in embeddings collection: ${totalDocs}`);

    if (totalDocs === 0) {
      console.warn('[searchDocumentChunks] No documents found in embeddings collection');
      return [];
    }

    // Sample a document to understand the structure
    const sampleDoc = await embeddingsCol.findOne(
      {},
      {
        projection: {
          text: 1,
          sourceFile: 1,
          title: 1,
          url: 1,
          embedding: 1,
          sectionPath: 1,
          nearestHeading: 1,
        },
      }
    );

    if (sampleDoc) {
      console.info(`[searchDocumentChunks] Sample document structure:`, {
        hasText: !!sampleDoc.text,
        textLength: sampleDoc.text?.length || 0,
        sourceFile: sampleDoc.sourceFile,
        title: sampleDoc.title,
        url: sampleDoc.url,
        hasEmbedding: !!sampleDoc.embedding,
        embeddingLength: Array.isArray(sampleDoc.embedding) ? sampleDoc.embedding.length : 0,
        sectionPath: sampleDoc.sectionPath,
        nearestHeading: sampleDoc.nearestHeading,
      });
    }

    // Try different index names and search methods like the working example
    const indexNames = ['embedding_vector', 'embeddings_vector_index', 'vector_index'];
    let results: DocumentChunk[] = [];
    let searchMethod = 'none';

    for (const indexName of indexNames) {
      console.info(`[searchDocumentChunks] Trying vector search with index: ${indexName}`);

      try {
        // Try Atlas Search first (like the working example)
        try {
          const pipeline: Document[] = [
            {
              $search: {
                index: indexName,
                knnBeta: {
                  vector: queryEmbedding,
                  path: 'embedding',
                  k: Math.max(100, topK * 5),
                },
              },
            },
            { $limit: topK },
            {
              $project: {
                _id: 0,
                text: 1,
                url: 1,
                title: 1,
                description: 1,
                sourceFile: 1,
                sourceBasename: 1,
                sectionPath: 1,
                nearestHeading: 1,
                chunkIndex: 1,
                tags: 1,
                score: { $meta: 'searchScore' },
              },
            },
          ];

          console.info(
            `[searchDocumentChunks] Trying Atlas Search with pipeline:`,
            JSON.stringify(pipeline, null, 2)
          );
          const cursor = embeddingsCol.aggregate(pipeline);
          const atlasResults: (EmbeddingChunkDocument & { score: number })[] = [];

          for await (const doc of cursor) {
            atlasResults.push(doc as EmbeddingChunkDocument & { score: number });
          }

          if (atlasResults.length > 0) {
            console.info(
              `[searchDocumentChunks] Atlas Search succeeded with index ${indexName}, found ${atlasResults.length} results`
            );
            results = atlasResults.map((doc) => ({
              text: doc.text || '',
              url: doc.url,
              title: doc.title || doc.description,
              sourceFile: doc.sourceFile || doc.sourceBasename || 'unknown',
              sectionPath: doc.sectionPath,
              nearestHeading: doc.nearestHeading,
              score: doc.score || 0,
            }));
            searchMethod = `atlas-search(${indexName})`;
            break;
          }
        } catch (atlasError) {
          console.info(
            `[searchDocumentChunks] Atlas Search failed with index ${indexName}:`,
            atlasError
          );
        }

        // Fallback to $vectorSearch (like the working example)
        try {
          const pipeline: Document[] = [
            {
              $vectorSearch: {
                index: indexName,
                queryVector: queryEmbedding,
                path: 'embedding',
                numCandidates: Math.max(100, topK * 5),
                limit: topK,
              },
            },
            {
              $project: {
                _id: 0,
                text: 1,
                url: 1,
                title: 1,
                description: 1,
                sourceFile: 1,
                sourceBasename: 1,
                sectionPath: 1,
                nearestHeading: 1,
                chunkIndex: 1,
                tags: 1,
                score: { $meta: 'vectorSearchScore' },
              },
            },
          ];

          console.info(
            `[searchDocumentChunks] Trying $vectorSearch with pipeline:`,
            JSON.stringify(pipeline, null, 2)
          );
          const cursor = embeddingsCol.aggregate(pipeline);
          const vectorResults: (EmbeddingChunkDocument & { score: number })[] = [];

          for await (const doc of cursor) {
            vectorResults.push(doc as EmbeddingChunkDocument & { score: number });
          }

          if (vectorResults.length > 0) {
            console.info(
              `[searchDocumentChunks] $vectorSearch succeeded with index ${indexName}, found ${vectorResults.length} results`
            );
            results = vectorResults.map((doc) => ({
              text: doc.text || '',
              url: doc.url,
              title: doc.title || doc.description,
              sourceFile: doc.sourceFile || doc.sourceBasename || 'unknown',
              sectionPath: doc.sectionPath,
              nearestHeading: doc.nearestHeading,
              score: doc.score || 0,
            }));
            searchMethod = `vector-search(${indexName})`;
            break;
          }
        } catch (vectorError) {
          console.info(
            `[searchDocumentChunks] $vectorSearch failed with index ${indexName}:`,
            vectorError
          );
        }
      } catch (error) {
        console.info(
          `[searchDocumentChunks] Both search methods failed with index ${indexName}:`,
          error
        );
      }
    }

    console.info(`[searchDocumentChunks] Search completed using method: ${searchMethod}`);
    console.info(`[searchDocumentChunks] Found ${results.length} total results`);

    // Log details of found results
    if (results.length > 0) {
      console.info(`[searchDocumentChunks] Results summary:`);
      results.forEach((chunk, index) => {
        console.info(`[searchDocumentChunks] Chunk ${index + 1}:`, {
          score: chunk.score?.toFixed(4),
          sourceFile: chunk.sourceFile,
          title: chunk.title,
          url: chunk.url,
          sectionPath: chunk.sectionPath,
          nearestHeading: chunk.nearestHeading,
          textLength: chunk.text?.length || 0,
          textPreview: chunk.text?.substring(0, 200) + (chunk.text?.length > 200 ? '...' : ''),
        });
      });

      console.info(`[searchDocumentChunks] Best match score: ${results[0]?.score?.toFixed(4)}`);
      console.info(
        `[searchDocumentChunks] Worst match score: ${results[results.length - 1]?.score?.toFixed(
          4
        )}`
      );
    }

    return results;
  } catch (error) {
    console.error('[searchDocumentChunks] Vector search failed:', error);

    // Try a fallback approach - get some random documents for debugging
    try {
      console.info('[searchDocumentChunks] Attempting fallback: fetching sample documents');
      const fallbackDocs = await embeddingsCol
        .find({})
        .limit(topK)
        .project({
          _id: 0,
          text: 1,
          url: 1,
          title: 1,
          sourceFile: 1,
          sectionPath: 1,
          nearestHeading: 1,
        })
        .toArray();

      console.info(`[searchDocumentChunks] Fallback returned ${fallbackDocs.length} documents`);

      return fallbackDocs.map((doc) => ({
        text: doc.text || '',
        url: doc.url,
        title: doc.title,
        sourceFile: doc.sourceFile || 'unknown',
        sectionPath: doc.sectionPath,
        nearestHeading: doc.nearestHeading,
        score: 0, // No score available in fallback
      }));
    } catch (fallbackError) {
      console.error('[searchDocumentChunks] Fallback also failed:', fallbackError);
    }

    return [];
  }
}

async function generateExplanationWithLLM(
  question: NormalizedQuestion,
  documentChunks: DocumentChunk[]
): Promise<string> {
  const openrouterApiKey = envConfig.pipeline.openrouterApiKey;
  const model = envConfig.pipeline.openrouterModel;

  console.info(`[generateExplanationWithLLM] Starting LLM generation with model: ${model}`);
  console.info(`[generateExplanationWithLLM] Question: ${question.prompt.substring(0, 100)}...`);
  console.info(`[generateExplanationWithLLM] Document chunks provided: ${documentChunks.length}`);

  // Create the correct answer text
  const correctAnswerText = Array.isArray(question.answerIndex)
    ? question.answerIndex
        .map((idx) => `${String.fromCharCode(65 + idx)}. ${question.choices[idx]}`)
        .join(', ')
    : `${String.fromCharCode(65 + question.answerIndex)}. ${
        question.choices[question.answerIndex]
      }`;

  console.info(`[generateExplanationWithLLM] Correct answer: ${correctAnswerText}`);

  // Prepare context from document chunks with citation IDs
  const contextSections = documentChunks
    .map((chunk, index) => {
      const header = chunk.nearestHeading || chunk.sectionPath || 'Documentation';
      const source = chunk.title || chunk.sourceFile;
      const citationId = `[${index + 1}]`;
      const contextSection = `### Context ${citationId}: ${header} (from ${source})
${chunk.text}`;

      console.info(`[generateExplanationWithLLM] Context ${index + 1}:`, {
        header,
        source,
        score: chunk.score,
        textLength: chunk.text?.length || 0,
        textPreview: chunk.text?.substring(0, 150) + (chunk.text?.length > 150 ? '...' : ''),
        citationId,
        hasUrl: !!chunk.url,
      });

      return contextSection;
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
- Do NOT mention “snippets,” “context,” or “I”.
- Use clear headings only if helpful (e.g., **Why this is correct**).
- Prefer quotes or paraphrases anchored to the excerpts.
- Phrases like “according to the documentation,” “the docs state,” “as per …,” “the excerpt shows,” etc. You present **direct explanations** supported implicitly by the facts, not by referencing *where* they came from.
- Instead of saying “as described in the documentation,” just use the documentation's content as part of your explanation.
- Use assertive yet grounded language
   * Use active voice: “sitecore.json defines…” rather than “is defined by…”
   * Avoid signal phrases like “the document says” or “the docs show.”
- Make your explanation self-contained
   Phrase your explanation so it doesn't rely on reminding the reader of the source. The support is in the logic and evidence, not in mentioning where it came from.

FORMAT
- Markdown only. One paragraph so simpler questions; three short paragraphs max. Breaking up long paragraphs is preferred.
- At least 1-2 inline links to the excerpts you judge most relevant.
- If the excerpt did not help, do not cite it.
- If the answer is justified by common knowledge, do not cite any excerpts.
- If the answer is ambiguous, explain the ambiguity without citing excerpts.


SOURCES SECTION FORMAT:
End your explanation with:

**Sources:**
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
- Do not mention option letters, option text, “excerpts,” or “context.”
- Do not engage in conversation or add greetings.
`;

  console.info(`[generateExplanationWithLLM] System prompt length: ${systemPrompt.length}`);
  console.info(`[generateExplanationWithLLM] User prompt length: ${userPrompt.length}`);
  console.info(
    `[generateExplanationWithLLM] Total context length: ${systemPrompt.length + userPrompt.length}`
  );

  console.info(`[generateExplanationWithLLM] Available citations provided to LLM:`);
  console.info(availableCitations);

  if (documentChunks.length === 0) {
    console.warn(
      '[generateExplanationWithLLM] No document chunks provided - LLM will generate explanation without context'
    );
  }

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
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const explanation = json.choices?.[0]?.message?.content;

  if (!explanation) {
    throw new Error('No explanation generated by LLM');
  }

  return explanation;
}

export async function generateQuestionExplanation(
  question: NormalizedQuestion
): Promise<ExplanationResult> {
  console.info(
    `[generateQuestionExplanation] Starting explanation generation for question: ${question.id}`
  );
  console.info(`[generateQuestionExplanation] Question type: ${question.questionType}`);
  console.info(
    `[generateQuestionExplanation] Question prompt: ${question.prompt.substring(0, 200)}${
      question.prompt.length > 200 ? '...' : ''
    }`
  );

  try {
    // Create embedding for the question text
    const questionText = `${question.prompt} ${question.choices.join(' ')}`;
    console.info(
      `[generateQuestionExplanation] Full question text for embedding (${
        questionText.length
      } chars): ${questionText.substring(0, 300)}${questionText.length > 300 ? '...' : ''}`
    );

    console.info('[generateQuestionExplanation] Creating embedding for question text...');
    const queryEmbedding = await createEmbedding(questionText);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('Failed to create question embedding');
    }

    console.info(
      `[generateQuestionExplanation] Successfully created embedding with ${queryEmbedding.length} dimensions`
    );

    // Search for relevant document chunks
    console.info('[generateQuestionExplanation] Searching for relevant document chunks...');
    const documentChunks = await searchDocumentChunks(queryEmbedding, 5);

    console.info(`[generateQuestionExplanation] Found ${documentChunks.length} document chunks`);

    if (documentChunks.length > 0) {
      console.info('[generateQuestionExplanation] Document chunks summary:');
      documentChunks.forEach((chunk, index) => {
        console.info(
          `  Chunk ${index + 1}: ${chunk.sourceFile} (score: ${chunk.score?.toFixed(4)}, length: ${
            chunk.text?.length
          })`
        );
      });
    } else {
      console.warn(
        '[generateQuestionExplanation] No relevant document chunks found - proceeding with LLM-only explanation'
      );
    }

    // Generate explanation using LLM
    console.info('[generateQuestionExplanation] Generating explanation with LLM...');
    const explanation = await generateExplanationWithLLM(question, documentChunks);

    console.info(
      `[generateQuestionExplanation] LLM generated explanation (${
        explanation.length
      } chars): ${explanation.substring(0, 200)}${explanation.length > 200 ? '...' : ''}`
    );

    // Extract unique sources
    const sources = documentChunks
      .filter(
        (chunk, index, arr) =>
          arr.findIndex((c) => c.sourceFile === chunk.sourceFile && c.url === chunk.url) === index
      )
      .map((chunk) => ({
        url: chunk.url,
        title: chunk.title,
        sourceFile: chunk.sourceFile,
        sectionPath: chunk.sectionPath,
      }));

    console.info(
      `[generateQuestionExplanation] Extracted ${sources.length} unique sources:`,
      sources.map((s) => ({ sourceFile: s.sourceFile, url: s.url, title: s.title }))
    );

    console.info('[generateQuestionExplanation] Successfully completed explanation generation');

    return {
      explanation,
      sources,
    };
  } catch (error) {
    console.error('[generateQuestionExplanation] Error occurred:', error);
    console.error(
      '[generateQuestionExplanation] Error stack:',
      error instanceof Error ? error.stack : 'No stack trace'
    );
    throw new Error(
      `Failed to generate explanation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
