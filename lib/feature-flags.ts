// Centralized feature flag helpers
// Enable dev features in non-development environments via env flags.
// Truthy values: 1, true, yes, on (case-insensitive)

function isTruthyEnv(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isDevFeaturesEnabled(): boolean {
  // Primary: explicit server-side flag
  if (isTruthyEnv(process.env.ENABLE_DEV_FEATURES)) return true;
  // Secondary: public/client build-time flag
  if (isTruthyEnv(process.env.NEXT_PUBLIC_ENABLE_DEV_FEATURES)) return true;
  // Fallback: development environment
  return process.env.NODE_ENV === 'development';
}

