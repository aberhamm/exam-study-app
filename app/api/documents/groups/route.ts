import { NextResponse } from 'next/server';
import { envConfig } from '@/lib/env-config';
import { getAvailableDocumentGroups } from '@/lib/server/documents-search';

export async function GET() {
  try {
    // Protected by dev features flag
    if (!envConfig.features.devFeaturesEnabled) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
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
