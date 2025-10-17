#!/usr/bin/env tsx
/**
 * Check question IDs in the database
 */

import { config } from 'dotenv';
import { getDb, getQuestionsCollectionName } from '../lib/server/mongodb';

config();

async function main() {
  const db = await getDb();
  const collection = db.collection(getQuestionsCollectionName());

  console.log('📋 Checking question IDs...\n');

  const questions = await collection
    .find({ examId: 'sitecore-xmc' })
    .limit(5)
    .toArray();

  console.log(`Found ${questions.length} questions:\n`);

  questions.forEach((q, i) => {
    console.log(`${i + 1}. _id: ${q._id}`);
    console.log(`   _id.toString(): ${q._id.toString()}`);
    console.log(`   question: ${q.question.substring(0, 60)}...`);
    console.log();
  });

  // Check the specific ID from the error
  const testId = '68f23b30bb7f9c837166c7b8';
  console.log(`\nTesting specific ID: ${testId}`);

  const { ObjectId } = await import('mongodb');
  const isValid = ObjectId.isValid(testId);
  console.log(`Is valid ObjectId: ${isValid}`);

  if (isValid) {
    const found = await collection.findOne({ _id: new ObjectId(testId), examId: 'sitecore-xmc' });
    console.log(`Found by { _id: ObjectId, examId }: ${!!found}`);

    if (!found) {
      const found2 = await collection.findOne({ _id: new ObjectId(testId) });
      console.log(`Found by { _id: ObjectId }: ${!!found2}`);
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
