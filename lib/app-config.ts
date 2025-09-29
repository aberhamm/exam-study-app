// Application configuration constants
export const APP_CONFIG = {
  APP_NAME: 'Study Utility',
  APP_NAME_SHORT: 'Study Utility',
  DEV_FEATURES_ENABLED: process.env.NODE_ENV === 'development',
} as const;

export type AppConfig = typeof APP_CONFIG;
