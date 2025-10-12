import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

/**
 * Import layout that enforces admin authentication.
 * Provides defense-in-depth security for the /import route.
 */
export default async function ImportLayout({ children }: Props) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    redirect('/login');
  }

  return <>{children}</>;
}
