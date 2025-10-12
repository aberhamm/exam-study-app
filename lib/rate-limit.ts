/**
 * Simple in-memory rate limiter for login attempts.
 *
 * For production with multiple instances, consider using:
 * - Redis with upstash-ratelimit
 * - Database-backed rate limiting
 * - Middleware like Vercel Rate Limiting
 *
 * This implementation is suitable for single-instance deployments.
 */

type RateLimitRecord = {
  attempts: number;
  lastAttempt: number;
  lockedUntil?: number;
};

// In-memory store for rate limiting
// Note: This will reset on server restart
const rateLimitStore = new Map<string, RateLimitRecord>();

// Configuration
const MAX_ATTEMPTS = 5; // Maximum attempts before lockout
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window for attempts
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes lockout after max attempts
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Clean up old entries every hour

// Periodic cleanup of old entries
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    // Remove entries that are no longer locked and haven't had attempts recently
    if (
      (!record.lockedUntil || record.lockedUntil < now) &&
      now - record.lastAttempt > WINDOW_MS
    ) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Check if an identifier (username or IP) is rate limited.
 * Returns true if the identifier should be blocked.
 */
export function isRateLimited(identifier: string): {
  limited: boolean;
  remainingAttempts?: number;
  lockedUntil?: Date;
} {
  const record = rateLimitStore.get(identifier);
  const now = Date.now();

  if (!record) {
    return { limited: false, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check if currently locked out
  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      limited: true,
      lockedUntil: new Date(record.lockedUntil),
    };
  }

  // Reset attempts if window has expired
  if (now - record.lastAttempt > WINDOW_MS) {
    rateLimitStore.delete(identifier);
    return { limited: false, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check if attempts exceed maximum
  if (record.attempts >= MAX_ATTEMPTS) {
    // Apply lockout
    const lockedUntil = now + LOCKOUT_MS;
    rateLimitStore.set(identifier, {
      ...record,
      lockedUntil,
    });
    return {
      limited: true,
      lockedUntil: new Date(lockedUntil),
    };
  }

  return {
    limited: false,
    remainingAttempts: MAX_ATTEMPTS - record.attempts,
  };
}

/**
 * Record a failed login attempt for an identifier.
 */
export function recordFailedAttempt(identifier: string): void {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now - record.lastAttempt > WINDOW_MS) {
    // Start new tracking window
    rateLimitStore.set(identifier, {
      attempts: 1,
      lastAttempt: now,
    });
  } else {
    // Increment attempts within window
    rateLimitStore.set(identifier, {
      attempts: record.attempts + 1,
      lastAttempt: now,
      lockedUntil: record.lockedUntil,
    });
  }
}

/**
 * Record a successful login attempt (clears rate limit for identifier).
 */
export function recordSuccessfulAttempt(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Clear rate limit for an identifier (useful for admin override).
 */
export function clearRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Get current rate limit status for an identifier (for debugging).
 */
export function getRateLimitStatus(identifier: string): RateLimitRecord | null {
  return rateLimitStore.get(identifier) || null;
}
