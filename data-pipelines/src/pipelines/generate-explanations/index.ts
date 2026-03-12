#!/usr/bin/env node

/**
 * generate-explanations pipeline
 *
 * For each question that has explanationSources, formats those sources as
 * context and calls an LLM to generate a grounded explanation.
 *
 * Run find-question-sources first to populate explanationSources.
 *
 * Usage:
 *   pnpm generate-explanations [input-path] [options]
 *
 * Options:
 *   --skip-existing   Skip questions that already have a grounded explanation
 *   --limit <n>       Only process first N questions
 *   --exam <id>       Exam ID to tag the output with
 *   --model <model>   LLM model to use (overrides default)
 *   --output <path>   Output file path
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import OpenAI from 'openai';
import { config, getPipelinePaths, getEnvConfig } from './config.js';
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_CONFIG } from './prompts.js';
import {
  hasValidExplanation,
  type ExternalQuestion,
  type QuestionsFile,
  type ExplanationSource,
} from '../../shared/utils/document-search.js';

// ---------------------------------------------------------------------------
// CLI
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
Usage: pnpm generate-explanations [input-path] [options]

Arguments:
  input-path        Path to questions JSON with explanationSources populated
                    (default: ${paths.defaultInputFile})

Options:
  --skip-existing   Skip questions that already have a grounded explanation
  --limit <n>       Only process first N questions
  --exam <id>       Exam ID to tag the output with
  --model <model>   LLM model override (default: ${config.defaultModel})
  --output <path>   Output file path
  --help, -h        Show help
`);
    process.exit(0);
  }

  const result: CliArgs = { skipExisting: false };
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
      case '--limit':
        result.limit = parseInt(args[i + 1] ?? '', 10);
        if (isNaN(result.limit)) throw new Error('--limit requires a numeric value');
        i += 2;
        break;
      case '--exam':
        result.examId = args[i + 1];
        i += 2;
        break;
      case '--model':
        result.model = args[i + 1];
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
// LLM client
// ---------------------------------------------------------------------------

function buildLlmClient(envCfg: ReturnType<typeof getEnvConfig>): OpenAI {
  if (envCfg.usePortkey) {
    const headers: Record<string, string> = {
      'x-portkey-api-key': envCfg.portkeyApiKey,
    };
    if (envCfg.portkeyProvider) headers['x-portkey-provider'] = envCfg.portkeyProvider;
    if (envCfg.portkeyCustomHeaders) {
      for (const line of envCfg.portkeyCustomHeaders.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return new OpenAI({
      baseURL: envCfg.portkeyBaseUrl,
      apiKey: 'portkey',
      defaultHeaders: headers,
    });
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: envCfg.openrouterApiKey,
  });
}

// ---------------------------------------------------------------------------
// Explanation generation
// ---------------------------------------------------------------------------

function formatSourcesAsContext(sources: ExplanationSource[]): string {
  return sources
    .map((src, idx) => {
      const header = src.title ?? src.sourceFile;
      return `[${idx + 1}] ${header}${src.url ? ` (${src.url})` : ''}`;
    })
    .join('\n');
}

async function generateExplanation(
  llm: OpenAI,
  model: string,
  question: ExternalQuestion
): Promise<string> {
  const sources = question.explanationSources ?? [];
  const answerLetters = Array.isArray(question.answer) ? question.answer : [question.answer];

  const correctParts = answerLetters.map((letter) => {
    const text = question.options[letter as keyof typeof question.options] ?? '';
    return `${letter}. ${text}`;
  });

  const allLetters: Array<keyof typeof question.options> = ['A', 'B', 'C', 'D', 'E'];
  const distractorLines = allLetters
    .filter((l) => question.options[l] && !answerLetters.includes(l))
    .map((l) => `${l}. ${question.options[l]}`)
    .join('\n');

  const chunksContext = formatSourcesAsContext(sources);

  const userPrompt = buildUserPrompt(
    question.question,
    answerLetters[0] ?? '',
    question.options[answerLetters[0] as keyof typeof question.options] ?? '',
    distractorLines,
    chunksContext
  );

  const completion = await llm.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: PROMPT_CONFIG.temperature,
    max_tokens: PROMPT_CONFIG.maxTokens,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty completion response from LLM');
  return content.trim();
}

// ---------------------------------------------------------------------------
// Sleep
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
  const model = cliArgs.model ?? envCfg.model;

  const inputPath = cliArgs.inputPath ?? paths.defaultInputFile;
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    console.error(`Run find-question-sources first to generate sourced questions.`);
    process.exit(1);
  }

  const outputPath =
    cliArgs.outputPath ??
    join(paths.defaultOutputDir, `explained-${basename(inputPath, '.json')}.json`);

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

  // Warn if many questions have no sources
  const withSources = questions.filter(
    (q) => Array.isArray(q.explanationSources) && q.explanationSources.length > 0
  ).length;
  const withoutSources = total - withSources;

  console.log(`\ngenerate-explanations pipeline`);
  console.log(`  Input           : ${inputPath} (${total} questions)`);
  console.log(`  Output          : ${outputPath}`);
  console.log(`  Model           : ${model}`);
  console.log(`  Skip existing   : ${cliArgs.skipExisting}`);
  console.log(`  Have sources    : ${withSources}`);
  if (withoutSources > 0) {
    console.log(`  No sources      : ${withoutSources} (will skip — run find-question-sources first)`);
  }
  console.log('');

  const llm = buildLlmClient(envCfg);

  let skipped = 0;
  let noSources = 0;
  let succeeded = 0;
  let failed = 0;

  const outputQuestions: ExternalQuestion[] = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const label = `[${i + 1}/${total}]`;
    const preview =
      question.question.length > 80
        ? question.question.slice(0, 77) + '...'
        : question.question;

    // Skip if already has a grounded explanation
    if (cliArgs.skipExisting && hasValidExplanation(question)) {
      console.log(`${label} Skipping (already explained): "${preview}"`);
      outputQuestions.push(question);
      skipped++;
      continue;
    }

    // Skip if no sources available
    if (!Array.isArray(question.explanationSources) || question.explanationSources.length === 0) {
      console.log(`${label} Skipping (no sources): "${preview}"`);
      outputQuestions.push(question);
      noSources++;
      continue;
    }

    console.log(`${label} Explaining: "${preview}"`);

    try {
      const explanation = await generateExplanation(llm, model, question);

      outputQuestions.push({ ...question, explanation });
      succeeded++;
      console.log(`${label} Done`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} Failed: ${message}`);
      outputQuestions.push(question);
      failed++;
    }

    if (i < questions.length - 1) {
      await sleep(config.delayBetweenCallsMs);
    }
  }

  const outputData: QuestionsFile = {
    ...questionsFile,
    ...(cliArgs.examId ? { examId: cliArgs.examId } : {}),
    questions: outputQuestions,
  };

  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
Summary
  Total      : ${total}
  Succeeded  : ${succeeded}
  Skipped    : ${skipped}
  No sources : ${noSources}
  Failed     : ${failed}
  Elapsed    : ${elapsed}s
  Output     : ${outputPath}
`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
