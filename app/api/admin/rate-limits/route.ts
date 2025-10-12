import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { clearRateLimit, getRateLimitStatus } from '@/lib/rate-limit';

/**
 * GET /api/admin/rate-limits?username=<username>
 * Check rate limit status for a specific username
 */
export async function GET(request: Request) {
  try {
    // Require admin authentication
    try {
      await requireAdmin();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'username parameter is required' },
        { status: 400 }
      );
    }

    const status = getRateLimitStatus(username);

    return NextResponse.json({
      username,
      rateLimited: status !== null,
      status: status || null,
    });
  } catch (error) {
    console.error('Failed to get rate limit status:', error);
    return NextResponse.json(
      { error: 'Failed to get rate limit status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/rate-limits?username=<username>
 * Clear rate limit for a specific username (admin override)
 */
export async function DELETE(request: Request) {
  try {
    // Require admin authentication
    try {
      await requireAdmin();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'username parameter is required' },
        { status: 400 }
      );
    }

    clearRateLimit(username);

    return NextResponse.json({
      success: true,
      message: `Rate limit cleared for ${username}`,
    });
  } catch (error) {
    console.error('Failed to clear rate limit:', error);
    return NextResponse.json(
      { error: 'Failed to clear rate limit' },
      { status: 500 }
    );
  }
}
