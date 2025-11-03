import { requireAdmin } from '@/lib/auth-supabase';
import { redirect } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

/**
 * Admin layout that enforces authentication at the layout level.
 * Provides defense-in-depth security for all /admin/* routes.
 */
export default async function AdminLayout({ children }: Props) {
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
