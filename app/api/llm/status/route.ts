import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-supabase';
import { getAdminSlotStatus } from '@/lib/server/llm-guard';

export async function GET() {
  try {
    const user = await requireAdmin();
    const status = getAdminSlotStatus(user.id);
    return NextResponse.json({ ok: true, status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}
