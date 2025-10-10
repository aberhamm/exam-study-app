// Legacy feature flag helpers - use envConfig.features instead for new code
// This module is kept for backward compatibility

import { envConfig } from './env-config';

/**
 * @deprecated Use envConfig.features.devFeaturesEnabled instead
 */
export function isDevFeaturesEnabled(): boolean {
  return envConfig.features.devFeaturesEnabled;
}

