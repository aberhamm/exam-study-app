import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { APP_ID, USER_ROLES } from '@/lib/constants';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create a response object to pass to supabase
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Public routes that don't require authentication or app access
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/access-denied') ||
    pathname.startsWith('/check-email') ||
    pathname.startsWith('/exam');

  // Get user session
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect to home if already authenticated AND has access, trying to access login
  if (user && pathname.startsWith('/login')) {
    // Check if user has access to this app
    const appData = user.app_metadata?.apps?.[APP_ID];
    const hasAccess = appData?.enabled === true;
    const isAdmin = user.app_metadata?.claims_admin === true;

    console.log('🚦 Middleware: User on /login');
    console.log('User Email:', user.email);
    console.log('Has Access:', hasAccess);
    console.log('Global Admin:', isAdmin);

    // Only redirect away from login if user has valid access
    // Otherwise, let them stay on login to try again or see an error
    if (hasAccess || isAdmin) {
      console.log('➡️  Redirecting to home (user has access)');
      return NextResponse.redirect(new URL('/', request.url));
    }
    console.log('⏸️  Allowing access to /login (user has no access)');
    // If user has session but no access, let them stay on login page
    // They might need to sign out and sign in with different credentials
  }

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
    if (!user) {
      // Redirect to login for UI routes
      if (!pathname.startsWith('/api/')) {
        // Preserve the original URL as callbackUrl for post-login redirect
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
        return NextResponse.redirect(loginUrl);
      }
      // Return 401 for API routes
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to this app
    const appData = user.app_metadata?.apps?.[APP_ID];
    const hasAccess = appData?.enabled === true;
    const role = appData?.role || USER_ROLES.USER;

    // ✅ AUTHORIZATION: Admin access requires EITHER:
    // 1. claims_admin: true (global admin), OR
    // 2. apps[APP_ID].role === 'admin' (app-specific admin)
    const isAdmin = role === USER_ROLES.ADMIN || user.app_metadata?.claims_admin === true;

    // For admin routes, check for admin access OR app access
    // This allows both global admins (claims_admin) and app-specific admins
    if (!hasAccess && !isAdmin) {
      // User doesn't have access to this app
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: No app access' }, { status: 403 });
      }
      const accessDeniedUrl = new URL('/access-denied', request.url);
      return NextResponse.redirect(accessDeniedUrl);
    }

    // ✅ AUTHORIZATION: Require admin role
    // Admin access requires: claims_admin OR apps[APP_ID].role === 'admin'
    if (!isAdmin) {
      // API routes: return 403 JSON
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: Admin access requires claims_admin or app admin role' }, { status: 403 });
      }
      // UI routes: redirect to a friendly Forbidden page
      const forbiddenUrl = new URL('/forbidden', request.url);
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  // ✅ AUTHORIZATION: Check if authenticated user has permission on protected routes
  if (user && !isPublicRoute && !isAdminRoute) {
    // Check if user has access to this app
    const appData = user.app_metadata?.apps?.[APP_ID];
    const hasAccess = appData?.enabled === true;
    const isAdmin = user.app_metadata?.claims_admin === true;

    // Allow access if user has app access OR is global admin
    if (!hasAccess && !isAdmin) {
      return NextResponse.redirect(new URL('/access-denied', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (public assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
