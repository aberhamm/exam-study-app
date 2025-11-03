/**
 * Application constants and configuration
 */

// ⚠️ CRITICAL: This must match the app_id used in the Supabase Claims Admin Dashboard
export const APP_ID = 'study-util';

// Access tiers for the application
export const ACCESS_TIERS = {
  ANONYMOUS: 'anonymous',
  FREE: 'free',
  PREMIUM: 'premium',
} as const;

// User roles within the app
export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  VIEWER: 'viewer',
} as const;

// App modules/features
export const APP_MODULES = {
  QUIZ: 'quiz',
  ADMIN: 'admin',
  ANALYTICS: 'analytics',
} as const;

export type AccessTier = typeof ACCESS_TIERS[keyof typeof ACCESS_TIERS];
export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
export type AppModule = typeof APP_MODULES[keyof typeof APP_MODULES];
