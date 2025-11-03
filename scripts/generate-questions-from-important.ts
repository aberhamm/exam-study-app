/**
 * Generate Exam Questions from Important Sections
 *
 * Purpose:
 * - Read important-sections.json
 * - Use OpenRouter to generate exam questions for each section
 * - Save questions in exam format ready for import
 *
 * Env:
 * - OPENROUTER_API_KEY
 * - OPENROUTER_MODEL (optional, defaults to google/gemini-2.0-flash-exp:free)
 *
 * Usage:
 * - pnpm generate:important-questions [--limit N] [--dry-run]
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { ExternalQuestion } from '@/types/external-question';
import { ExternalQuestionZ } from '@/lib/validation';
import { envConfig } from '@/lib/env-config';
import { getLLMClient } from '@/lib/llm-client';

const INPUT_FILE = path.resolve(process.cwd(), 'data/important-sections.json');
const OUTPUT_FILE = path.resolve(process.cwd(), 'data/generated-important-questions.json');

interface ImportantSection {
  sourceFile: string;
  title: string;
  context: string;
  content: string;
  type: string;
}

interface GeneratedQuestionSet {
  section: ImportantSection;
  questions: ExternalQuestion[];
  generatedAt: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

/**
 * Create a prompt for generating exam questions from an important section
 */
function createQuestionPrompt(section: ImportantSection): string {
  return `You are an expert at creating certification exam questions for Sitecore XM Cloud.

Based on the following IMPORTANT documentation section, generate 1-3 high-quality exam questions that test understanding of this critical concept.

Source Document: ${section.title}
Section: ${section.context}
Type: ${section.type}

IMPORTANT CONTENT:
${section.content}

REQUIREMENTS:
1. Questions should be clear, unambiguous, and professional
2. Each question should have 4 options (A, B, C, D)
3. Include both single-select and multiple-select questions where appropriate
4. Focus on testing practical understanding, not just memorization
5. Explanations should reinforce the important concept and explain why other options are incorrect
6. Reference the source documentation in the explanation

Return ONLY a valid JSON array of questions in this exact format:
[
  {
    "question": "Question text here?",
    "question_type": "single",
    "options": {
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    },
    "answer": "A",
    "explanation": "Detailed explanation referencing the important concept from ${section.title}. Explain why the correct answer is right and why others are wrong.",
    "study": [
      {
        "chunkId": "${section.sourceFile.replace('.md', '')}-important",
        "excerpt": "Brief relevant excerpt from the important section"
      }
    ]
  }
]

For multiple-select questions, use:
  "question_type": "multiple",
  "answer": ["A", "B"],

Generate between 1-3 questions depending on the complexity and importance of the content. Return ONLY the JSON array, no other text.`;
}

/**
 * Generate questions using Portkey or OpenRouter (based on feature flag)
 */
async function generateQuestions(
  client: ReturnType<typeof getLLMClient>,
  section: ImportantSection,
  dryRun: boolean,
  model: string
): Promise<ExternalQuestion[]> {
  if (dryRun) {
    console.log(`[DRY RUN] Would generate questions for: ${section.title} > ${section.context}`);
    return [];
  }

  const prompt = createQuestionPrompt(section);

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at creating Sitecore XM Cloud certification exam questions. Return only valid JSON arrays of question objects.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0]?.message?.content?.trim();
    if (!responseText) {
      throw new Error('Empty response from LLM');
    }

    // Extract JSON from response (in case there's any surrounding text)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Response:', responseText);
      throw new Error('No JSON array found in response');
    }

    const questions = JSON.parse(jsonMatch[0]);

    // Validate each question
    const validatedQuestions: ExternalQuestion[] = [];
    for (const q of questions) {
      try {
        const validated = ExternalQuestionZ.parse(q);
        validatedQuestions.push(validated);
      } catch (error) {
        console.error(`Invalid question generated for ${section.title}:`, error);
      }
    }

    return validatedQuestions;
  } catch (error) {
    console.error(`Error generating questions for ${section.title}:`, error);
    return [];
  }
}

async function main() {
  // Check if using Portkey or OpenRouter
  const usePortkey = envConfig.features.usePortkey;
  const model = usePortkey
    ? (envConfig.portkey.modelGeneration || envConfig.portkey.model)
    : process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

  // Ensure required API keys are available
  if (usePortkey) {
    if (!envConfig.portkey.apiKey) {
      throw new Error('Portkey requires PORTKEY_API_KEY environment variable');
    }
  } else {
    requireEnv('OPENROUTER_API_KEY');
  }

  const args = process.argv.slice(2);

  let limit: number | null = null;
  let dryRun = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  console.log(`Reading important sections from ${INPUT_FILE}...`);
  const sectionsData = await readFile(INPUT_FILE, 'utf-8');
  let sections: ImportantSection[] = JSON.parse(sectionsData);

  if (limit) {
    sections = sections.slice(0, limit);
    console.log(`Limited to first ${limit} sections`);
  }

  console.log(`Processing ${sections.length} important sections...`);
  console.log(`Using ${usePortkey ? 'Portkey' : 'OpenRouter'} with model: ${model}`);
  if (dryRun) {
    console.log('[DRY RUN MODE - No API calls will be made]');
  }

  // Use LLM client wrapper (routes to Portkey or OpenRouter based on feature flag)
  const client = getLLMClient();
  const results: GeneratedQuestionSet[] = [];

  let totalQuestions = 0;
  let processed = 0;

  for (const section of sections) {
    processed++;
    console.log(
      `\n[${processed}/${sections.length}] Processing: ${section.title} > ${section.context}`
    );

    const questions = await generateQuestions(client, section, dryRun, model);

    if (questions.length > 0) {
      results.push({
        section,
        questions,
        generatedAt: new Date().toISOString(),
      });
      totalQuestions += questions.length;
      console.log(`  ✓ Generated ${questions.length} question(s)`);
    } else if (!dryRun) {
      console.log(`  ✗ No questions generated`);
    }

    // Rate limiting: wait 1 second between requests
    if (!dryRun && processed < sections.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Sections processed: ${processed}`);
  console.log(`Question sets generated: ${results.length}`);
  console.log(`Total questions: ${totalQuestions}`);

  if (!dryRun) {
    await writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nSaved to ${OUTPUT_FILE}`);
  }

  // Also save a flat questions array for easy import
  if (!dryRun && results.length > 0) {
    const flatQuestions = results.flatMap((r) => r.questions);
    const flatOutputFile = path.resolve(process.cwd(), 'data/important-questions-flat.json');
    await writeFile(flatOutputFile, JSON.stringify(flatQuestions, null, 2), 'utf-8');
    console.log(`Flat questions saved to ${flatOutputFile}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
