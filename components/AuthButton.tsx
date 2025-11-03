'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session-utils';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, Shield } from 'lucide-react';
import { APP_ID, ACCESS_TIERS, USER_ROLES } from '@/lib/constants';
import type { User } from '@supabase/supabase-js';

// Helper to transform User to AppUser with app-specific claims
function transformToAppUser(user: User | null) {
  if (!user) return null;

  const appData = user.app_metadata?.apps?.[APP_ID];
  const hasAccess = appData?.enabled === true;
  const role = appData?.role || USER_ROLES.USER;
  const tier = appData?.tier || ACCESS_TIERS.FREE;
  const permissions = appData?.permissions || [];
  const isAdmin = role === USER_ROLES.ADMIN || user.app_metadata?.claims_admin === true;

  return {
    id: user.id,
    email: user.email || '',
    role,
    tier,
    hasAccess,
    isAdmin,
    permissions,
  };
}

function AuthButtonInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useSession();
  const supabase = createClient();

  // Transform user to AppUser with app-specific claims
  const appUser = useMemo(() => {
    return transformToAppUser(user);
  }, [user]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        Loading...
      </Button>
    );
  }

  // If user is authenticated (logged in), show Sign Out
  // Check user directly, not appUser, since user might not have app access
  if (user) {
    // If user has app access, show full UI
    if (appUser?.hasAccess) {
      return (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4" />
            <span className="font-medium">{appUser.email}</span>
            {appUser.isAdmin && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                Admin
              </span>
            )}
            {appUser.tier === 'premium' && (
              <span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded">
                Premium
              </span>
            )}
          </div>
          {appUser.isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/admin')}
            >
              Admin Panel
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      );
    }

    // User is authenticated but doesn't have app access - still show Sign Out
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleSignOut}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    );
  }

  // User is not authenticated - show Sign In
  const handleLoginClick = () => {
    // Build current URL for post-login redirect
    const currentPath = pathname || '/';
    const search = searchParams?.toString();
    const callbackUrl = search ? `${currentPath}?${search}` : currentPath;

    // Navigate to login with callback URL
    const loginUrl = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    router.push(loginUrl);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleLoginClick}
    >
      <LogIn className="h-4 w-4 mr-2" />
      Sign In
    </Button>
  );
}

export function AuthButton() {
  return (
    <Suspense fallback={null}>
      <AuthButtonInner />
    </Suspense>
  );
}
