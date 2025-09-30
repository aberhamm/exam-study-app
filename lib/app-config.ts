// Application configuration constants
import { isDevFeaturesEnabled } from '@/lib/feature-flags';

export const APP_CONFIG = {
  APP_NAME: 'Study Utility',
  APP_NAME_SHORT: 'Study Utility',
  DEV_FEATURES_ENABLED: isDevFeaturesEnabled(),
} as const;

export type AppConfig = typeof APP_CONFIG;
