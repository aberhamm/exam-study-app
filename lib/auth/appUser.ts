import { APP_ID, ACCESS_TIERS, USER_ROLES } from '@/lib/constants';
import type { User } from '@supabase/supabase-js';
import type { AppUser } from '@/types/auth';

export function toAppUser(user: User | null): AppUser | null {
  if (!user) {
    return null;
  }

  const appData = user.app_metadata?.apps?.[APP_ID];
  const hasAccess = appData?.enabled === true;
  const role = appData?.role || USER_ROLES.USER;
  const tier = appData?.tier || ACCESS_TIERS.FREE;
  const permissions = Array.isArray(appData?.permissions) ? appData.permissions : [];
  const isAdmin = user.app_metadata?.claims_admin === true || role === USER_ROLES.ADMIN;

  return {
    id: user.id,
    email: user.email || '',
    role,
    tier,
    hasAccess,
    isAdmin,
    permissions,
  };
}

export function isAppUserAdmin(appUser: AppUser | null): boolean {
  return appUser?.isAdmin === true;
}

export function isSupabaseUserAdmin(user: User | null): boolean {
  return isAppUserAdmin(toAppUser(user));
}
