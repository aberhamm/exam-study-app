import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { APP_ID } from '@/lib/constants';
import { requireAdmin } from '@/lib/auth-supabase';

export async function POST(request: Request) {
  try {
    // Verify admin access
    await requireAdmin();

    const { userId, claim, value } = await request.json();

    // Validate input
    if (!userId || !claim || value === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, claim, value' },
        { status: 400 }
      );
    }

    // Create admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Update the claim
    const { error } = await supabase.rpc('set_app_claim', {
      uid: userId,
      app_id: APP_ID,
      claim: claim,
      value: value,
    });

    if (error) {
      console.error('Error updating claim:', error);
      throw new Error(`Failed to update claim: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Claim updated successfully',
      data: {
        userId,
        claim,
        value,
      },
    });
  } catch (error: unknown) {
    console.error('Error in update claim:', error);

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    if (errorMessage.includes('Unauthorized') || errorMessage.includes('Forbidden')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: errorMessage.includes('Unauthorized') ? 401 : 403 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
