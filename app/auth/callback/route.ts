import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { APP_ID, USER_ROLES } from '@/lib/constants';
import { isUserAdmin } from '@/lib/auth-supabase';

function sanitizeRedirectTarget(raw: string | null): string {
  if (!raw) {
    return '/';
  }

  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return '/';
  }

  return raw;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = sanitizeRedirectTarget(requestUrl.searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Get the user to check access
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.error('❌ No user found after exchanging code');
        return NextResponse.redirect(new URL('/login', requestUrl.origin));
      }

      // Check if user has access to THIS app
      const hasAccess = user.app_metadata?.apps?.[APP_ID]?.enabled === true;
      const userHasAdminAccess = isUserAdmin(user);
      const userRole = user.app_metadata?.apps?.[APP_ID]?.role || USER_ROLES.USER;

      // ✅ AUTHORIZATION: Check if user has app access OR is global admin
      // This allows both global admins (claims_admin) and app-specific admins
      if (!hasAccess && !userHasAdminAccess) {
        console.error('❌ User does not have access to this application', {
          role: userRole,
          claimsAdmin: user.app_metadata?.claims_admin === true,
        });
        return NextResponse.redirect(new URL('/access-denied', requestUrl.origin));
      }

      // ✅ AUTHORIZATION: Explicit admin check before redirecting to admin routes
      // Admin access requires claims_admin or apps[APP_ID].role === 'admin' (handled by isUserAdmin)

      // Check if user tried to access admin routes without admin access
      if (next.startsWith('/admin') && !userHasAdminAccess) {
        console.error('❌ Admin access denied: User does not have claims_admin or app admin role', {
          requestedPath: next,
          role: userRole,
          claimsAdmin: user.app_metadata?.claims_admin === true,
        });
        return NextResponse.redirect(new URL('/access-denied', requestUrl.origin));
      }

      // If user has admin access, redirect to admin routes
      if (userHasAdminAccess) {
        const redirectUrl = next.startsWith('/admin') ? next : '/admin';
        return NextResponse.redirect(new URL(redirectUrl, requestUrl.origin));
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin));
    } else {
      console.error('❌ Error exchanging code for session:', error);
    }
  } else {
    console.error('❌ No code provided in callback');
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin));
}
