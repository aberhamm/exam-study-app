/**
 * Simple in-process guard for LLM usage.
 *
 * What it does:
 * - Per-admin concurrency cap (avoid parallel bursts from one user)
 * - Per-admin sliding-window rate cap (avoid short-lived spikes)
 *
 * What it does NOT do:
 * - Cross-instance coordination (use Redis/etc. for that if needed)
 * - Persistent quotas or analytics
 */
type WindowRecord = {
  count: number;
  windowStart: number;
};

// Active concurrent request counters per user
const concurrentMap = new Map<string, number>();
// Sliding window counters per user
const windowMap = new Map<string, WindowRecord>();

// Tunables (per process)
const MAX_CONCURRENT = 2; // per user per process
const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 10; // per minute per user

/**
 * Acquire a slot for a given user; throws if limits exceeded.
 * Always call release() in a finally block.
 */
export function acquireLlmSlot(userId: string): { release: () => void } {
  // Concurrency check
  const current = concurrentMap.get(userId) || 0;
  if (current >= MAX_CONCURRENT) {
    throw new Error('Too many concurrent LLM requests. Please wait a moment and try again.');
  }
  concurrentMap.set(userId, current + 1);

  // Sliding window check
  const now = Date.now();
  const rec = windowMap.get(userId);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    windowMap.set(userId, { count: 1, windowStart: now });
  } else {
    if (rec.count >= MAX_REQUESTS_PER_WINDOW) {
      // Release concurrency before throwing
      const curr = concurrentMap.get(userId) || 1;
      concurrentMap.set(userId, Math.max(0, curr - 1));
      throw new Error('Rate limit exceeded for LLM usage. Please slow down.');
    }
    rec.count += 1;
  }

  // Return release handle
  return {
    release: () => {
      const curr = concurrentMap.get(userId) || 1;
      concurrentMap.set(userId, Math.max(0, curr - 1));
    },
  };
}

export function getAdminSlotStatus(userId: string): { used: number; limit: number; windowMs: number; windowCount: number; remainingRequests: number } {
  const used = concurrentMap.get(userId) || 0;
  const limit = MAX_CONCURRENT;
  const rec = windowMap.get(userId);
  const windowCount = rec?.count ?? 0;
  const remainingRequests = Math.max(0, MAX_REQUESTS_PER_WINDOW - windowCount);
  return { used, limit, windowMs: WINDOW_MS, windowCount, remainingRequests };
}
