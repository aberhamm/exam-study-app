import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (process.env.NODE_ENV === 'development') {
      console.error('createClient: Missing Supabase environment variables');
      console.error('URL:', url);
      console.error('Key:', key ? 'SET' : 'NOT SET');
    }
    throw new Error('Missing Supabase environment variables');
  }

  return createBrowserClient(url, key, {
    auth: {
      autoRefreshToken: true,   // Enable auto-refresh before token expires
      persistSession: true,      // Store session in cookies/storage
      detectSessionInUrl: true,  // Detect session from OAuth/magic link URLs
    },
  });
}
