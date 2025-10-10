import { NextResponse } from 'next/server';
import { envConfig } from '@/lib/env-config';

export function middleware() {
  if (!envConfig.features.devFeaturesEnabled) {
    return new NextResponse('Not Found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // UI routes for dev tools
    '/import',
    '/dev/:path*',

    // Write/admin operations only
    '/api/exams/:examId/questions/import',
    '/api/exams/:examId/questions/embed',
    '/api/exams/:examId/questions/process',
    '/api/exams/:examId/questions/:questionId/explain',
    '/api/exams/:examId/questions/:questionId/competencies',
    '/api/exams/:examId/dedupe',
    '/api/exams/:examId/dedupe/:path*',
    '/api/exams/:examId/competencies/:path*',

    // Note: Read-only routes like /stats, /search, /questions/prepare, /questions (GET) are NOT protected
  ],
};
