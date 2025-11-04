// Application configuration constants

export const APP_CONFIG = {
  APP_NAME: 'Study Utility',
  APP_NAME_SHORT: 'Study Utility',
  APP_NAME_SUFFIX: 'Study Utility',
} as const;

export type AppConfig = typeof APP_CONFIG;

export function buildExamAppTitle(examTitle?: string): string {
  const suffix = APP_CONFIG.APP_NAME_SUFFIX;
  const rawTitle = examTitle?.trim();
  if (!rawTitle) {
    return suffix;
  }

  const titleLower = rawTitle.toLowerCase();
  const suffixLower = suffix.toLowerCase();
  const alreadyHasSuffix = titleLower.endsWith(suffixLower) || titleLower.includes(`${suffixLower}`);

  return alreadyHasSuffix ? rawTitle : `${rawTitle} ${suffix}`;
}

export function stripExamTitleSuffix(examTitle?: string): string | undefined {
  if (!examTitle) return undefined;
  const suffix = APP_CONFIG.APP_NAME_SUFFIX.trim();
  if (!suffix) return examTitle.trim();

  const raw = examTitle.trim();
  const suffixLower = suffix.toLowerCase();
  const lower = raw.toLowerCase();
  const spacedSuffix = ` ${suffixLower}`;

  if (lower.endsWith(spacedSuffix)) {
    return raw.slice(0, raw.length - (suffix.length + 1)).trimEnd() || undefined;
  }

  if (lower.endsWith(suffixLower)) {
    return raw.slice(0, raw.length - suffix.length).trimEnd() || undefined;
  }

  return raw;
}
