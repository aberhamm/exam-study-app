import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Use Node.js runtime for middleware (required for bcrypt, mongodb, crypto)
export const runtime = 'nodejs';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Check if route requires admin access
  const isAdminRoute =
    pathname.startsWith('/admin') ||
    pathname === '/import' ||
    pathname.startsWith('/api/exams/') && (
      pathname.includes('/questions/import') ||
      pathname.includes('/questions/embed') ||
      pathname.includes('/questions/process') ||
      pathname.includes('/explain') ||
      pathname.includes('/explanation') ||
      pathname.includes('/competencies') ||
      pathname.includes('/dedupe')
    );

  if (isAdminRoute) {
    // Require authentication
    if (!session?.user) {
      // Redirect to login for UI routes
      if (!pathname.startsWith('/api/')) {
        // Preserve the original URL as callbackUrl for post-login redirect
        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(loginUrl);
      }
      // Return 401 for API routes
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin role
    if (session.user.role !== 'admin') {
      // API routes: return 403 JSON
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      // UI routes: redirect to a friendly Forbidden page
      const forbiddenUrl = new URL('/forbidden', req.url);
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Admin UI routes
    '/import',
    '/admin/:path*',

    // Admin API operations
    '/api/exams/:examId/questions/import',
    '/api/exams/:examId/questions/embed',
    '/api/exams/:examId/questions/process',
    '/api/exams/:examId/questions/:questionId/explain',
    '/api/exams/:examId/questions/:questionId/explanation',
    '/api/exams/:examId/questions/:questionId/explanation/:path*',
    '/api/exams/:examId/questions/:questionId/competencies',
    '/api/exams/:examId/dedupe',
    '/api/exams/:examId/dedupe/:path*',
    '/api/exams/:examId/competencies/:path*',

    // Note: Read-only routes like /stats, /search, /questions/prepare, /questions (GET) are NOT protected
  ],
};
