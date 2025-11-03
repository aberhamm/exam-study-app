'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

function sanitizeCallbackUrl(value: string | null): string {
  if (!value) {
    return '/dashboard';
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  return value;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const searchParams = useSearchParams();

  const callbackUrl = sanitizeCallbackUrl(searchParams.get('callbackUrl'));

  // Check initial session state on mount
  useEffect(() => {
    async function checkInitialSession() {
      await supabase.auth.getSession();
    }
    checkInitialSession();
  }, [supabase]);

  // Magic link authentication (default)
  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    try {
      setLoading(true);

      const redirectUrl = new URL(`${window.location.origin}/auth/callback`);
      redirectUrl.searchParams.set('next', callbackUrl);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl.toString(),
          shouldCreateUser: false,
        },
      });

      if (error) {
        console.error('❌ Magic link error:', error);
        throw error;
      }

      toast.success('Check your email for the magic link!');
    } catch (error) {
      const err = error as { message?: string };
      const errorMessage = err.message || '';

      if (errorMessage.toLowerCase().includes('user not found')) {
        console.error('❌ User not found:', email);
        toast.error('This email is not registered. Contact an administrator.');
      } else {
        console.error('❌ Magic link error:', errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="text-3xl font-bold">Admin Login</h2>
          <p className="text-gray-600 mt-2">
            Sign in to access the dashboard
          </p>
        </div>

        <form onSubmit={handleMagicLinkLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              disabled={loading}
              required
              autoComplete="email"
              autoFocus
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-md py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending magic link...' : 'Send magic link'}
          </button>
        </form>

        <div className="space-y-1 text-center">
          <p className="text-sm text-gray-600">
            Only existing users with admin access can sign in
          </p>
          <p className="text-xs text-gray-500">
            New users must be created by an administrator
          </p>
        </div>
      </div>
    </div>
  );
}
