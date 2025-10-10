// Application configuration constants
import { envConfig } from '@/lib/env-config';

export const APP_CONFIG = {
  APP_NAME: 'Study Utility',
  APP_NAME_SHORT: 'Study Utility',
  DEV_FEATURES_ENABLED: envConfig.features.devFeaturesEnabled,
} as const;

export type AppConfig = typeof APP_CONFIG;
