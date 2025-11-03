'use client';

import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAdminAccess } from '@/app/hooks/useAdminAccess';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, Shield } from 'lucide-react';

function AuthButtonInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, appUser, isAdmin, loading } = useAdminAccess();
  const supabase = createClient();

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
            {isAdmin && (
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
          {isAdmin && (
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
    <button
      type="button"
      onClick={handleLoginClick}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <LogIn className="h-3 w-3" />
      Sign in
    </button>
  );
}

export function AuthButton() {
  return (
    <Suspense fallback={null}>
      <AuthButtonInner />
    </Suspense>
  );
}
