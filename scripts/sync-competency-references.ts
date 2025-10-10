/**
 * Sync Competency References and Question Counts
 *
 * Purpose:
 * - Detect and remove orphaned competency references in questions
 * - Recalculate and sync questionCount for all competencies
 * - Ensure data consistency between questions and competencies
 *
 * Flags:
 * - --exam <id>      Limit to a specific exam (optional, processes all if not specified)
 * - --dry-run        Show what would be changed without making changes
 * - --fix            Apply fixes (remove orphans and sync counts)
 *
 * Env:
 * - MONGODB_URI, MONGODB_DB
 * - MONGODB_QUESTIONS_COLLECTION, MONGODB_EXAM_COMPETENCIES_COLLECTION
 *
 * Usage:
 * - pnpm tsx scripts/sync-competency-references.ts --exam sitecore-xmc --dry-run
 * - pnpm tsx scripts/sync-competency-references.ts --exam sitecore-xmc --fix
 * - pnpm tsx scripts/sync-competency-references.ts --fix  # Process all exams
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient, ObjectId } from 'mongodb';
import { envConfig } from '../lib/env-config.js';

type QuestionDoc = {
  _id: ObjectId;
  examId: string;
  competencyIds?: string[];
};

type CompetencyDoc = {
  id: string;
  examId: string;
  title: string;
  questionCount?: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const params: {
    exam?: string;
    dryRun?: boolean;
    fix?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') params.exam = args[++i];
    else if (a === '--dry-run') params.dryRun = true;
    else if (a === '--fix') params.fix = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: pnpm tsx scripts/sync-competency-references.ts [--exam <examId>] [--dry-run | --fix]`
      );
      process.exit(0);
    }
  }

  return params;
}

async function main() {
  const { exam, dryRun, fix } = parseArgs();

  if (!dryRun && !fix) {
    console.error('Error: Must specify either --dry-run or --fix');
    process.exit(1);
  }

  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const questionsColName = envConfig.mongo.questionsCollection;
  const competenciesColName = envConfig.mongo.examCompetenciesCollection;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const questionsCol = db.collection<QuestionDoc>(questionsColName);
  const competenciesCol = db.collection<CompetencyDoc>(competenciesColName);

  try {
    console.log(`\n${fix ? 'Syncing' : 'Analyzing'} competency references${exam ? ` for exam: ${exam}` : ' for all exams'}`);
    console.log('='.repeat(80));

    // Get all exams to process
    const examFilter = exam ? { examId: exam } : {};
    const examsToProcess = await questionsCol.distinct('examId', examFilter);

    if (examsToProcess.length === 0) {
      console.log('No exams found to process.');
      return;
    }

    console.log(`\nProcessing ${examsToProcess.length} exam(s): ${examsToProcess.join(', ')}\n`);

    let totalOrphanedReferences = 0;
    let totalQuestionsFixed = 0;
    let totalCompetenciesUpdated = 0;

    for (const examId of examsToProcess) {
      console.log(`\n--- Exam: ${examId} ---`);

      // Get all valid competency IDs for this exam
      const validCompetencies = await competenciesCol
        .find({ examId }, { projection: { id: 1 } })
        .toArray();
      const validCompetencyIds = new Set(validCompetencies.map(c => c.id));

      console.log(`Valid competencies: ${validCompetencyIds.size}`);

      // Find questions with orphaned competency references
      const questions = await questionsCol
        .find({ examId, competencyIds: { $exists: true, $ne: [] } })
        .toArray();

      console.log(`Questions with competency assignments: ${questions.length}`);

      const orphanedQuestions: { questionId: ObjectId; orphanedIds: string[]; validIds: string[] }[] = [];

      for (const question of questions) {
        const competencyIds = question.competencyIds || [];
        const orphanedIds = competencyIds.filter(id => !validCompetencyIds.has(id));

        if (orphanedIds.length > 0) {
          const validIds = competencyIds.filter(id => validCompetencyIds.has(id));
          orphanedQuestions.push({ questionId: question._id, orphanedIds, validIds });
          totalOrphanedReferences += orphanedIds.length;
        }
      }

      if (orphanedQuestions.length > 0) {
        console.log(`\n⚠️  Found ${orphanedQuestions.length} questions with orphaned references:`);
        for (const q of orphanedQuestions) {
          console.log(`  - Question ${q.questionId.toString()}: ${q.orphanedIds.length} orphaned (${q.orphanedIds.join(', ')})`);
        }

        if (fix) {
          console.log(`\n🔧 Fixing orphaned references...`);
          for (const q of orphanedQuestions) {
            await questionsCol.updateOne(
              { _id: q.questionId },
              {
                $set: {
                  competencyIds: q.validIds,
                  updatedAt: new Date(),
                },
              }
            );
          }
          totalQuestionsFixed += orphanedQuestions.length;
          console.log(`✅ Fixed ${orphanedQuestions.length} questions`);
        }
      } else {
        console.log('✅ No orphaned references found');
      }

      // Recalculate questionCount for each competency
      console.log(`\n📊 ${fix ? 'Syncing' : 'Checking'} questionCount for competencies...`);

      const competenciesNeedingUpdate: { id: string; currentCount: number; actualCount: number }[] = [];

      for (const competency of validCompetencies) {
        const actualCount = await questionsCol.countDocuments({
          examId,
          competencyIds: competency.id,
        });

        const competencyDoc = await competenciesCol.findOne(
          { id: competency.id, examId },
          { projection: { questionCount: 1 } }
        );

        const currentCount = competencyDoc?.questionCount ?? 0;

        if (currentCount !== actualCount) {
          competenciesNeedingUpdate.push({
            id: competency.id,
            currentCount,
            actualCount,
          });
        }
      }

      if (competenciesNeedingUpdate.length > 0) {
        console.log(`\n⚠️  Found ${competenciesNeedingUpdate.length} competencies with incorrect questionCount:`);
        for (const c of competenciesNeedingUpdate) {
          console.log(`  - Competency ${c.id}: current=${c.currentCount}, actual=${c.actualCount}`);
        }

        if (fix) {
          console.log(`\n🔧 Updating questionCount...`);
          for (const c of competenciesNeedingUpdate) {
            await competenciesCol.updateOne(
              { id: c.id, examId },
              {
                $set: {
                  questionCount: c.actualCount,
                  updatedAt: new Date(),
                },
              }
            );
          }
          totalCompetenciesUpdated += competenciesNeedingUpdate.length;
          console.log(`✅ Updated ${competenciesNeedingUpdate.length} competencies`);
        }
      } else {
        console.log('✅ All competency questionCounts are accurate');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Summary:');
    console.log(`  Orphaned references: ${totalOrphanedReferences}`);
    console.log(`  Questions ${fix ? 'fixed' : 'needing fix'}: ${totalQuestionsFixed}${!fix && totalQuestionsFixed > 0 ? ' (run with --fix to apply)' : ''}`);
    console.log(`  Competencies ${fix ? 'updated' : 'needing update'}: ${totalCompetenciesUpdated}${!fix && totalCompetenciesUpdated > 0 ? ' (run with --fix to apply)' : ''}`);

    if (!fix && (totalQuestionsFixed > 0 || totalCompetenciesUpdated > 0)) {
      console.log(`\n💡 Run with --fix to apply these changes`);
    } else if (fix) {
      console.log(`\n✅ All changes applied successfully`);
    } else {
      console.log(`\n✅ Data is consistent, no changes needed`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
