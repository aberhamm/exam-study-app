'use client';

import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, Shield } from 'lucide-react';

function AuthButtonInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return null;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4" />
          <span className="font-medium">{session.user.username}</span>
          {session.user.role === 'admin' && (
            <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
              Admin
            </span>
          )}
        </div>
        {session.user.role === 'admin' && (
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
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    );
  }

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
      Admin Login
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
