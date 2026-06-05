/**
 * WhatsApp API Routes
 *
 * Endpoints for sending WhatsApp notifications via WasenderAPI
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://wasenderapi.com/api';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const WHATSAPP_SENDER_ID = process.env.WHATSAPP_SENDER_ID;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return '91' + digits;
  }
  return digits;
}

async function sendToPhone(phone: string, message: string, supabase: any): Promise<{ success: boolean; error?: string }> {
  if (!WHATSAPP_API_KEY || !WHATSAPP_SENDER_ID) {
    return { success: false, error: 'WhatsApp API not configured' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
      },
      body: JSON.stringify({
        number: formatPhone(phone),
        sender: WHATSAPP_SENDER_ID,
        message,
        priority: 10,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[WhatsApp] Send failed:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('[WhatsApp] Error:', err);
    return { success: false, error: String(err) };
  }
}

async function getUserPhone(userId: string, supabase: any): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('phone, user_metadata')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.user_metadata?.phone || data.phone || null;
}

async function getUsersByRole(propertyId: string, roles: string[], supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from('property_memberships')
    .select('user_id')
    .eq('property_id', propertyId)
    .in('role', roles);

  if (error) {
    console.error('[WhatsApp] Error fetching users by role:', error);
    return [];
  }

  return (data ?? []).map((row: any) => row.user_id);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const whatsappRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // POST /whatsapp/send-to-user
  fastify.post<{ Body: { userId: string; message: string } }>('/send-to-user', async (request, reply) => {
    const { userId, message } = request.body || {};

    if (!userId || !message) {
      return reply.status(400).send({ error: 'userId and message required' });
    }

    const phone = await getUserPhone(userId, supabase);
    if (!phone) {
      return reply.status(404).send({ error: 'User phone not found' });
    }

    const result = await sendToPhone(phone, message, supabase);
    return reply.send(result);
  });

  // POST /whatsapp/send-to-users
  fastify.post<{ Body: { userIds: string[]; message: string } }>('/send-to-users', async (request, reply) => {
    const { userIds, message } = request.body || {};

    if (!userIds || !Array.isArray(userIds) || !message) {
      return reply.status(400).send({ error: 'userIds array and message required' });
    }

    const results = await Promise.all(
      userIds.map(async (userId) => {
        const phone = await getUserPhone(userId, supabase);
        if (!phone) return { userId, success: false };
        const result = await sendToPhone(phone, message, supabase);
        return { userId, ...result };
      })
    );

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return reply.send({ success: true, sent, failed, results });
  });

  // POST /whatsapp/send-to-role
  fastify.post<{ Body: { propertyId: string; roles: string[]; message: string } }>('/send-to-role', async (request, reply) => {
    const { propertyId, roles, message } = request.body || {};

    if (!propertyId || !roles || !Array.isArray(roles) || !message) {
      return reply.status(400).send({ error: 'propertyId, roles array, and message required' });
    }

    const userIds = await getUsersByRole(propertyId, roles, supabase);
    if (userIds.length === 0) {
      return reply.send({ success: true, sent: 0, failed: 0, message: 'No users found for these roles' });
    }

    const results = await Promise.all(
      userIds.map(async (userId) => {
        const phone = await getUserPhone(userId, supabase);
        if (!phone) return { userId, success: false };
        const result = await sendToPhone(phone, message, supabase);
        return { userId, ...result };
      })
    );

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return reply.send({ success: true, sent, failed, results });
  });

  // POST /whatsapp/send
  fastify.post<{ Body: { phone: string; message: string } }>('/send', async (request, reply) => {
    const { phone, message } = request.body || {};

    if (!phone || !message) {
      return reply.status(400).send({ error: 'phone and message required' });
    }

    const result = await sendToPhone(phone, message, supabase);
    return reply.send(result);
  });

  // GET /whatsapp/health
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      enabled: !!(WHATSAPP_API_KEY && WHATSAPP_SENDER_ID),
      configured: !!WHATSAPP_API_URL,
    });
  });
};
