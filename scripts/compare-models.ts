/**
 * Model Comparison Script
 *
 * Purpose
 * - Runs the same explanation prompt across multiple models via OpenRouter
 * - Compares output quality, latency, token usage, and estimated cost
 *
 * Flags
 * - --exam <id>       Limit questions to a specific exam
 * - --limit <n>       Number of questions to sample (default: 3)
 * - --models <list>   Comma-separated OpenRouter model IDs (default: sonnet + haiku + gemini)
 * - --output <file>   Save full results as JSON to this path
 *
 * Env
 * - OPENROUTER_API_KEY
 * - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage
 * - pnpm compare:models
 * - pnpm compare:models --exam sitecore-xmc --limit 5
 * - pnpm compare:models --models anthropic/claude-3.5-sonnet,anthropic/claude-3-5-haiku
 * - pnpm compare:models --limit 2 --output results/model-comparison.json
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { buildExplanationPrompts, retrieveExplanationChunks } from '../lib/server/explanation-generator.js';
import { normalizeQuestions } from '../lib/normalize.js';
import type { ExternalQuestion } from '../types/external-question.js';

// ---------------------------------------------------------------------------
// Pricing table (per 1M tokens, USD) — update as needed
// ---------------------------------------------------------------------------

const PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-3.5-sonnet':           { input: 3.00,  output: 15.00 },
  'anthropic/claude-3-5-sonnet':           { input: 3.00,  output: 15.00 },
  'anthropic/claude-3-5-haiku':            { input: 0.80,  output: 4.00  },
  'anthropic/claude-3-haiku':              { input: 0.25,  output: 1.25  },
  'google/gemini-2.0-flash-001':           { input: 0.10,  output: 0.40  },
  'google/gemini-2.0-flash':              { input: 0.10,  output: 0.40  },
  'google/gemini-2.0-flash-exp:free':     { input: 0.00,  output: 0.00  },
  'openai/gpt-4o':                         { input: 2.50,  output: 10.00 },
  'openai/gpt-4o-mini':                    { input: 0.15,  output: 0.60  },
  // Qwen 3.5
  'qwen/qwen3.5-9b':                       { input: 0.10,  output: 0.15  },
  'qwen/qwen3.5-flash-02-23':              { input: 0.10,  output: 0.40  },
  'qwen/qwen3.5-35b-a3b':                  { input: 0.16,  output: 1.30  },
  'qwen/qwen3.5-27b':                      { input: 0.20,  output: 1.56  },
  'qwen/qwen3.5-plus-02-15':               { input: 0.26,  output: 1.56  },
  'qwen/qwen3.5-122b-a10b':               { input: 0.26,  output: 2.08  },
  'qwen/qwen3.5-397b-a17b':               { input: 0.39,  output: 2.34  },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = PRICING[model];
  if (!pricing) return null;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const params: {
    exam?: string;
    limit: number;
    models: string[];
    output?: string;
  } = {
    limit: 3,
    models: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-5-haiku',
      'google/gemini-2.0-flash-001',
      'qwen/qwen3.5-9b',
      'qwen/qwen3.5-35b-a3b',
    ],
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') params.exam = args[++i];
    else if (a === '--limit') params.limit = Number(args[++i]);
    else if (a === '--models') params.models = args[++i].split(',').map(m => m.trim());
    else if (a === '--output') params.output = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: pnpm compare:models [--exam <id>] [--limit <n>] [--models <m1,m2,...>] [--output <file>]`
      );
      process.exit(0);
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).schema('quiz');
}

type QuestionRow = {
  id: string;
  exam_id: string;
  question: string;
  options: Record<string, string>;
  answer: string | string[];
  question_type: 'single' | 'multiple' | null;
  explanation: string | null;
  embedding: number[] | null;
};

type ExamRow = {
  exam_id: string;
  document_groups: string[] | null;
};

async function fetchQuestions(exam?: string, limit = 3): Promise<QuestionRow[]> {
  const db = getSupabaseClient();
  let query = db
    .from('questions')
    .select('id, exam_id, question, options, answer, question_type, explanation, embedding')
    .order('id', { ascending: true })
    .limit(limit);

  if (exam) query = query.eq('exam_id', exam);

  const { data, error } = await query.returns<QuestionRow[]>();
  if (error) throw new Error(`Supabase fetch error: ${error.message}`);
  return data ?? [];
}

async function fetchDocumentGroups(examId: string): Promise<string[] | undefined> {
  const db = getSupabaseClient();
  const { data } = await db
    .from('exams')
    .select('exam_id, document_groups')
    .eq('exam_id', examId)
    .maybeSingle<ExamRow>();
  return data?.document_groups ?? undefined;
}

// ---------------------------------------------------------------------------
// Prompt helpers
// Uses the exported functions from lib/server/explanation-generator so the
// comparison runs on the exact same prompts as production.
// ---------------------------------------------------------------------------

// Optional per-model suffixes appended to the production system prompt.
// Use these to test whether tighter per-model guidance improves output.
const MODEL_SUFFIXES: Record<string, string> = {
  'anthropic/claude-3.5-sonnet':
    'Be concise and do not broaden beyond the minimum needed to justify the answer.',
  'anthropic/claude-3-5-haiku':
    'Be precise and tie the explanation closely to the wording of the question.',
  'google/gemini-2.0-flash-001':
    'Emphasize the key distinction a student should recognize on the exam.',
  'qwen/qwen3.5-35b-a3b':
    'Hard limit: maximum 90 words. Output exactly one paragraph. No examples.',
  'qwen/qwen3.5-9b':
    'Output exactly 3 plain-text sentences. No markdown, no lists, no headings.',
};

function applyModelSuffix(systemPrompt: string, model: string): string {
  const suffix = MODEL_SUFFIXES[model];
  return suffix ? `${systemPrompt}\n\n${suffix}` : systemPrompt;
}

function toExternalQuestion(row: QuestionRow): ExternalQuestion {
  return {
    id: row.id,
    question: row.question,
    options: row.options,
    answer: row.answer as ExternalQuestion['answer'],
    question_type: row.question_type ?? undefined,
    explanation: row.explanation ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// OpenRouter call
// ---------------------------------------------------------------------------

type ModelResult = {
  model: string;
  explanation: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number | null;
  error?: string;
};

async function callModel(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<ModelResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const t0 = Date.now();

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'Study Utility - Model Comparison',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 400,
        // Disable thinking/reasoning mode for Qwen3 models — without this,
        // the model consumes its entire token budget on internal reasoning
        // and returns blank or truncated output.
        ...(model.startsWith('qwen/') ? { reasoning: { exclude: true } } : {}),
      }),
    });

    const latencyMs = Date.now() - t0;

    if (!response.ok) {
      const text = await response.text();
      return {
        model,
        explanation: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        estimatedCostUsd: null,
        error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const explanation = json.choices?.[0]?.message?.content ?? '';
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);

    return { model, explanation, inputTokens, outputTokens, latencyMs, estimatedCostUsd };
  } catch (err) {
    return {
      model,
      explanation: '',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - t0,
      estimatedCostUsd: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
};

const paint = (color: string, text: string) => `${color}${text}${c.reset}`;

const W = 80;

function formatCost(usd: number | null): string {
  if (usd === null) return paint(c.dim, 'unknown');
  if (usd === 0) return paint(c.green, '$0.00 (free)');
  if (usd < 0.0001) return paint(c.green, `$${usd.toFixed(8)}`);
  return paint(c.yellow, `$${usd.toFixed(6)}`);
}

/** Pad/truncate a plain string (no ANSI) to a fixed visual width. */
function pad(s: string, width: number, align: 'left' | 'right' = 'left'): string {
  const trimmed = s.length > width ? s.slice(0, width - 1) + '…' : s;
  const spaces = ' '.repeat(Math.max(0, width - trimmed.length));
  return align === 'right' ? spaces + trimmed : trimmed + spaces;
}

function printResults(
  question: QuestionRow,
  results: ModelResult[],
  questionIndex: number,
  total: number,
): void {
  const thick = paint(c.bold + c.yellow, '━'.repeat(W));
  const thin  = paint(c.dim, '─'.repeat(W));

  // ── Question header ──────────────────────────────────────────────────────
  console.log(`\n${thick}`);

  const qLabel  = `  Q ${questionIndex + 1} / ${total}`;
  const examTag = `${question.exam_id}  `;
  const gap = W - qLabel.length - examTag.length;
  console.log(
    paint(c.bold + c.yellow, qLabel) +
    ' '.repeat(Math.max(1, gap)) +
    paint(c.dim, examTag)
  );
  console.log(thick);

  // ── Question text ─────────────────────────────────────────────────────────
  console.log();
  console.log(`  ${paint(c.bold + c.white, question.question)}`);
  console.log();

  // ── Options ───────────────────────────────────────────────────────────────
  const options  = question.options ?? {};
  const correctSet = new Set(Array.isArray(question.answer) ? question.answer : [question.answer]);
  const optionKeys = Object.keys(options).sort();

  for (const key of optionKeys) {
    const isCorrect = correctSet.has(key);
    const check = isCorrect ? paint(c.bold + c.green, ' ✓') : '  ';
    const keyStr = isCorrect
      ? paint(c.bold + c.green, ` ${key} `)
      : paint(c.dim, ` ${key} `);
    const text = isCorrect
      ? paint(c.green, options[key])
      : paint(c.dim, options[key]);
    console.log(`  ${keyStr} ${text}${check}`);
  }
  console.log();

  // ── Per-model output ──────────────────────────────────────────────────────
  for (const r of results) {
    // Model header bar
    const modelName = pad(r.model, 44);
    let meta: string;
    if (r.error) {
      meta = paint(c.red, 'ERROR');
    } else {
      const tokStr  = paint(c.dim, `${r.inputTokens}→${r.outputTokens} tok`);
      const latStr  = paint(c.dim, `${r.latencyMs}ms`);
      const costStr = formatCost(r.estimatedCostUsd);
      meta = `${latStr}  ${tokStr}  ${costStr}`;
    }

    console.log(paint(c.dim, '  ╭' + '─'.repeat(W - 4) + '╮'));
    console.log(
      paint(c.dim, '  │') + '  ' +
      paint(c.bold + c.cyan, modelName) + '  ' +
      meta
    );
    console.log(paint(c.dim, '  ╰' + '─'.repeat(W - 4) + '╯'));
    console.log();

    if (r.error) {
      console.log(paint(c.red, `    ✗  ${r.error}`));
    } else {
      r.explanation.split('\n').forEach(line => console.log('    ' + line));
    }
    console.log();
  }

  console.log(thin);
}

// ---------------------------------------------------------------------------
// Aggregate cost summary
// ---------------------------------------------------------------------------

function printSummary(
  allResults: Array<{ question: QuestionRow; results: ModelResult[] }>,
  models: string[]
): void {
  const thick = paint(c.bold + c.magenta, '━'.repeat(W));
  const thin  = paint(c.dim, '─'.repeat(W));

  console.log(`\n${thick}`);
  console.log(paint(c.bold + c.magenta, '  SUMMARY'));
  console.log(thick);

  // Table header
  console.log();
  const col = (s: string, w: number) => pad(s, w);
  console.log(
    paint(c.bold + c.white,
      '  ' + col('Model', 38) + col('Tokens (in→out)', 20) + col('Total cost', 14) + col('Avg latency', 12) + 'Per 1k'
    )
  );
  console.log(thin);

  for (const model of models) {
    const rows = allResults.flatMap(r => r.results.filter(x => x.model === model));
    const totalIn  = rows.reduce((s, r) => s + r.inputTokens, 0);
    const totalOut = rows.reduce((s, r) => s + r.outputTokens, 0);
    const totalCost = rows.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);
    const avgLatency = rows.length
      ? Math.round(rows.reduce((s, r) => s + r.latencyMs, 0) / rows.length)
      : 0;
    const errors = rows.filter(r => r.error).length;

    const tokensRaw  = `${totalIn}→${totalOut}`;
    const latencyRaw = `${avgLatency}ms`;
    const costRaw    = totalCost === 0 ? '$0.00 (free)' : `$${totalCost.toFixed(6)}`;

    let per1kRaw = '—';
    const pricing = PRICING[model];
    if (pricing && rows.length > 0) {
      const per1k = estimateCost(model, (totalIn / rows.length) * 1000, (totalOut / rows.length) * 1000);
      per1kRaw = per1k === 0 ? '$0.00 (free)' : per1k !== null ? `$${per1k.toFixed(4)}` : '—';
    }

    const errSuffix = errors > 0 ? paint(c.red, `  ✗ ${errors} err`) : '';

    // Build padded plain columns first, then colorize
    console.log(
      '  ' +
      paint(c.cyan,   col(model,      38)) +
      paint(c.dim,    col(tokensRaw,  20)) +
      paint(c.yellow, col(costRaw,    14)) +
      paint(c.dim,    col(latencyRaw, 12)) +
      paint(c.green,  per1kRaw) +
      errSuffix
    );
  }

  console.log();
  console.log(thin);
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { exam, limit, models, output } = parseArgs();

  const banner = paint(c.bold + c.yellow, '━'.repeat(W));
  console.log(`\n${banner}`);
  console.log(paint(c.bold + c.yellow, '  MODEL COMPARISON'));
  console.log(banner);
  console.log(paint(c.dim, `  Models:    ${models.join('  ·  ')}`));
  console.log(paint(c.dim, `  Questions: up to ${limit}${exam ? `  ·  exam: ${exam}` : ''}`));

  const questions = await fetchQuestions(exam, limit);
  console.log(`\nFetched ${questions.length} question(s) from Supabase.`);

  if (questions.length === 0) {
    console.log('No questions found. Exiting.');
    return;
  }

  // Cache exam document_groups to avoid repeated lookups
  const examCache = new Map<string, string[] | undefined>();

  const allResults: Array<{ question: QuestionRow; results: ModelResult[] }> = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const question = questions[qi];

    // Fetch exam document_groups (used to scope vector search)
    if (!examCache.has(question.exam_id)) {
      examCache.set(question.exam_id, await fetchDocumentGroups(question.exam_id));
    }
    const documentGroups = examCache.get(question.exam_id);

    // Normalize to the format the generator expects
    const [normalizedQuestion] = normalizeQuestions([toExternalQuestion(question)]);

    // Run RAG retrieval once per question — all models share the same context
    console.log(paint(c.dim, `\n  Retrieving context for question ${qi + 1}/${questions.length}...`));
    let chunks: Awaited<ReturnType<typeof retrieveExplanationChunks>> = [];
    try {
      chunks = await retrieveExplanationChunks(
        normalizedQuestion,
        documentGroups,
        question.embedding ?? undefined
      );
    } catch (err) {
      console.warn(paint(c.yellow, `  Warning: RAG retrieval failed — running without context. ${err instanceof Error ? err.message : String(err)}`));
    }

    // Build the real production prompts from the retrieved chunks
    const { systemPrompt, userPrompt } = buildExplanationPrompts(normalizedQuestion, chunks);

    // Run all models concurrently with the same prompts, applying per-model suffixes
    const results = await Promise.all(
      models.map(model => callModel(model, applyModelSuffix(systemPrompt, model), userPrompt))
    );

    allResults.push({ question, results });
    printResults(question, results, qi, questions.length);
  }

  printSummary(allResults, models);

  if (output) {
    const dir = path.dirname(output);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(output, JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`Results saved to ${output}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });
