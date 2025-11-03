import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AccessDeniedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If not logged in, redirect to login
  if (!user) {
    redirect('/login');
  }

  async function handleLogout() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-red-600">Access Denied</h1>
          <p className="text-lg text-gray-700">
            You don&apos;t have permission to access this application.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            Signed in as: <strong>{user.email}</strong>
          </p>
          <p className="mt-2 text-xs text-gray-500">
            If you believe this is an error, contact your administrator.
          </p>
        </div>

        <form action={handleLogout}>
          <button
            type="submit"
            className="w-full rounded-md bg-gray-600 py-2 text-white hover:bg-gray-700"
          >
            Sign Out
          </button>
        </form>

        <p className="text-xs text-gray-500">
          Need help? Contact your system administrator
        </p>
      </div>
    </div>
  );
}
