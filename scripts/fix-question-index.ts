#!/usr/bin/env tsx
/**
 * Fix problematic unique_examId_id index
 *
 * This script:
 * 1. Drops the invalid unique_examId_id index (id field doesn't exist in DB)
 * 2. Removes the 'id' field from any existing documents (if present)
 */

import { config } from 'dotenv';
import { getDb, getQuestionsCollectionName } from '../lib/server/mongodb';

// Load environment variables from .env file
config();

async function main() {
  console.log('🔧 Fixing question collection indexes...\n');

  const db = await getDb();
  const collectionName = getQuestionsCollectionName();
  const collection = db.collection(collectionName);

  // List current indexes
  console.log('📋 Current indexes:');
  const indexes = await collection.indexes();
  indexes.forEach((idx) => {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
  });
  console.log();

  // Check if the problematic index exists
  const hasProblematicIndex = indexes.some(idx => idx.name === 'unique_examId_id');

  if (hasProblematicIndex) {
    console.log('🗑️  Dropping problematic index: unique_examId_id');
    try {
      await collection.dropIndex('unique_examId_id');
      console.log('✅ Index dropped successfully\n');
    } catch (error) {
      console.error('❌ Failed to drop index:', error);
      process.exit(1);
    }
  } else {
    console.log('ℹ️  Index unique_examId_id does not exist (already fixed or never created)\n');
  }

  // Remove 'id' field from any documents that have it
  console.log('🧹 Removing "id" field from documents (if present)...');
  const result = await collection.updateMany(
    { id: { $exists: true } },
    { $unset: { id: '' } }
  );

  if (result.modifiedCount > 0) {
    console.log(`✅ Removed "id" field from ${result.modifiedCount} document(s)\n`);
  } else {
    console.log('✅ No documents had "id" field\n');
  }

  // List final indexes
  console.log('📋 Final indexes:');
  const finalIndexes = await collection.indexes();
  finalIndexes.forEach((idx) => {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
  });

  console.log('\n✅ Migration complete!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
