import { NextResponse } from 'next/server';
import { getAvailableDocumentGroups } from '@/lib/server/documents-search';
import { requireAdmin } from '@/lib/auth-supabase';

export async function GET() {
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

    const groups = await getAvailableDocumentGroups();

    return NextResponse.json(
      { groups },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('Failed to fetch document groups', error);
    return NextResponse.json({ error: 'Failed to fetch document groups' }, { status: 500 });
  }
}
