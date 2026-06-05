"use strict";
/**
 * WhatsApp API Routes
 *
 * Endpoints for sending WhatsApp notifications via WasenderAPI
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappRoutes = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://wasenderapi.com/api';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const WHATSAPP_SENDER_ID = process.env.WHATSAPP_SENDER_ID;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        return '91' + digits;
    }
    return digits;
}
async function sendToPhone(phone, message, supabase) {
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
    }
    catch (err) {
        console.error('[WhatsApp] Error:', err);
        return { success: false, error: String(err) };
    }
}
async function getUserPhone(userId, supabase) {
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
async function getUsersByRole(propertyId, roles, supabase) {
    const { data, error } = await supabase
        .from('property_memberships')
        .select('user_id')
        .eq('property_id', propertyId)
        .in('role', roles);
    if (error) {
        console.error('[WhatsApp] Error fetching users by role:', error);
        return [];
    }
    return (data ?? []).map((row) => row.user_id);
}
// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------
const whatsappRoutes = async (fastify) => {
    const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // POST /whatsapp/send-to-user
    fastify.post('/send-to-user', async (request, reply) => {
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
    fastify.post('/send-to-users', async (request, reply) => {
        const { userIds, message } = request.body || {};
        if (!userIds || !Array.isArray(userIds) || !message) {
            return reply.status(400).send({ error: 'userIds array and message required' });
        }
        const results = await Promise.all(userIds.map(async (userId) => {
            const phone = await getUserPhone(userId, supabase);
            if (!phone)
                return { userId, success: false };
            const result = await sendToPhone(phone, message, supabase);
            return { userId, ...result };
        }));
        const sent = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        return reply.send({ success: true, sent, failed, results });
    });
    // POST /whatsapp/send-to-role
    fastify.post('/send-to-role', async (request, reply) => {
        const { propertyId, roles, message } = request.body || {};
        if (!propertyId || !roles || !Array.isArray(roles) || !message) {
            return reply.status(400).send({ error: 'propertyId, roles array, and message required' });
        }
        const userIds = await getUsersByRole(propertyId, roles, supabase);
        if (userIds.length === 0) {
            return reply.send({ success: true, sent: 0, failed: 0, message: 'No users found for these roles' });
        }
        const results = await Promise.all(userIds.map(async (userId) => {
            const phone = await getUserPhone(userId, supabase);
            if (!phone)
                return { userId, success: false };
            const result = await sendToPhone(phone, message, supabase);
            return { userId, ...result };
        }));
        const sent = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        return reply.send({ success: true, sent, failed, results });
    });
    // POST /whatsapp/send
    fastify.post('/send', async (request, reply) => {
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
exports.whatsappRoutes = whatsappRoutes;
//# sourceMappingURL=whatsapp.js.map