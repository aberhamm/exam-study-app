'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCurrentAppUser } from '@/lib/auth-client';
import type { AppUser } from '@/types/auth';

export interface SessionData {
  user: AppUser | null;
}

export interface UseSessionReturn {
  data: SessionData | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}

/**
 * Custom hook that provides session functionality similar to next-auth/react useSession
 * but using Supabase authentication
 */
export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    const supabase = createClient();

    // Get initial session using fast local storage check
    const getInitialSession = async () => {
      try {
        // Use getCurrentAppUser which now uses getSession() for fast check
        const appUser = await getCurrentAppUser();
        if (appUser) {
          setSession({ user: appUser });
          setStatus('authenticated');
        } else {
          setSession({ user: null });
          setStatus('unauthenticated');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error getting initial session:', error);
        }
        setSession({ user: null });
        setStatus('unauthenticated');
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, supabaseSession) => {
        if (supabaseSession?.user) {
          try {
            const appUser = await getCurrentAppUser();
            setSession({ user: appUser });
            setStatus('authenticated');
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error('Error getting app user:', error);
            }
            setSession({ user: null });
            setStatus('unauthenticated');
          }
        } else {
          setSession({ user: null });
          setStatus('unauthenticated');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    data: session,
    status,
  };
}
