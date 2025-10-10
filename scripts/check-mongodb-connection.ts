/**
 * MongoDB Connection Diagnostic Script
 *
 * Tests connectivity to MongoDB and provides detailed diagnostics
 *
 * Usage:
 *   tsx scripts/check-mongodb-connection.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';

interface DiagnosticResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

async function checkMongoDBConnection(): Promise<DiagnosticResult> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'study-util';

  if (!uri) {
    return {
      success: false,
      message: 'MONGODB_URI environment variable is not set',
      error: 'Missing MONGODB_URI',
    };
  }

  console.log('🔍 MongoDB Connection Diagnostics\n');
  console.log(`📍 Connection URI: ${uri.replace(/\/\/.*@/, '//<credentials>@')}`);
  console.log(`📁 Database: ${dbName}\n`);

  let client: MongoClient | null = null;

  try {
    console.log('⏳ Attempting to connect...');
    const startTime = Date.now();

    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    await client.connect();
    const duration = Date.now() - startTime;

    console.log(`✅ Connected successfully in ${duration}ms\n`);

    // Test database access
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();

    console.log(`📊 Database Info:`);
    console.log(`   - Collections: ${collections.length}`);
    collections.forEach(col => {
      console.log(`     • ${col.name}`);
    });

    // Test a simple query
    console.log(`\n🔎 Testing query access...`);
    const examsCollection = db.collection(process.env.MONGODB_EXAMS_COLLECTION || 'exams');
    const examCount = await examsCollection.countDocuments();
    console.log(`   - Exams found: ${examCount}`);

    const questionsCollection = db.collection(process.env.MONGODB_QUESTIONS_COLLECTION || 'questions');
    const questionCount = await questionsCollection.countDocuments();
    console.log(`   - Questions found: ${questionCount}`);

    console.log(`\n✅ All checks passed!`);

    return {
      success: true,
      message: 'MongoDB connection successful',
      details: {
        connectionTime: `${duration}ms`,
        collections: collections.map(c => c.name),
        examCount,
        questionCount,
      },
    };

  } catch (error) {
    console.error(`\n❌ Connection failed:`);

    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);

      // Provide specific guidance based on error type
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        console.error(`\n💡 DNS Resolution Failed`);
        console.error(`   - Check if Tailscale is running: tailscale status`);
        console.error(`   - Verify the hostname is correct in MONGODB_URI`);
        console.error(`   - Try using the Tailscale IP address instead of hostname`);
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
        console.error(`\n💡 Connection Timeout`);
        console.error(`   - Verify MongoDB is running on the remote server`);
        console.error(`   - Check firewall rules allow port 27017`);
        console.error(`   - Test connectivity: ping <hostname>`);
      } else if (error.message.includes('Authentication failed')) {
        console.error(`\n💡 Authentication Failed`);
        console.error(`   - Verify username and password in MONGODB_URI`);
        console.error(`   - Check authSource parameter (usually 'admin')`);
        console.error(`   - Ensure user has proper permissions`);
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error(`\n💡 Connection Refused`);
        console.error(`   - MongoDB might not be running`);
        console.error(`   - Check if MongoDB is listening on port 27017`);
        console.error(`   - Verify bindIp is set to 0.0.0.0 in mongod.conf`);
      }
    }

    return {
      success: false,
      message: 'MongoDB connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };

  } finally {
    if (client) {
      await client.close();
      console.log(`\n🔌 Connection closed`);
    }
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  MongoDB Connection Diagnostic Tool');
  console.log('═'.repeat(60) + '\n');

  const result = await checkMongoDBConnection();

  console.log('\n' + '═'.repeat(60));
  console.log(`  Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('═'.repeat(60) + '\n');

  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
