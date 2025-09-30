import { NextResponse } from 'next/server';

export function middleware() {
  if (process.env.NODE_ENV !== 'development') {
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
