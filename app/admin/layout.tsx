import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

/**
 * Admin layout that enforces authentication at the layout level.
 * Provides defense-in-depth security for all /admin/* routes.
 */
export default async function AdminLayout({ children }: Props) {
  const session = await auth();

  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/forbidden');

  return <>{children}</>;
}
