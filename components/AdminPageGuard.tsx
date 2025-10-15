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

  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/forbidden');

  return <>{children}</>;
}
