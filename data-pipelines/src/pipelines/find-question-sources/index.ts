#!/usr/bin/env node

/**
 * find-question-sources pipeline
 *
 * For each question, embeds the question text and correct answer, searches
 * Supabase for the most relevant documentation chunks, rebuilds them into
 * source documents, and writes explanationSources + study fields.
 *
 * No LLM call is made — this pipeline is purely retrieval.
 * Run generate-explanations afterwards to produce explanation text.
 *
 * Usage:
 *   pnpm find-question-sources [input-path] [options]
 *
 * Options:
 *   --skip-existing      Skip questions that already have explanationSources with URLs
 *   --min-score <0-1>    Minimum top-chunk score to accept sources (default: 0, flags low-confidence)
 *   --limit <n>          Only process first N questions
 *   --exam <id>          Exam ID to tag the output with
 *   --output <path>      Output file path
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { config, getPipelinePaths, getEnvConfig } from './config.js';
import {
  createEmbedding,
  searchQuizDocuments,
  rebuildDocumentsFromChunks,
  buildSourceFields,
  fetchExamDocumentGroups,
  hasValidSources,
  type ExternalQuestion,
  type QuestionsFile,
} from '../../shared/utils/document-search.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  inputPath?: string;
  outputPath?: string;
  examId?: string;
  limit?: number;
  skipExisting: boolean;
  minScore: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    const paths = getPipelinePaths();
    console.log(`
Usage: pnpm find-question-sources [input-path] [options]

Arguments:
  input-path             Path to questions JSON (default: ${paths.defaultInputFile})

Options:
  --skip-existing        Skip questions that already have explanationSources with URLs
  --min-score <0-1>      Minimum top-chunk similarity score to accept sources (default: 0)
                         Questions below this threshold are written without sources and
                         logged as low-confidence so they can be reviewed or re-run.
  --limit <n>            Only process first N questions
  --exam <id>            Exam ID to tag the output with
  --output <path>        Output file path
  --help, -h             Show help
`);
    process.exit(0);
  }

  const result: CliArgs = { skipExisting: false, minScore: 0 };
  let i = 0;

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
      case '--min-score':
        result.minScore = parseFloat(args[i + 1] ?? '');
        if (isNaN(result.minScore)) throw new Error('--min-score requires a numeric value between 0 and 1');
        i += 2;
        break;
      case '--limit':
        result.limit = parseInt(args[i + 1] ?? '', 10);
        if (isNaN(result.limit)) throw new Error('--limit requires a numeric value');
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
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  const cliArgs = parseArgs();
  const paths = getPipelinePaths();
  const envCfg = getEnvConfig();

  const inputPath = cliArgs.inputPath ?? paths.defaultInputFile;
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath =
    cliArgs.outputPath ??
    join(paths.defaultOutputDir, `sourced-${basename(inputPath, '.json')}.json`);

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

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

  const allQuestions = questionsFile.questions;
  const questions =
    typeof cliArgs.limit === 'number' ? allQuestions.slice(0, cliArgs.limit) : allQuestions;
  const total = questions.length;

  console.log(`\nfind-question-sources pipeline`);
  console.log(`  Input         : ${inputPath} (${total} questions)`);
  console.log(`  Output        : ${outputPath}`);
  console.log(`  Skip existing : ${cliArgs.skipExisting}`);
  console.log(`  Min score     : ${cliArgs.minScore > 0 ? cliArgs.minScore : 'none'}`);
  console.log(`  Top-K/search  : ${config.topKPerSearch}`);
  console.log(`  Max docs      : ${config.maxDocsAfterRebuild}\n`);

  const openai = new OpenAI({ apiKey: envCfg.openaiApiKey });
  const supabase = createClient(envCfg.supabaseUrl, envCfg.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve document groups for this exam (null = search all groups)
  const examId = cliArgs.examId ?? questionsFile.examId;
  let documentGroups: string[] | null = null;
  if (examId) {
    documentGroups = await fetchExamDocumentGroups(supabase, examId);
    if (documentGroups) {
      console.log(`  Document groups : ${documentGroups.join(', ')}`);
    } else {
      console.log(`  Document groups : all (no exam groups configured)`);
    }
  } else {
    console.log(`  Document groups : all (no exam ID provided)`);
  }
  console.log('');

  let skipped = 0;
  let succeeded = 0;
  let failed = 0;
  let noResults = 0;
  let lowConfidence = 0;

  const outputQuestions: ExternalQuestion[] = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const label = `[${i + 1}/${total}]`;
    const preview =
      question.question.length > 80
        ? question.question.slice(0, 77) + '...'
        : question.question;

    if (cliArgs.skipExisting && hasValidSources(question)) {
      console.log(`${label} Skipping (already sourced): "${preview}"`);
      outputQuestions.push(question);
      skipped++;
      continue;
    }

    console.log(`${label} Sourcing: "${preview}"`);

    try {
      // 1. Embed question text
      const questionEmbedding = await createEmbedding(
        openai,
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
        openai,
        correctAnswerText || question.question,
        envCfg.embeddingModel,
        envCfg.embeddingDimensions
      );

      // 3. Parallel vector search (scoped to exam's document groups)
      const [questionChunks, answerChunks] = await Promise.all([
        searchQuizDocuments(supabase, questionEmbedding, config.topKPerSearch, documentGroups),
        searchQuizDocuments(supabase, answerEmbedding, config.topKPerSearch, documentGroups),
      ]);

      // 4. Merge and sort by score
      const allChunks = [...questionChunks, ...answerChunks].sort((a, b) => b.score - a.score);

      if (allChunks.length === 0) {
        console.log(`${label} No chunks found — writing question without sources`);
        outputQuestions.push(question);
        noResults++;
        continue;
      }

      // 5. Check min-score threshold
      const topScore = allChunks[0]?.score ?? 0;
      if (cliArgs.minScore > 0 && topScore < cliArgs.minScore) {
        console.warn(
          `${label} Low confidence (top score: ${topScore.toFixed(3)} < ${cliArgs.minScore}) — writing without sources: "${preview}"`
        );
        outputQuestions.push(question);
        lowConfidence++;
        continue;
      }

      // 6. Rebuild documents from chunks
      const rebuiltDocs = rebuildDocumentsFromChunks(
        allChunks,
        config.maxDocsAfterRebuild,
        config.maxChunkChars
      );

      // 7. Build source fields
      const { explanationSources, study } = buildSourceFields(
        rebuiltDocs,
        allChunks,
        config.topKPerSearch * 2
      );

      outputQuestions.push({
        ...question,
        explanationSources,
        study,
      });

      succeeded++;
      console.log(
        `${label} Done — ${rebuiltDocs.length} source doc(s), top score: ${topScore.toFixed(3)}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} Failed: ${message}`);
      outputQuestions.push(question);
      failed++;
    }
  }

  const outputData: QuestionsFile = {
    ...questionsFile,
    ...(cliArgs.examId ? { examId: cliArgs.examId } : {}),
    questions: outputQuestions,
  };

  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);;

  console.log(`
Summary
  Total          : ${total}
  Succeeded      : ${succeeded}
  Skipped        : ${skipped}
  No results     : ${noResults}
  Low confidence : ${lowConfidence}${cliArgs.minScore > 0 ? ` (score < ${cliArgs.minScore})` : ''}
  Failed         : ${failed}
  Elapsed        : ${elapsed}s
  Output         : ${outputPath}
`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
