#!/usr/bin/env tsx
/**
 * Find a specific question by ID
 */

import { config } from 'dotenv';
import { getDb, getQuestionsCollectionName } from '../lib/server/mongodb';
import { ObjectId } from 'mongodb';

config();

async function main() {
  const testId = process.argv[2] || '68e42c935bc0a338524f8a84';

  console.log(`\n🔍 Searching for question ID: ${testId}\n`);

  const db = await getDb();
  const collection = db.collection(getQuestionsCollectionName());

  const isValid = ObjectId.isValid(testId);
  console.log(`✓ Is valid ObjectId format: ${isValid}`);

  if (!isValid) {
    console.log('❌ Not a valid ObjectId format');
    process.exit(1);
  }

  // Try multiple search strategies
  console.log('\n📋 Searching with different strategies:\n');

  const q1 = await collection.findOne({ _id: new ObjectId(testId), examId: 'sitecore-xmc' });
  console.log(`1. { _id: ObjectId, examId: 'sitecore-xmc' }: ${q1 ? '✓ FOUND' : '✗ not found'}`);

  const q2 = await collection.findOne({ _id: new ObjectId(testId) });
  console.log(`2. { _id: ObjectId }: ${q2 ? '✓ FOUND' : '✗ not found'}`);

  const q3 = await collection.findOne({ id: testId });
  console.log(`3. { id: "${testId}" }: ${q3 ? '✓ FOUND' : '✗ not found'}`);

  // Check if any question has this as a string _id
  const q4 = await collection.findOne({ _id: testId as unknown as ObjectId });
  console.log(`4. { _id: "${testId}" (string) }: ${q4 ? '✓ FOUND' : '✗ not found'}`);

  // List all questions to see what IDs we have
  console.log('\n📚 All question IDs in the database:\n');
  const allQuestions = await collection
    .find({ examId: 'sitecore-xmc' }, { projection: { _id: 1, question: 1 } })
    .limit(20)
    .toArray();

  allQuestions.forEach((q, i) => {
    const idStr = q._id.toString();
    const match = idStr === testId ? ' ← MATCH!' : '';
    console.log(`${i + 1}. ${idStr}${match}`);
    console.log(`   ${q.question.substring(0, 60)}...`);
  });

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
