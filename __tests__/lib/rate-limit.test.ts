import {
  isRateLimited,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  clearRateLimit,
  getRateLimitStatus,
} from '@/lib/rate-limit'

describe('rate-limit', () => {
  const user = 'test-user'
  const now = Date.now()
  let nowSpy: jest.SpyInstance<number, []>

  beforeEach(() => {
    // Reset time
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
    // Ensure clean state
    clearRateLimit(user)
  })

  afterEach(() => {
    nowSpy.mockRestore()
    clearRateLimit(user)
  })

  it('allows initial attempts and reports remaining', () => {
    let status = isRateLimited(user)
    expect(status.limited).toBe(false)
    expect(status.remainingAttempts).toBeGreaterThan(0)

    recordFailedAttempt(user)
    status = isRateLimited(user)
    expect(status.limited).toBe(false)
    expect(status.remainingAttempts).toBeGreaterThan(0)
  })

  it('locks out after maximum attempts', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(user)
    const status = isRateLimited(user)
    expect(status.limited).toBe(true)
    expect(status.lockedUntil).toBeInstanceOf(Date)
  })

  it('clears on successful attempt', () => {
    for (let i = 0; i < 3; i++) recordFailedAttempt(user)
    recordSuccessfulAttempt(user)
    const status = isRateLimited(user)
    expect(status.limited).toBe(false)
    expect(status.remainingAttempts).toBeGreaterThan(0)
  })

  it('resets window after time passes', () => {
    recordFailedAttempt(user)
    expect(getRateLimitStatus(user)).not.toBeNull()

    // Advance time beyond 15 minutes window
    nowSpy.mockReturnValue(now + (15 * 60 * 1000) + 1)
    const status = isRateLimited(user)
    expect(status.limited).toBe(false)
    expect(status.remainingAttempts).toBeGreaterThan(0)
  })
})

