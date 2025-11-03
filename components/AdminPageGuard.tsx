import { requireAdmin } from '@/lib/auth-supabase';
import { redirect } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

/**
 * Server component that verifies admin authentication before rendering children.
 * Provides defense-in-depth security for admin pages.
 */
export async function AdminPageGuard({ children }: Props) {
  try {
    await requireAdmin();
    return <>{children}</>;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('Unauthorized')) {
      redirect('/login');
    } else if (errorMessage.includes('Forbidden')) {
      redirect('/access-denied');
    } else {
      redirect('/login');
    }
    return null;
  }
}
