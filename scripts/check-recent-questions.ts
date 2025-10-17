#!/usr/bin/env tsx
/**
 * Check recent questions to find the one with matching text
 */

import { config } from 'dotenv';
import { getDb, getQuestionsCollectionName } from '../lib/server/mongodb';

config();

async function main() {
  const db = await getDb();
  const collection = db.collection(getQuestionsCollectionName());

  console.log('📋 Checking recent questions by creation date...\n');

  const questions = await collection
    .find({ examId: 'sitecore-xmc' })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  console.log(`Found ${questions.length} most recent questions:\n`);

  questions.forEach((q, i) => {
    console.log(`${i + 1}. ID: ${q._id.toString()}`);
    console.log(`   Created: ${q.createdAt}`);
    console.log(`   Question: ${q.question.substring(0, 80)}...`);
    console.log();
  });

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
