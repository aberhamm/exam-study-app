import { createClient } from '@/lib/supabase/client';
import { ACCESS_TIERS } from '@/lib/constants';
import type { User } from '@supabase/supabase-js';
import { toAppUser, isAppUserAdmin } from '@/lib/auth/appUser';
import type { AppUser } from '@/types/auth';
export type { AppUser } from '@/types/auth';

/**
 * Get the current user (fast, client-side only)
 * Uses getSession() which reads from local storage - instant, no network call
 * Use for: UI rendering, loading states, non-critical checks
 */
export async function getCurrentUser(): Promise<User | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const supabase = createClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Error getting session:', error);
      return null;
    }

    return session?.user ?? null;
  } catch (error) {
    console.error('getCurrentUser error:', error);
    return null;
  }
}

/**
 * Get the current user (secure, client-side)
 * Uses getUser() which validates JWT with the server - network call required
 * Use for: Access control, protected routes, security-critical decisions
 */
export async function getCurrentUserSecure(): Promise<User | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.error('Error getting user:', error);
      return null;
    }

    return user;
  } catch (error) {
    console.error('getCurrentUserSecure error:', error);
    return null;
  }
}

/**
 * Get the current user with app-specific claims (fast, client-side only)
 * Uses getSession() - instant, for UI rendering
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return null;
    }
    return toAppUser(user);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('getCurrentAppUser: Error:', error);
    }
    return null;
  }
}

/**
 * Get the current user with app-specific claims (secure, client-side)
 * Uses getUser() - validates JWT with server, for security checks
 */
export async function getCurrentAppUserSecure(): Promise<AppUser | null> {
  try {
    const user = await getCurrentUserSecure();
    if (!user) {
      return null;
    }
    return toAppUser(user);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('getCurrentAppUserSecure: Error:', error);
    }
    return null;
  }
}

/**
 * Check if current user is admin (client-side only)
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const appUser = await getCurrentAppUser();
  return isAppUserAdmin(appUser);
}

/**
 * Check if current user has access to the app (client-side only)
 */
export async function hasAppAccess(): Promise<boolean> {
  const appUser = await getCurrentAppUser();
  return appUser?.hasAccess || false;
}

/**
 * Check if current user has specific permission (client-side only)
 */
export async function hasPermission(permission: string): Promise<boolean> {
  const appUser = await getCurrentAppUser();
  return appUser?.permissions.includes(permission) || false;
}

/**
 * Check if current user has specific tier or higher (client-side only)
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
 * Get user's exam access level based on their tier (client-side only)
 */
export async function getExamAccessLevel(): Promise<'anonymous' | 'free' | 'premium'> {
  const appUser = await getCurrentAppUser();

  if (!appUser || !appUser.hasAccess) {
    return 'anonymous';
  }

  return appUser.tier as 'free' | 'premium';
}
