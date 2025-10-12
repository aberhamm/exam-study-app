/**
 * Generate Question Explanations
 *
 * Purpose
 * - Generate explanations for questions that don't have them (or regenerate all if --recompute)
 * - Uses the same explanation generation logic as the UI for consistency
 *
 * Flags
 * - --exam <id>       Limit to a specific exam
 * - --limit <n>       Cap number of questions processed
 * - --batch <n>       Batch size for processing (default 10)
 * - --concurrency <n> Number of concurrent generations per batch (default 3)
 * - --delay <ms>      Delay between batches in milliseconds (default 2000)
 * - --recompute       Regenerate explanations even if present (otherwise, generate missing only)
 * - --verbose         Show generated explanation text in output
 *
 * Env
 * - MONGODB_URI, MONGODB_DB, MONGODB_QUESTIONS_COLLECTION, MONGODB_EXAMS_COLLECTION
 * - OPENAI_API_KEY, OPENROUTER_API_KEY
 * - All explanation generator environment variables
 *
 * Usage
 * - pnpm generate:explanations
 * - pnpm generate:explanations --exam sitecore-xmc --batch 15 --concurrency 5 --delay 3000
 * - pnpm generate:explanations --recompute --limit 50
 * - pnpm generate:explanations --verbose --limit 10 --concurrency 2
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient, ObjectId } from 'mongodb';
import { envConfig } from '../lib/env-config.js';
import { generateQuestionExplanation } from '../lib/server/explanation-generator.js';
import { normalizeQuestions } from '../lib/normalize.js';
import type { QuestionDocument } from '../types/question.js';
import type { ExternalQuestion } from '../types/external-question.js';

type ExamDoc = {
  examId: string;
  examTitle?: string;
  documentGroups?: string[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  const params: {
    exam?: string;
    limit?: number;
    recompute?: boolean;
    batch?: number;
    concurrency?: number;
    delay?: number;
    verbose?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') params.exam = args[++i];
    else if (a === '--limit') params.limit = Number(args[++i]);
    else if (a === '--recompute') params.recompute = true;
    else if (a === '--batch') params.batch = Number(args[++i]);
    else if (a === '--concurrency') params.concurrency = Number(args[++i]);
    else if (a === '--delay') params.delay = Number(args[++i]);
    else if (a === '--verbose') params.verbose = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: pnpm generate:explanations [--exam <examId>] [--limit <n>] [--batch <n>] [--concurrency <n>] [--delay <ms>] [--recompute] [--verbose]`
      );
      process.exit(0);
    }
  }
  return params;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const { exam, limit, recompute, batch, concurrency, delay, verbose } = parseArgs();
  const batchSize = batch && batch > 0 ? batch : 10;
  const concurrencyLimit = concurrency && concurrency > 0 ? concurrency : 3;
  const delayMs = delay && delay > 0 ? delay : 2000;

  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const questionsColName = envConfig.mongo.questionsCollection;
  const examsColName = envConfig.mongo.examsCollection;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const qCol = db.collection<QuestionDocument>(questionsColName);
  const examsCol = db.collection<ExamDoc>(examsColName);

  try {
    // Build query filter
    const filter: Record<string, unknown> = {};
    if (exam) {
      filter.examId = exam;
    }

    if (!recompute) {
      // Only find questions without explanations
      filter.$or = [
        { explanation: { $exists: false } },
        { explanation: null },
        { explanation: '' }
      ];
    }

    // Find questions to process
    const cursor = qCol.find(filter).sort({ examId: 1, _id: 1 });
    const toProcess: Array<QuestionDocument & { _id: ObjectId }> = [];

    for await (const doc of cursor) {
      toProcess.push(doc as QuestionDocument & { _id: ObjectId });
      if (typeof limit === 'number' && toProcess.length >= limit) break;
    }

    console.log(`\nFound ${toProcess.length} question${toProcess.length === 1 ? '' : 's'} to process`);
    console.log(`Processing with concurrency: ${concurrencyLimit}`);

    if (toProcess.length === 0) {
      console.log('No questions to process. Exiting.');
      return;
    }

    // Cache exams to avoid repeated lookups
    const examCache = new Map<string, ExamDoc>();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ questionId: string; examId: string; error: string }> = [];

    // Process questions in batches with controlled concurrency
    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batchDocs = toProcess.slice(i, i + batchSize);

      console.log(`\n--- Processing batch ${Math.floor(i / batchSize) + 1} (questions ${i + 1}-${Math.min(i + batchSize, toProcess.length)}) ---`);

      // Process the batch with concurrency limit
      for (let j = 0; j < batchDocs.length; j += concurrencyLimit) {
        const concurrentDocs = batchDocs.slice(j, j + concurrencyLimit);

        // Process concurrent questions in parallel
        const promises = concurrentDocs.map(async (doc, indexInConcurrentBatch) => {
          const questionId = doc._id.toString();
          const examId = doc.examId;
          // Calculate the question number based on position in the overall list
          const questionNumber = i + j + indexInConcurrentBatch + 1;

          try {
            // Get exam info (from cache or database)
            let examDoc = examCache.get(examId);
            if (!examDoc) {
              const found = await examsCol.findOne({ examId });
              if (found) {
                examDoc = found;
                examCache.set(examId, examDoc);
              }
            }

            const documentGroups = examDoc?.documentGroups;

            // Convert to external format and normalize
            const externalQuestion: ExternalQuestion = {
              id: questionId,
              question: doc.question,
              options: doc.options,
              answer: doc.answer,
              question_type: doc.question_type,
              explanation: doc.explanation,
              study: doc.study,
            };

            const [normalizedQuestion] = normalizeQuestions([externalQuestion]);

            // Generate explanation using the same logic as the UI
            console.log(`  [${questionNumber}/${toProcess.length}] Generating explanation for question ${questionId} (exam: ${examId})`);

            const result = await generateQuestionExplanation(
              normalizedQuestion,
              documentGroups,
              doc.embedding
            );

            // Update the question with the explanation
            await qCol.updateOne(
              { _id: new ObjectId(questionId) },
              {
                $set: {
                  explanation: result.explanation,
                  explanationGeneratedByAI: true,
                  updatedAt: new Date()
                }
              }
            );

            console.log(`  ✓ Success for ${questionId} (${result.explanation.length} chars, ${result.sources.length} sources)`);

            if (verbose) {
              console.log('  Explanation:');
              console.log('  ' + '-'.repeat(60));
              // Indent each line of the explanation
              const lines = result.explanation.split('\n');
              lines.forEach(line => console.log('  ' + line));
              console.log('  ' + '-'.repeat(60));
            }

            return { success: true, questionId, examId };

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`  ✗ Failed for ${questionId}: ${errorMsg}`);
            return { success: false, questionId, examId, error: errorMsg };
          }
        });

        // Wait for all concurrent requests to complete
        const results = await Promise.allSettled(promises);

        // Process results
        results.forEach((result) => {
          processed++;
          if (result.status === 'fulfilled') {
            const value = result.value;
            if (value.success) {
              succeeded++;
            } else {
              failed++;
              errors.push({ questionId: value.questionId, examId: value.examId, error: value.error || 'Unknown error' });
            }
          } else {
            // Promise was rejected (shouldn't happen as we catch inside)
            failed++;
          }
        });
      }

      // Delay between batches to avoid rate limits (except after last batch)
      if (i + batchSize < toProcess.length) {
        console.log(`\nWaiting ${delayMs}ms before next batch...`);
        await sleep(delayMs);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total processed: ${processed}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      for (const err of errors) {
        console.log(`  - Question ${err.questionId} (exam: ${err.examId}): ${err.error}`);
      }
    }

    console.log('\nDone.');

  } finally {
    await client.close();
  }
}

main()
  .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Script failed with error:', err);
    process.exit(1);
  });
