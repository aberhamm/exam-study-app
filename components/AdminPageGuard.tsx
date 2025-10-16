import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

/**
 * Server component that verifies admin authentication before rendering children.
 * Provides defense-in-depth security for admin pages.
 */
export async function AdminPageGuard({ children }: Props) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
    return null;
  }
  if (session.user.role !== 'admin') {
    // Send non-admins to login per test expectations
    redirect('/login');
    return null;
  }
  return <>{children}</>;
}
