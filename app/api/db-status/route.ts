import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/mongodb';

export const dynamic = 'force-dynamic';

interface DBStatus {
  connected: boolean;
  message: string;
  timestamp: string;
  details?: {
    collections?: string[];
    examCount?: number;
    questionCount?: number;
    responseTime?: number;
  };
  error?: string;
}

export async function GET() {
  const startTime = Date.now();

  try {
    // Attempt to get database connection
    const db = await getDb();

    // Test that we can actually query the database
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    // Get counts from main collections
    const examsCollection = db.collection(
      process.env.MONGODB_EXAMS_COLLECTION || 'exams'
    );
    const questionsCollection = db.collection(
      process.env.MONGODB_QUESTIONS_COLLECTION || 'questions'
    );

    const [examCount, questionCount] = await Promise.all([
      examsCollection.countDocuments().catch(() => 0),
      questionsCollection.countDocuments().catch(() => 0),
    ]);

    const responseTime = Date.now() - startTime;

    const status: DBStatus = {
      connected: true,
      message: 'MongoDB connection successful',
      timestamp: new Date().toISOString(),
      details: {
        collections: collectionNames,
        examCount,
        questionCount,
        responseTime,
      },
    };

    return NextResponse.json(status, { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const responseTime = Date.now() - startTime;

    const status: DBStatus = {
      connected: false,
      message: 'MongoDB connection failed',
      timestamp: new Date().toISOString(),
      error: errorMessage,
      details: {
        responseTime,
      },
    };

    console.error('[DB Status Check] Failed:', errorMessage);

    return NextResponse.json(status, { status: 503 });
  }
}
