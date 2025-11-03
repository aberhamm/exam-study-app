'use client';

import { useMemo } from 'react';
import { useSession } from '@/lib/session-utils';
import { toAppUser, isAppUserAdmin } from '@/lib/auth/appUser';
import type { AppUser } from '@/types/auth';
import type { User } from '@supabase/supabase-js';

export type UseAdminAccessResult = {
  user: User | null;
  appUser: AppUser | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useAdminAccess(): UseAdminAccessResult {
  const { user, loading, refreshSession } = useSession();

  const appUser = useMemo(() => toAppUser(user), [user]);
  const isAdmin = useMemo(() => isAppUserAdmin(appUser), [appUser]);

  return {
    user,
    appUser,
    isAdmin,
    loading,
    refresh: refreshSession,
  };
}
