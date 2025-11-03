import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { APP_ID, ACCESS_TIERS, USER_ROLES } from '@/lib/constants';
import type { User } from '@supabase/supabase-js';

/**
 * Extended user type with app-specific claims
 */
export interface AppUser {
  id: string;
  email: string;
  role: string;
  tier: string;
  hasAccess: boolean;
  isAdmin: boolean;
  permissions: string[];
}

/**
 * Get the current authenticated user (server-side)
 * Uses getUser() which validates JWT with the server - required for security
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerClient();
  // Server-side always uses getUser() to validate JWT, never getSession()
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current authenticated user (client-side, secure)
 * Uses getUser() which validates JWT with the server
 */
export async function getCurrentUserClient(): Promise<User | null> {
  const supabase = createBrowserClient();
  // Validates JWT with server - use for security checks
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Check if a user has admin access.
 * Admin access is granted if user has:
 * - claims_admin: true (global admin), OR
 * - apps[APP_ID].role === 'admin' (app-specific admin)
 */
export function isUserAdmin(user: User | null): boolean {
  if (!user) return false;
  return (
    user.app_metadata?.claims_admin === true ||
    user.app_metadata?.apps?.[APP_ID]?.role === USER_ROLES.ADMIN
  );
}

/**
 * Helper function to transform user to AppUser
 */
function transformUserToAppUser(user: User): AppUser {
  const appData = user.app_metadata?.apps?.[APP_ID];
  const hasAccess = appData?.enabled === true;
  const role = appData?.role || USER_ROLES.USER;
  const tier = appData?.tier || ACCESS_TIERS.FREE;
  const permissions = appData?.permissions || [];
  const isAdmin = isUserAdmin(user);

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

/**
 * Get the current user with app-specific claims (server-side)
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return transformUserToAppUser(user);
}

/**
 * Get the current user with app-specific claims (client-side)
 */
export async function getCurrentAppUserClient(): Promise<AppUser | null> {
  const user = await getCurrentUserClient();
  if (!user) return null;
  return transformUserToAppUser(user);
}

/**
 * Check if current user is admin
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const appUser = await getCurrentAppUser();
  return appUser?.isAdmin || false;
}

/**
 * Check if current user has access to the app
 */
export async function hasAppAccess(): Promise<boolean> {
  const appUser = await getCurrentAppUser();
  return appUser?.hasAccess || false;
}

/**
 * Check if current user has specific permission
 */
export async function hasPermission(permission: string): Promise<boolean> {
  const appUser = await getCurrentAppUser();
  return appUser?.permissions.includes(permission) || false;
}

/**
 * Check if current user has specific tier or higher
 */
export async function hasTier(requiredTier: string): Promise<boolean> {
  const appUser = await getCurrentAppUser();
  if (!appUser) return false;

  const tierHierarchy = [ACCESS_TIERS.ANONYMOUS, ACCESS_TIERS.FREE, ACCESS_TIERS.PREMIUM];
  const userTierIndex = tierHierarchy.indexOf(appUser.tier as typeof ACCESS_TIERS[keyof typeof ACCESS_TIERS]);
  const requiredTierIndex = tierHierarchy.indexOf(requiredTier as typeof ACCESS_TIERS[keyof typeof ACCESS_TIERS]);

  return userTierIndex >= requiredTierIndex;
}

/**
 * Require admin role (throw error if not admin)
 */
export async function requireAdmin(): Promise<AppUser> {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error('Unauthorized: No user session');
  }

  if (!appUser.hasAccess) {
    throw new Error('Forbidden: No app access');
  }

  if (!appUser.isAdmin) {
    throw new Error('Forbidden: Admin access requires claims_admin or app admin role');
  }

  return appUser;
}

/**
 * Require app access (throw error if no access)
 */
export async function requireAppAccess(): Promise<AppUser> {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error('Unauthorized: No user session');
  }

  if (!appUser.hasAccess) {
    throw new Error('Forbidden: No app access');
  }

  return appUser;
}

/**
 * Require specific tier (throw error if insufficient tier)
 */
export async function requireTier(requiredTier: string): Promise<AppUser> {
  const appUser = await requireAppAccess();

  if (!(await hasTier(requiredTier))) {
    throw new Error(`Forbidden: ${requiredTier} tier required`);
  }

  return appUser;
}

/**
 * Get user's exam access level based on their tier
 */
export async function getExamAccessLevel(): Promise<'anonymous' | 'free' | 'premium'> {
  const appUser = await getCurrentAppUser();

  if (!appUser || !appUser.hasAccess) {
    return 'anonymous';
  }

  return appUser.tier as 'free' | 'premium';
}
