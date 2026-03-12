/**
 * Generate Questions from Study Notes
 *
 * Purpose:
 * - Read markdown study notes from data/sources/study-notes/
 * - Split each file into sections by heading
 * - Generate exam questions for each section via LLM
 * - Merge with existing data/exams/sitecore-xmc.json (preserves existing questions)
 *
 * Flags:
 * - --limit N     Process only the first N sections (useful for testing)
 * - --dry-run     Print what would be generated without writing or making LLM calls
 * - --file <name> Process only a specific study notes file
 *
 * Usage:
 * - pnpm generate:from-notes
 * - pnpm generate:from-notes --limit 5 --dry-run
 * - pnpm generate:from-notes --file lecture.md
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { ExternalQuestionZ, ExamDetailZ } from '@/lib/validation';
import { getLLMClient } from '@/lib/llm-client';
import { envConfig } from '@/lib/env-config';
import type { ExternalQuestion } from '@/types/external-question';

const STUDY_NOTES_DIR = path.resolve(process.cwd(), 'data/sources/study-notes');
const EXAM_FILE = path.resolve(process.cwd(), 'data/exams/sitecore-xmc.json');

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
// Section splitting
// ---------------------------------------------------------------------------

interface Section {
  sourceFile: string;
  heading: string;
  content: string;
}

function splitIntoSections(content: string, sourceFile: string): Section[] {
  // Strip Obsidian frontmatter
  const stripped = content.replace(/^---[\s\S]*?---\n?/, '').trim();

  // Split on any markdown heading (## or ###)
  const parts = stripped.split(/^(#{1,3}\s+.+)$/m);
  const sections: Section[] = [];

  let currentHeading = path.basename(sourceFile, '.md');
  let buffer = '';

  for (const part of parts) {
    if (/^#{1,3}\s+/.test(part)) {
      if (buffer.trim().length > 100) {
        sections.push({ sourceFile, heading: currentHeading, content: buffer.trim() });
      }
      currentHeading = part.replace(/^#+\s*/, '').trim();
      buffer = '';
    } else {
      buffer += part;
    }
  }

  // Last section
  if (buffer.trim().length > 100) {
    sections.push({ sourceFile, heading: currentHeading, content: buffer.trim() });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

async function generateQuestionsForSection(
  section: Section,
  client: ReturnType<typeof getLLMClient>,
  model: string
): Promise<ExternalQuestion[]> {
  const prompt = `You are an expert at creating Sitecore XM Cloud Developer certification exam questions.

Based on the following study notes section, generate 2-4 high-quality exam questions that test practical understanding of the concepts covered.

Source: ${section.sourceFile}
Section: ${section.heading}

CONTENT:
${section.content.slice(0, 3000)}

REQUIREMENTS:
1. Questions must be clear and unambiguous
2. Each question must have exactly 4 options (A, B, C, D)
3. Include single-select and multi-select questions where appropriate
4. Test practical knowledge, not just memorization
5. Explanations should clarify why the correct answer is right and why others are wrong

Return ONLY a valid JSON array in this exact format:
[
  {
    "question": "Question text?",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "answer": "B",
    "question_type": "single",
    "explanation": "Explanation of the correct answer..."
  }
]

For multi-select: "answer": ["A", "C"], "question_type": "multiple"
Return ONLY the JSON array, no other text.`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You create Sitecore XM Cloud certification exam questions. Return only valid JSON arrays.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const responseText = completion.choices[0]?.message?.content?.trim() ?? '';
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const raw = JSON.parse(jsonMatch[0]) as unknown[];
  const questions: ExternalQuestion[] = [];
  for (const q of raw) {
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
  const dryRun = args.includes('--dry-run');

  let limitArg: number | null = null;
  let fileFilter: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limitArg = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--file' && args[i + 1]) {
      fileFilter = args[i + 1];
      i++;
    }
  }

  const usePortkey = envConfig.features.usePortkey;
  const model = usePortkey
    ? (envConfig.portkey.modelGeneration || envConfig.portkey.model)
    : process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

  console.log(`Using ${usePortkey ? 'Portkey' : 'OpenRouter'} with model: ${model}`);
  if (dryRun) console.log('[DRY RUN — no LLM calls or file writes]\n');

  // Discover study note files
  const allFiles = await readdir(STUDY_NOTES_DIR);
  const mdFiles = allFiles
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !fileFilter || f === fileFilter);

  if (mdFiles.length === 0) {
    console.log('No study note files found.');
    return;
  }

  console.log(`Found ${mdFiles.length} study note file(s): ${mdFiles.join(', ')}\n`);

  // Split all files into sections
  let sections: Section[] = [];
  for (const file of mdFiles) {
    const content = await readFile(path.join(STUDY_NOTES_DIR, file), 'utf-8');
    const fileSections = splitIntoSections(content, file);
    console.log(`  ${file}: ${fileSections.length} section(s)`);
    sections.push(...fileSections);
  }

  if (limitArg) {
    sections = sections.slice(0, limitArg);
    console.log(`\nLimited to first ${limitArg} sections`);
  }

  console.log(`\nProcessing ${sections.length} section(s)...\n`);

  if (dryRun) {
    for (const s of sections) {
      console.log(`  [${s.sourceFile}] ${s.heading}`);
    }
    return;
  }

  // Load existing exam file if present
  let existingQuestions: ExternalQuestion[] = [];
  try {
    const raw = await readFile(EXAM_FILE, 'utf-8');
    const parsed = ExamDetailZ.parse(JSON.parse(raw));
    existingQuestions = parsed.questions;
    console.log(`Loaded ${existingQuestions.length} existing questions from ${EXAM_FILE}\n`);
  } catch {
    console.log('No existing exam file found — will create fresh output\n');
  }

  const client = getLLMClient();
  const generated: ExternalQuestion[] = [];
  let processed = 0;

  for (const section of sections) {
    processed++;
    process.stdout.write(`[${processed}/${sections.length}] ${section.sourceFile} > ${section.heading} ... `);

    const questions = await generateQuestionsForSection(section, client, model);
    generated.push(...questions);
    console.log(`${questions.length} question(s)`);

    // Rate limiting
    if (processed < sections.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Merge with existing, deduplicate
  const merged = deduplicateQuestions([...existingQuestions, ...generated]);
  const newCount = merged.length - existingQuestions.length;

  console.log(`\n=== Summary ===`);
  console.log(`Sections processed:  ${processed}`);
  console.log(`Questions generated: ${generated.length}`);
  console.log(`New after dedup:     ${newCount}`);
  console.log(`Total questions:     ${merged.length}`);

  // Load existing exam metadata if present, preserve it
  let examMeta = {
    examId: 'sitecore-xmc',
    examTitle: 'Sitecore XM Cloud Developer',
    welcomeConfig: {
      title: 'Sitecore XM Cloud Developer Certification',
      description: 'Practice exam covering XM Cloud architecture, development workflows, JSS, and deployment.',
      ctaText: 'Start Practice Exam',
      showDefaultSubtitle: true,
    },
  };

  try {
    const raw = await readFile(EXAM_FILE, 'utf-8');
    const parsed = ExamDetailZ.parse(JSON.parse(raw));
    examMeta = {
      examId: parsed.examId ?? examMeta.examId,
      examTitle: parsed.examTitle ?? examMeta.examTitle,
      welcomeConfig: parsed.welcomeConfig ?? examMeta.welcomeConfig,
    };
  } catch {
    // use defaults
  }

  const exam = ExamDetailZ.parse({ ...examMeta, questions: merged });
  await writeFile(EXAM_FILE, JSON.stringify(exam, null, 2), 'utf-8');
  console.log(`\nWrote ${merged.length} questions to ${EXAM_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
