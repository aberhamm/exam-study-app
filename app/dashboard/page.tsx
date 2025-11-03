import { getCurrentAppUser } from '@/lib/auth-supabase';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardPage() {
  const user = await getCurrentAppUser();

  if (!user || !user.hasAccess) {
    redirect('/access-denied');
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Welcome to SCXMCL Study Utility
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h2 className="text-lg font-medium text-blue-900 mb-2">
                Your Account
              </h2>
              <div className="space-y-2 text-sm text-blue-800">
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Role:</strong> {user.role}</p>
                <p><strong>Tier:</strong> {user.tier}</p>
                <p><strong>Permissions:</strong> {user.permissions.join(', ')}</p>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <h2 className="text-lg font-medium text-green-900 mb-2">
                Access Level
              </h2>
              <div className="space-y-2 text-sm text-green-800">
                {user.tier === 'free' && (
                  <p>✅ Access to free exams and basic features</p>
                )}
                {user.tier === 'premium' && (
                  <>
                    <p>✅ Access to all exams including advanced content</p>
                    <p>✅ Enhanced analytics and progress tracking</p>
                    <p>✅ Priority support</p>
                  </>
                )}
                {user.isAdmin && (
                  <p>✅ Administrative access to manage users and content</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Available Features
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/exam"
                className="block p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
              >
                <h3 className="font-medium text-gray-900">Take Exams</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Practice with {user.tier === 'premium' ? 'all available' : 'free'} exams
                </p>
              </Link>

              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="block p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:shadow-md transition-all"
                >
                  <h3 className="font-medium text-gray-900">Admin Panel</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage users, content, and system settings
                  </p>
                </Link>
              )}

              <div className="block p-4 border border-gray-200 rounded-lg opacity-50">
                <h3 className="font-medium text-gray-900">Progress Tracking</h3>
                <p className="text-sm text-gray-600 mt-1">
                  View your exam history and performance (Coming Soon)
                </p>
              </div>
            </div>
          </div>

          {user.tier === 'free' && (
            <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-900">Upgrade to Premium</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Get access to advanced exams, detailed analytics, and priority support.
                Contact your administrator to upgrade your account.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
