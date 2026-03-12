/**
 * Merge Question Sources
 *
 * Purpose:
 * - Normalize and merge all question sources from data/sources/questions/ into
 *   a single data/exams/sitecore-xmc.json file ready for seed:exams.
 *
 * Sources:
 * - sitecore-xm-cloud-practice-exam.json  (249 questions, JSON)
 * - practice-test-1.md                    (100 questions, markdown)
 * - sitecoreexam_changes.txt              (~60 questions, noisy OCR — uses LLM)
 *
 * Flags:
 * - --skip-ocr   Skip the noisy OCR source (no LLM call needed)
 * - --dry-run    Print summary without writing output file
 *
 * Usage:
 * - pnpm merge:sources
 * - pnpm merge:sources --skip-ocr
 * - pnpm merge:sources --dry-run
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { ExternalQuestionZ, ExamDetailZ } from '@/lib/validation';
import { getLLMClient } from '@/lib/llm-client';
import { envConfig } from '@/lib/env-config';
import type { ExternalQuestion } from '@/types/external-question';

const SOURCES_DIR = path.resolve(process.cwd(), 'data/sources/questions');
const OUTPUT_FILE = path.resolve(process.cwd(), 'data/exams/sitecore-xmc.json');

const EXAM_ID = 'sitecore-xmc';
const EXAM_TITLE = 'Sitecore XM Cloud Developer';

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function deduplicateQuestions(questions: ExternalQuestion[]): ExternalQuestion[] {
  const seen = new Set<string>();
  const result: ExternalQuestion[] = [];
  for (const q of questions) {
    const key = normalizeText(q.question);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(q);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Source 1: JSON
// ---------------------------------------------------------------------------

async function parseJsonSource(filePath: string): Promise<ExternalQuestion[]> {
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as { questions: Array<{ question: string; options: Record<string, string>; answer: string }> };

  const questions: ExternalQuestion[] = [];
  for (const q of data.questions) {
    try {
      const parsed = ExternalQuestionZ.parse({
        question: q.question,
        options: q.options,
        answer: q.answer,
        question_type: 'single',
      });
      questions.push(parsed);
    } catch {
      console.warn(`Skipping invalid JSON question: ${q.question.slice(0, 60)}...`);
    }
  }
  return questions;
}

// ---------------------------------------------------------------------------
// Source 2: Markdown
// Format:
//   ### Question N (Multiple Choice)
//   <question text>
//   **Options:**
//   - A. <option>
//   ...
//   **Answer:** B
// ---------------------------------------------------------------------------

async function parseMarkdownSource(filePath: string): Promise<ExternalQuestion[]> {
  const raw = await readFile(filePath, 'utf-8');
  const questions: ExternalQuestion[] = [];

  // Split on question headers
  const blocks = raw.split(/^###\s+Question\s+\d+/m).slice(1);

  for (const block of blocks) {
    try {
      const isMultiple = /\(Multiple\s+Answer\)/i.test(block);

      // Question text: first non-empty line(s) before **Options:**
      const questionMatch = block.match(/^\s*[\w(][\s\S]*?(?=\*\*Options:\*\*)/);
      if (!questionMatch) continue;
      const question = questionMatch[0]
        .replace(/^\s*\([^)]*\)\s*/, '') // strip type annotation
        .trim();

      // Options
      const optionMatches = [...block.matchAll(/^-\s+([A-E])\.\s+(.+)$/gm)];
      if (optionMatches.length < 4) continue;

      const options: Record<string, string> = {};
      for (const [, letter, text] of optionMatches) {
        options[letter] = text.trim();
      }

      // Answer
      const answerMatch = block.match(/\*\*Answer:\*\*\s*([A-E,\s]+)/);
      if (!answerMatch) continue;

      const rawAnswer = answerMatch[1].trim();
      const answer = isMultiple
        ? (rawAnswer.split(/[,\s]+/).filter(Boolean) as ('A' | 'B' | 'C' | 'D' | 'E')[])
        : (rawAnswer as 'A' | 'B' | 'C' | 'D' | 'E');

      const parsed = ExternalQuestionZ.parse({
        question,
        options,
        answer,
        question_type: isMultiple ? 'multiple' : 'single',
      });
      questions.push(parsed);
    } catch {
      // skip malformed blocks silently
    }
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Source 3: OCR text (noisy) — uses LLM
// ---------------------------------------------------------------------------

async function parseOcrSource(filePath: string): Promise<ExternalQuestion[]> {
  const raw = await readFile(filePath, 'utf-8');

  const usePortkey = envConfig.features.usePortkey;
  const model = usePortkey
    ? (envConfig.portkey.modelGeneration || envConfig.portkey.model)
    : process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

  const client = getLLMClient();

  const prompt = `The following is noisy OCR text scraped from a Sitecore XM Cloud practice exam website.
Each question has 4 options (A, B, C, D). The correct answer is indicated by "@" next to the option letter/text, while incorrect options use "©" or "O".

Clean up and extract all valid multiple-choice questions. Return ONLY a JSON array with this exact format:
[
  {
    "question": "Clean question text?",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "answer": "B",
    "question_type": "single"
  }
]

Rules:
- Fix OCR errors (e.g. "Silecore" → "Sitecore", "8." → "B.", "AO" → "A.")
- Skip any entries that are too garbled to recover
- For multi-select questions, "answer" should be an array like ["A", "C"]
- Return ONLY the JSON array, no other text

OCR TEXT:
${raw}`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You extract and clean exam questions from noisy OCR text. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 4000,
  });

  const responseText = completion.choices[0]?.message?.content?.trim() ?? '';
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('OCR source: no JSON array found in LLM response, skipping.');
    return [];
  }

  const raw_questions = JSON.parse(jsonMatch[0]) as unknown[];
  const questions: ExternalQuestion[] = [];
  for (const q of raw_questions) {
    try {
      questions.push(ExternalQuestionZ.parse(q));
    } catch {
      // skip invalid
    }
  }
  return questions;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const skipOcr = args.includes('--skip-ocr');
  const dryRun = args.includes('--dry-run');

  console.log('Reading question sources...\n');

  // Source 1: JSON
  const jsonFile = path.join(SOURCES_DIR, 'sitecore-xm-cloud-practice-exam.json');
  const jsonQuestions = await parseJsonSource(jsonFile);
  console.log(`  JSON source:     ${jsonQuestions.length} questions`);

  // Source 2: Markdown
  const mdFile = path.join(SOURCES_DIR, 'practice-test-1.md');
  const mdQuestions = await parseMarkdownSource(mdFile);
  console.log(`  Markdown source: ${mdQuestions.length} questions`);

  // Source 3: OCR
  let ocrQuestions: ExternalQuestion[] = [];
  if (skipOcr) {
    console.log(`  OCR source:      skipped (--skip-ocr)`);
  } else {
    console.log(`  OCR source:      parsing via LLM...`);
    const ocrFile = path.join(SOURCES_DIR, 'sitecoreexam_changes.txt');
    ocrQuestions = await parseOcrSource(ocrFile);
    console.log(`  OCR source:      ${ocrQuestions.length} questions`);
  }

  // Merge and deduplicate
  const all = deduplicateQuestions([...jsonQuestions, ...mdQuestions, ...ocrQuestions]);
  console.log(`\n  Total after deduplication: ${all.length} questions`);
  console.log(`  Duplicates removed: ${jsonQuestions.length + mdQuestions.length + ocrQuestions.length - all.length}`);

  // Build exam payload
  const exam = ExamDetailZ.parse({
    examId: EXAM_ID,
    examTitle: EXAM_TITLE,
    welcomeConfig: {
      title: 'Sitecore XM Cloud Developer Certification',
      description: 'Practice exam covering XM Cloud architecture, development workflows, JSS, and deployment.',
      ctaText: 'Start Practice Exam',
      showDefaultSubtitle: true,
    },
    questions: all,
  });

  if (dryRun) {
    console.log('\n[DRY RUN] Would write', all.length, 'questions to', OUTPUT_FILE);
    return;
  }

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(exam, null, 2), 'utf-8');
  console.log(`\nWrote ${all.length} questions to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
