/**
 * POST /api/push-tokens/register
 * Register a push token for a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, token, propertyId, organizationId, deviceInfo } = body;

    if (!userId || !token) {
      return NextResponse.json({ error: 'userId and token are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Upsert the push token
    const { data, error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          property_id: propertyId || null,
          device_info: deviceInfo || null,
          browser: 'fcm-mobile',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      )
      .select()
      .single();

    if (error) {
      console.error('[PushTokens] Register error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[PushTokens] Token registered:', { userId, token: token.substring(0, 20) + '...' });

    return NextResponse.json({
      success: true,
      pushToken: data,
    });

  } catch (err: any) {
    console.error('[PushTokens] Register exception:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}