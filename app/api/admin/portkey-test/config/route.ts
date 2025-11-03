import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-supabase';
import { envConfig, extractPortkeyProvider } from '@/lib/env-config';

/**
 * Get current Portkey configuration from environment
 * GET /api/admin/portkey-test/config
 */
export async function GET() {
  try {
    // Require admin access
    await requireAdmin();

    const customHeaders = envConfig.portkey.customHeaders || '';
    const provider =
      envConfig.portkey.provider || extractPortkeyProvider({ headerString: customHeaders }) || '';

    const config = {
      apiKey: envConfig.portkey.apiKey || '',
      baseUrl: envConfig.portkey.baseUrl || 'https://api.portkey.ai/v1',
      customHeaders,
      provider,
      model: envConfig.portkey.model || '@openai/gpt-4o-mini',
      modelChat: envConfig.portkey.modelChat || '',
      modelExplanation: envConfig.portkey.modelExplanation || '',
      modelEmbeddings: envConfig.portkey.modelEmbeddings || '',
    };

    return NextResponse.json({ config });
  } catch (error) {
    console.error('[portkey-test/config] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unauthorized',
      },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
    );
  }
}
