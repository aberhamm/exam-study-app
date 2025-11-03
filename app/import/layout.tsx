import { requireAdmin } from '@/lib/auth-supabase';
import { redirect } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

/**
 * Import layout that enforces admin authentication.
 * Provides defense-in-depth security for the /import route.
 */
export default async function ImportLayout({ children }: Props) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      redirect('/login');
    } else {
      redirect('/forbidden');
    }
  }

  return <>{children}</>;
}
