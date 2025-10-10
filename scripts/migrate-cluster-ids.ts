/**
 * Migrate Cluster Question IDs from String to ObjectId
 *
 * Converts old string IDs like "q-1enjk1b" to MongoDB ObjectId strings
 * like "68dafaf8773b555f0e4072a8" in cluster questionIds arrays.
 *
 * Usage:
 *   pnpm migrate:cluster-ids
 *   pnpm migrate:cluster-ids --exam sitecore-xmc
 *   pnpm migrate:cluster-ids --dry-run
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';
import { envConfig } from '../lib/env-config.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const params: { exam?: string; dryRun?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--exam') params.exam = args[++i];
    else if (a === '--dry-run') params.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: pnpm migrate:cluster-ids [--exam <examId>] [--dry-run]`);
      process.exit(0);
    }
  }
  return params;
}

async function main() {
  const { exam, dryRun } = parseArgs();
  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const questionsColName = envConfig.mongo.questionsCollection;
  const clustersColName = envConfig.mongo.questionClustersCollection;

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const questionsCol = db.collection(questionsColName);
    const clustersCol = db.collection(clustersColName);

    // Get all clusters (optionally filtered by exam)
    const filter: Record<string, unknown> = {};
    if (exam) filter.examId = exam;

    const clusters = await clustersCol.find(filter).toArray();
    console.log(`Found ${clusters.length} cluster(s) to process${exam ? ` for exam ${exam}` : ''}`);

    if (dryRun) {
      console.log('\n*** DRY RUN MODE - No changes will be made ***\n');
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const cluster of clusters) {
      const questionIds = cluster.questionIds as string[] | undefined;
      if (!questionIds || questionIds.length === 0) {
        console.log(`Cluster ${cluster.id}: No questionIds, skipping`);
        skippedCount++;
        continue;
      }

      // Check if already migrated (ObjectId format is 24 hex chars)
      const isAlreadyMigrated = questionIds.every(
        id => /^[0-9a-f]{24}$/i.test(id)
      );

      if (isAlreadyMigrated) {
        console.log(`Cluster ${cluster.id}: Already migrated (${questionIds.length} ObjectIds)`);
        skippedCount++;
        continue;
      }

      // Build mapping: old string ID -> ObjectId string
      const idMapping = new Map<string, string>();

      // Find questions with these old IDs
      const questions = await questionsCol
        .find({
          examId: cluster.examId,
          id: { $in: questionIds }
        })
        .toArray();

      for (const q of questions) {
        if (q.id && q._id) {
          idMapping.set(q.id as string, q._id.toString());
        }
      }

      // Map old IDs to new ObjectId strings
      const newQuestionIds: string[] = [];
      const notFound: string[] = [];

      for (const oldId of questionIds) {
        const newId = idMapping.get(oldId);
        if (newId) {
          newQuestionIds.push(newId);
        } else {
          notFound.push(oldId);
        }
      }

      if (notFound.length > 0) {
        console.warn(
          `Cluster ${cluster.id}: Could not find ${notFound.length}/${questionIds.length} questions:`,
          notFound
        );
      }

      // Update cluster with new IDs
      if (newQuestionIds.length > 0) {
        if (!dryRun) {
          await clustersCol.updateOne(
            { _id: cluster._id },
            { $set: { questionIds: newQuestionIds, updatedAt: new Date() } }
          );
        }

        console.log(
          `${dryRun ? '[DRY RUN] ' : ''}Migrated cluster ${cluster.id}: ${questionIds.length} IDs -> ${newQuestionIds.length} ObjectIds`
        );
        if (notFound.length === 0) {
          migratedCount++;
        } else {
          console.warn(`  ⚠️  ${notFound.length} questions not found, cluster may be incomplete`);
          errorCount++;
        }
      } else {
        console.error(`Cluster ${cluster.id}: No valid questions found!`);
        errorCount++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total clusters: ${clusters.length}`);
    console.log(`Migrated: ${migratedCount}`);
    console.log(`Skipped (already migrated): ${skippedCount}`);
    console.log(`Errors/Warnings: ${errorCount}`);

    if (dryRun) {
      console.log('\n*** DRY RUN MODE - No changes were made ***');
    }

  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});
