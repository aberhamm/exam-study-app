#!/usr/bin/env node

/**
 * enrich-questions pipeline
 *
 * For each question in a questions JSON file, retrieves relevant documentation
 * chunks via Supabase vector search and generates an explanation using an
 * OpenRouter LLM.  Writes the enriched questions to a JSON file.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { config, getPipelinePaths, getEnvConfig } from './config.js';
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_CONFIG } from './prompts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw row returned by the search_quiz_documents RPC. */
interface DocumentChunkRow {
  id: string;
  chunk_id: string;
  source_file: string;
  source_basename: string | null;
  group_id: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  tags: string[] | null;
  text: string;
  section_path: string | null;
  nearest_heading: string | null;
  chunk_index: number;
  chunk_total: number;
  start_index: number;
  end_index: number;
  model: string;
  dimensions: number;
  content_hash: string | null;
  source_meta: Record<string, unknown> | null;
  score: number;
}

interface DocumentChunk {
  text: string;
  url?: string;
  title?: string;
  sourceFile: string;
  sourceBasename?: string;
  sectionPath?: string;
  score: number;
  chunkIndex?: number;
  chunkTotal?: number;
  startIndex?: number;
  endIndex?: number;
}

interface ExplanationSource {
  url?: string;
  title?: string;
  sourceFile: string;
  sectionPath?: string;
}

interface StudyLink {
  chunkId: string;
  url?: string;
  excerpt?: string;
}

interface ExternalQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: string | string[];
  question_type?: 'single' | 'multiple';
  explanation?: string;
  explanationSources?: ExplanationSource[];
  study?: StudyLink[];
  [key: string]: unknown;
}

interface QuestionsFile {
  examId?: string;
  examTitle?: string;
  questions: ExternalQuestion[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  inputPath?: string;
  outputPath?: string;
  examId?: string;
  model?: string;
  limit?: number;
  skipExisting: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    const paths = getPipelinePaths();
    console.log(`
Usage: pnpm enrich-questions [input-path] [options]

Arguments:
  input-path         Path to questions JSON (default: ${paths.defaultInputFile})

Options:
  --skip-existing    Skip questions that already have explanation + explanationSources with URLs
  --limit <n>        Only process first N questions
  --exam <id>        Exam ID to tag the output with
  --output <path>    Output file path (default: data-pipelines/data/enrich-questions/output/enriched-questions.json)
  --model <model>    OpenRouter model to use (default: ${config.defaultModel})
  --help, -h         Show help

Environment Variables:
  OPENAI_API_KEY             Required: OpenAI API key (for embeddings)
  OPENROUTER_API_KEY         Required: OpenRouter API key (for LLM)
  NEXT_PUBLIC_SUPABASE_URL   Required: Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  Required: Supabase service role key
`);
    process.exit(0);
  }

  const result: CliArgs = { skipExisting: false };

  let i = 0;

  // First positional arg (if not a flag) is the input path
  if (args.length > 0 && !args[0].startsWith('--')) {
    result.inputPath = args[0];
    i = 1;
  }

  while (i < args.length) {
    const flag = args[i];
    switch (flag) {
      case '--skip-existing':
        result.skipExisting = true;
        i += 1;
        break;
      case '--limit':
        result.limit = parseInt(args[i + 1] ?? '', 10);
        if (isNaN(result.limit)) throw new Error(`--limit requires a numeric value`);
        i += 2;
        break;
      case '--exam':
        result.examId = args[i + 1];
        i += 2;
        break;
      case '--output':
        result.outputPath = args[i + 1];
        i += 2;
        break;
      case '--model':
        result.model = args[i + 1];
        i += 2;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Supabase vector search (replicates searchSimilarDocuments from the app)
// ---------------------------------------------------------------------------

function createSupabaseAdminClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function searchQuizDocuments(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  queryEmbedding: number[],
  topK: number
): Promise<DocumentChunk[]> {
  const { data, error } = await supabase.rpc('search_quiz_documents', {
    p_embedding: queryEmbedding,
    p_top_k: topK,
    p_group_ids: null,
  });

  if (error) throw new Error(`search_quiz_documents RPC failed: ${error.message}`);

  const rows = (data ?? []) as DocumentChunkRow[];
  return rows.map((row) => ({
    text: row.text,
    url: row.url ?? undefined,
    title: row.title ?? row.description ?? undefined,
    sourceFile: row.source_file ?? row.source_basename ?? 'unknown',
    sourceBasename: row.source_basename ?? undefined,
    sectionPath: row.section_path ?? undefined,
    score: row.score ?? 0,
    chunkIndex: row.chunk_index,
    chunkTotal: row.chunk_total,
    startIndex: row.start_index,
    endIndex: row.end_index,
  }));
}

// ---------------------------------------------------------------------------
// Document rebuild (replicates rebuildDocumentsFromChunks from the app)
// ---------------------------------------------------------------------------

function rebuildDocumentsFromChunks(
  chunks: DocumentChunk[],
  maxDocs: number,
  maxChars: number
): DocumentChunk[] {
  if (!chunks.length) return [];

  // Group by sourceFile
  const bySource = new Map<string, DocumentChunk[]>();
  for (const c of chunks) {
    const key = c.sourceFile || 'unknown';
    const arr = bySource.get(key) ?? [];
    arr.push(c);
    bySource.set(key, arr);
  }

  const rebuilt: DocumentChunk[] = [];

  for (const [sourceFile, group] of bySource.entries()) {
    // Highest scoring chunk provides metadata
    const top = group.reduce((a, b) => (a.score >= b.score ? a : b));

    // Sort by startIndex, then chunkIndex as fallback
    const sorted = [...group].sort((a, b) => {
      const aHas = typeof a.startIndex === 'number';
      const bHas = typeof b.startIndex === 'number';
      if (aHas && bHas) return (a.startIndex as number) - (b.startIndex as number);
      if (aHas) return -1;
      if (bHas) return 1;
      const ai = typeof a.chunkIndex === 'number' ? (a.chunkIndex as number) : Number.MAX_SAFE_INTEGER;
      const bi = typeof b.chunkIndex === 'number' ? (b.chunkIndex as number) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    // Merge text with overlap handling
    let merged = '';
    let currentEnd = -1;

    for (const ch of sorted) {
      const text = ch.text || '';
      const hasPos = typeof ch.startIndex === 'number' && typeof ch.endIndex === 'number';

      if (!hasPos) {
        merged += (merged ? '\n\n' : '') + text;
        continue;
      }

      const start = ch.startIndex as number;
      const end = ch.endIndex as number;

      if (merged.length === 0) {
        merged = text;
        currentEnd = end;
      } else if (start <= currentEnd) {
        // Overlapping: trim already-covered prefix from this chunk's text
        const overlap = Math.max(0, currentEnd - start + 1);
        const suffix = overlap > 0 ? text.slice(overlap) : text;
        merged += suffix;
        currentEnd = Math.max(currentEnd, end);
      } else {
        // Gap between chunks
        merged += '\n\n' + text;
        currentEnd = end;
      }

      // Early clamp to avoid runaway growth
      if (merged.length > maxChars * 1.5) {
        merged = merged.slice(0, Math.ceil(maxChars * 1.5));
      }
    }

    // Final clamp
    if (merged.length > maxChars) {
      merged = merged.slice(0, maxChars) + '...';
    }

    rebuilt.push({
      text: merged,
      url: top.url,
      title: top.title,
      sourceFile,
      sourceBasename: top.sourceBasename,
      sectionPath: top.sectionPath,
      score: top.score,
    });
  }

  rebuilt.sort((a, b) => b.score - a.score);
  return rebuilt.slice(0, maxDocs);
}

// ---------------------------------------------------------------------------
// Embedding helper
// ---------------------------------------------------------------------------

async function createEmbedding(
  openai: OpenAI,
  text: string,
  model: string,
  dimensions: number
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model,
    input: text,
    dimensions,
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error('Empty embedding response from OpenAI');
  return embedding;
}

// ---------------------------------------------------------------------------
// LLM explanation generation
// ---------------------------------------------------------------------------

async function generateExplanation(
  openai: OpenAI,
  model: string,
  question: ExternalQuestion,
  chunks: DocumentChunk[]
): Promise<string> {
  // Resolve correct answer letter(s)
  const answer = question.answer;
  const answerLetters: string[] = Array.isArray(answer) ? answer : [answer];

  const correctParts = answerLetters.map((letter) => {
    const text = question.options[letter as keyof typeof question.options] ?? '';
    return `${letter}. ${text}`;
  });
  const correctText = correctParts.join(', ');

  // Collect distractor options
  const allLetters: Array<keyof typeof question.options> = ['A', 'B', 'C', 'D', 'E'];
  const distractorLines = allLetters
    .filter((l) => question.options[l] && !answerLetters.includes(l))
    .map((l) => `${l}. ${question.options[l]}`)
    .join('\n');

  // Format documentation chunks as context
  const chunksContext = chunks
    .map((chunk, idx) => {
      const header = chunk.title ?? chunk.sourceFile;
      return `[${idx + 1}] ${header}${chunk.url ? ` (${chunk.url})` : ''}\n${chunk.text}`;
    })
    .join('\n\n---\n\n');

  const userPrompt = buildUserPrompt(
    question.question,
    answerLetters[0] ?? '',
    question.options[answerLetters[0] as keyof typeof question.options] ?? '',
    distractorLines,
    chunksContext
  );

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: PROMPT_CONFIG.temperature,
    max_tokens: PROMPT_CONFIG.maxTokens,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty completion response from OpenRouter');
  return content.trim();
}

// ---------------------------------------------------------------------------
// Skip condition
// ---------------------------------------------------------------------------

function shouldSkip(question: ExternalQuestion, skipExisting: boolean): boolean {
  if (!skipExisting) return false;
  const hasExplanation = typeof question.explanation === 'string' && question.explanation.trim().length > 0;
  const hasSourcesWithUrl =
    Array.isArray(question.explanationSources) &&
    question.explanationSources.length > 0 &&
    question.explanationSources.some((s) => typeof s.url === 'string' && s.url.trim().length > 0);
  return hasExplanation && hasSourcesWithUrl;
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  const cliArgs = parseArgs();
  const paths = getPipelinePaths();
  const envCfg = getEnvConfig();

  // Resolve model override
  const model = cliArgs.model ?? envCfg.model;

  // Resolve input path
  const inputPath = cliArgs.inputPath ?? paths.defaultInputFile;
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Resolve output path
  const outputPath =
    cliArgs.outputPath ??
    join(paths.defaultOutputDir, `enriched-${basename(inputPath, '.json')}.json`);

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Read input questions file
  let questionsFile: QuestionsFile;
  try {
    const raw = readFileSync(inputPath, 'utf-8');
    questionsFile = JSON.parse(raw) as QuestionsFile;
  } catch (err) {
    console.error(`Failed to read/parse input file: ${err}`);
    process.exit(1);
  }

  if (!Array.isArray(questionsFile.questions) || questionsFile.questions.length === 0) {
    console.error('Input file contains no questions');
    process.exit(1);
  }

  // Apply --limit if given
  const allQuestions = questionsFile.questions;
  const questions =
    typeof cliArgs.limit === 'number' ? allQuestions.slice(0, cliArgs.limit) : allQuestions;

  const total = questions.length;

  console.log(`\nenrich-questions pipeline`);
  console.log(`  Input : ${inputPath} (${total} questions)`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Model : ${model}`);
  console.log(`  Skip existing: ${cliArgs.skipExisting}\n`);

  // Initialise clients
  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: envCfg.openrouterApiKey,
  });

  // Separate OpenAI client for embeddings (native OpenAI endpoint)
  const openaiEmbeddings = new OpenAI({ apiKey: envCfg.openaiApiKey });

  const supabase = createSupabaseAdminClient(envCfg.supabaseUrl, envCfg.supabaseServiceRoleKey);

  // Processing counters
  let skipped = 0;
  let succeeded = 0;
  let failed = 0;

  const enrichedQuestions: ExternalQuestion[] = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const label = `[${i + 1}/${total}]`;
    const preview =
      question.question.length > 80
        ? question.question.slice(0, 77) + '...'
        : question.question;

    // Skip condition
    if (shouldSkip(question, cliArgs.skipExisting)) {
      console.log(`${label} Skipping (already enriched): "${preview}"`);
      enrichedQuestions.push(question);
      skipped++;
      continue;
    }

    console.log(`${label} Processing: "${preview}"`);

    try {
      // 1. Embed question text
      const questionEmbedding = await createEmbedding(
        openaiEmbeddings,
        question.question,
        envCfg.embeddingModel,
        envCfg.embeddingDimensions
      );

      // 2. Embed correct answer text
      const answerLetters = Array.isArray(question.answer) ? question.answer : [question.answer];
      const correctAnswerText = answerLetters
        .map((l) => question.options[l as keyof typeof question.options] ?? '')
        .filter(Boolean)
        .join(' ');

      const answerEmbedding = await createEmbedding(
        openaiEmbeddings,
        correctAnswerText || question.question,
        envCfg.embeddingModel,
        envCfg.embeddingDimensions
      );

      // 3. Vector search: top-K chunks per embedding
      const [questionChunks, answerChunks] = await Promise.all([
        searchQuizDocuments(supabase, questionEmbedding, config.topKPerSearch),
        searchQuizDocuments(supabase, answerEmbedding, config.topKPerSearch),
      ]);

      // 4. Merge and deduplicate by sourceFile+chunkIndex, sort by score descending
      const allChunks = [...questionChunks, ...answerChunks].sort((a, b) => b.score - a.score);

      // 5. Rebuild documents: merge overlapping chunks per source, keep top N
      const rebuiltDocs = rebuildDocumentsFromChunks(
        allChunks,
        config.maxDocsAfterRebuild,
        config.maxChunkChars
      );

      // 6. Generate explanation via LLM
      const explanation = await generateExplanation(openai, model, question, rebuiltDocs);

      // 7. Build output fields
      const explanationSources: ExplanationSource[] = rebuiltDocs.map((doc) => ({
        ...(doc.url ? { url: doc.url } : {}),
        ...(doc.title ? { title: doc.title } : {}),
        sourceFile: doc.sourceBasename ?? basename(doc.sourceFile),
        ...(doc.sectionPath ? { sectionPath: doc.sectionPath } : {}),
      }));

      // Build study links from raw (pre-rebuild) top chunks, using chunk identity
      // chunkId format: "{sourceBasename}-{chunkIndex}"
      const topRawChunks = allChunks.slice(0, config.topKPerSearch * 2);
      const study: StudyLink[] = topRawChunks.map((c) => {
        const base = c.sourceBasename ?? basename(c.sourceFile, '.json');
        const chunkId = `${base}-${c.chunkIndex ?? 0}`;
        return {
          chunkId,
          ...(c.url ? { url: c.url } : {}),
          excerpt: c.text.slice(0, 200),
        };
      });

      const enriched: ExternalQuestion = {
        ...question,
        explanation,
        explanationSources,
        study,
      };

      enrichedQuestions.push(enriched);
      succeeded++;
      console.log(`${label} Done (${rebuiltDocs.length} source docs used)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} Failed: ${message}`);
      // Keep original question on failure so output is complete
      enrichedQuestions.push(question);
      failed++;
    }

    // Delay between LLM calls to avoid rate limits (skip after last question)
    if (i < questions.length - 1) {
      await sleep(config.delayBetweenCallsMs);
    }
  }

  // Write output (all questions, including unprocessed ones when --limit is set)
  const outputData: QuestionsFile = {
    ...questionsFile,
    ...(cliArgs.examId ? { examId: cliArgs.examId } : {}),
    questions: enrichedQuestions,
  };

  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
Summary
  Total     : ${total}
  Skipped   : ${skipped}
  Succeeded : ${succeeded}
  Failed    : ${failed}
  Elapsed   : ${elapsed}s
  Output    : ${outputPath}
`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
