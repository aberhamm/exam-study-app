import { NextResponse } from 'next/server';
import { isDevFeaturesEnabled } from '@/lib/feature-flags';

export function middleware() {
  if (!isDevFeaturesEnabled()) {
    return new NextResponse('Not Found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/import',
    '/dev/:path*',
    '/api/exams/:examId/questions/import',
    '/api/exams/:examId/questions/:questionId',
    '/api/exams/:examId/questions/embed',
    '/api/exams/:examId/questions/prepare',
    '/api/exams/:examId/stats',
    '/api/exams/:examId/search',
  ],
};
