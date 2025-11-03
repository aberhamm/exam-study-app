'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export interface UseSessionReturn {
  session: Session | null;
  user: User | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
}

/**
 * React hook for session state with auto-refresh
 * Follows the pattern from Session Management Guide
 */
export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.refreshSession();
    setSession(session);
    setUser(session?.user ?? null);
  };

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // Safety timeout: ensure loading is set to false even if getSession hangs
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 500);

    const startTime = Date.now();

    // Get initial session with error handling
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        clearTimeout(safetyTimeout);

        if (!mounted) {
          return;
        }

        if (error) {
          console.error('❌ useSession: Error getting session:', error);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((error) => {
        const elapsed = Date.now() - startTime;
        clearTimeout(safetyTimeout);
        console.error(`❌ useSession: getSession() error after ${elapsed}ms:`, error);

        if (!mounted) return;
        setLoading(false);
      });

    // Listen for auth state changes
    // This fires immediately with the current session state, which can help if getSession hangs
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      // If we get an auth state change, clear the safety timeout
      clearTimeout(safetyTimeout);

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array - only run once on mount

  return { session, user, loading, refreshSession };
}

/**
 * Force refresh session after claim updates
 * Call this after admin updates user claims in the dashboard
 */
export async function refreshSessionAfterClaimUpdate(): Promise<void> {
  const supabase = createClient();

  const { data: { session }, error } = await supabase.auth.refreshSession();

  if (error) {
    console.error('Error refreshing session:', error);
    throw error;
  }

  if (session?.user) {
    return;
  }

  throw new Error('No session after refresh');
}

/**
 * Check if session is about to expire (within 5 minutes)
 */
export function isSessionExpiringSoon(session: Session | null): boolean {
  if (!session?.expires_at) return false;

  const now = Date.now();
  const expiresAt = session.expires_at * 1000;
  const timeUntilExpiry = expiresAt - now;

  return timeUntilExpiry < 5 * 60 * 1000;
}

/**
 * Get time remaining until session expiration (in milliseconds)
 */
export function getTimeUntilExpiry(session: Session | null): number {
  if (!session?.expires_at) return 0;

  const now = Date.now();
  const expiresAt = session.expires_at * 1000;

  return Math.max(0, expiresAt - now);
}
