import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../utils/supabase.js';
import {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyTicketResolved,
  notifyTicketClosed,
  notifyTicketCommented,
} from '../services/notificationService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ticket {
  id: string;
  ticket_number?: string;
  property_id: string;
  organization_id: string;
  raised_by: string;
  title: string;
  description: string | null;
  category_id: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  is_internal: boolean;
  photo_before_url: string | null;
  photo_after_url: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  comment: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Schemas (Zod only — no Fastify JSON Schema for body/querystring)
// ---------------------------------------------------------------------------

const TicketQuerySchema = z.object({
  propertyId: z.string().optional(),
  status: z.string().optional(),
  orgId: z.string().optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateTicketSchema = z.object({
  property_id: z.string().min(1),
  organization_id: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category_id: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  is_internal: z.boolean().default(false),
  photo_before_url: z.string().url().optional().nullable(),
  raised_by: z.string().min(1).optional(), // User ID of ticket raiser
});

const AssignTicketSchema = z.object({
  assigned_to: z.string().min(1),
});

const UpdateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'pending', 'resolved', 'closed']),
});

const CreateCommentSchema = z.object({
  comment: z.string().min(1),
  user_id: z.string().min(1).optional(), // Defaults to raised_by if not provided
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function generateTicketNumber(propertyId: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `TKT-${timestamp.slice(-4)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Plugin — wired to Supabase (real data, not in-memory)
// ---------------------------------------------------------------------------

export const ticketRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /tickets
  fastify.get('/tickets', async (request, reply) => {
    try {
      const { propertyId, status, orgId, limit, offset } = TicketQuerySchema.parse(request.query);

      let sbQuery = supabaseAdmin.from('tickets').select('*', { count: 'exact' });

      if (orgId) sbQuery = sbQuery.eq('organization_id', orgId);
      if (propertyId) sbQuery = sbQuery.eq('property_id', propertyId);
      if (status) sbQuery = sbQuery.eq('status', status);

      sbQuery = sbQuery
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      const { data, error, count } = await sbQuery;

      if (error) {
        fastify.log.error(`[TICKETS] Query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return {
        data: (data as Ticket[]) || [],
        total: count || 0,
        limit,
        offset,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // GET /tickets/:id
  fastify.get('/tickets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      fastify.log.error(`[TICKETS] Get by id failed: ${error.message}`);
      reply.status(500);
      return { error: 'query_failed', message: error.message };
    }
    if (!data) {
      reply.status(404);
      return { error: 'not_found', message: `Ticket ${id} not found` };
    }
    return { data: data as Ticket };
  });

  // POST /tickets
  fastify.post('/tickets', async (request, reply) => {
    try {
      const parsed = CreateTicketSchema.parse(request.body);

      // Resolve organization_id from property if not provided
      let orgId = parsed.organization_id;
      if (!orgId) {
        const { data: prop } = await supabaseAdmin
          .from('properties')
          .select('organization_id')
          .eq('id', parsed.property_id)
          .maybeSingle();
        orgId = prop?.organization_id;
      }

      if (!orgId) {
        reply.status(400);
        return {
          error: 'missing_org_id',
          message: 'organization_id is required, or the property does not exist',
        };
      }

      const raisedBy = parsed.raised_by || 'dev_user_id';
      const ticketNumber = generateTicketNumber(parsed.property_id);
      const now = new Date().toISOString();

      const newTicket = {
        property_id: parsed.property_id,
        organization_id: orgId,
        title: parsed.title,
        description: parsed.description ?? null,
        category_id: parsed.category_id ?? null,
        priority: parsed.priority,
        status: 'open' as const,
        is_internal: parsed.is_internal,
        photo_before_url: parsed.photo_before_url ?? null,
        photo_after_url: null,
        assigned_to: null,
        raised_by: raisedBy,
        ticket_number: ticketNumber,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabaseAdmin
        .from('tickets')
        .insert(newTicket)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[TICKETS] Insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      const ticket = data as Ticket;

      // Send WhatsApp notification to ticket raiser
      if (raisedBy !== 'dev_user_id') {
        const notifResult = await notifyTicketCreated({
          ticketId: ticket.id,
          ticketNumber: ticketNumber,
          title: ticket.title,
          raisedByUserId: raisedBy,
          propertyId: ticket.property_id,
          raisedAt: formatDateTime(new Date(ticket.created_at)),
        }).catch(err => {
          fastify.log.error(`[TICKETS] WhatsApp notification failed: ${err.message}`);
          return { success: false, queued: false };
        });

        fastify.log.info(`[TICKETS] Ticket created: ${ticketNumber}, WhatsApp: ${notifResult.queued ? 'queued' : 'skipped'}`);
      }

      reply.status(201);
      return { data: ticket };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // PATCH /tickets/:id/assign
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof AssignTicketSchema> }>(
    '/tickets/:id/assign',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { assigned_to } = AssignTicketSchema.parse(request.body);

        // Get current ticket
        const { data: ticket, error: fetchError } = await supabaseAdmin
          .from('tickets')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (fetchError || !ticket) {
          reply.status(404);
          return { error: 'not_found', message: `Ticket ${id} not found` };
        }

        const oldAssigned = ticket.assigned_to;

        // Update ticket
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('tickets')
          .update({
            assigned_to,
            status: ticket.status === 'open' ? 'in_progress' : ticket.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (updateError) {
          fastify.log.error(`[TICKETS] Assign failed: ${updateError.message}`);
          reply.status(500);
          return { error: 'update_failed', message: updateError.message };
        }

        // Send WhatsApp notification to assigned staff
        const notifResult = await notifyTicketAssigned({
          ticketId: id,
          ticketNumber: (ticket as any).ticket_number || `TKT-${id.slice(0, 8)}`,
          title: ticket.title,
          priority: ticket.priority,
          assignedToUserId: assigned_to,
          raisedByUserId: ticket.raised_by,
          propertyId: ticket.property_id,
        }).catch(err => {
          fastify.log.error(`[TICKETS] WhatsApp assign notification failed: ${err.message}`);
          return { success: false, queued: false };
        });

        fastify.log.info(`[TICKETS] Ticket ${id} assigned to ${assigned_to}, WhatsApp: ${notifResult.queued ? 'queued' : 'skipped'}`);

        return { data: updated as Ticket };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        throw err;
      }
    }
  );

  // PATCH /tickets/:id/status
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof UpdateTicketStatusSchema> }>(
    '/tickets/:id/status',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { status } = UpdateTicketStatusSchema.parse(request.body);

        // Get current ticket
        const { data: ticket, error: fetchError } = await supabaseAdmin
          .from('tickets')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (fetchError || !ticket) {
          reply.status(404);
          return { error: 'not_found', message: `Ticket ${id} not found` };
        }

        const oldStatus = ticket.status;

        // Update ticket
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('tickets')
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (updateError) {
          fastify.log.error(`[TICKETS] Status update failed: ${updateError.message}`);
          reply.status(500);
          return { error: 'update_failed', message: updateError.message };
        }

        // Send WhatsApp notification based on new status
        const ticketNumber = (ticket as any).ticket_number || `TKT-${id.slice(0, 8)}`;

        if (status === 'resolved') {
          const resolvedBy = 'dev_user_id'; // TODO: get from auth context
          await notifyTicketResolved({
            ticketId: id,
            ticketNumber,
            title: ticket.title,
            resolvedByUserId: resolvedBy,
            raisedByUserId: ticket.raised_by,
            propertyId: ticket.property_id,
            resolvedAt: formatDateTime(new Date()),
          }).catch(err => {
            fastify.log.error(`[TICKETS] WhatsApp resolved notification failed: ${err.message}`);
          });
        } else if (status === 'closed') {
          await notifyTicketClosed({
            ticketId: id,
            ticketNumber,
            title: ticket.title,
            raisedByUserId: ticket.raised_by,
            propertyId: ticket.property_id,
          }).catch(err => {
            fastify.log.error(`[TICKETS] WhatsApp closed notification failed: ${err.message}`);
          });
        }

        fastify.log.info(`[TICKETS] Ticket ${id} status: ${oldStatus} -> ${status}`);

        return { data: updated as Ticket };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        throw err;
      }
    }
  );

  // POST /tickets/:id/comments
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof CreateCommentSchema> }>(
    '/tickets/:id/comments',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { comment, user_id } = CreateCommentSchema.parse(request.body);

        // Verify ticket exists
        const { data: ticket } = await supabaseAdmin
          .from('tickets')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!ticket) {
          reply.status(404);
          return { error: 'not_found', message: `Ticket ${id} not found` };
        }

        const commentUserId = user_id || ticket.raised_by;

        // Get commenter name
        const { data: commenter } = await supabaseAdmin
          .from('users')
          .select('full_name')
          .eq('id', commentUserId)
          .single();

        const newComment = {
          ticket_id: id,
          user_id: commentUserId,
          comment,
          created_at: new Date().toISOString(),
        };

        const { data, error } = await supabaseAdmin
          .from('ticket_comments')
          .insert(newComment)
          .select()
          .single();

        if (error) {
          fastify.log.error(`[TICKETS] Comment insert failed: ${error.message}`);
          reply.status(500);
          return { error: 'insert_failed', message: error.message };
        }

        // Send WhatsApp notification to ticket participants
        const ticketNumber = (ticket as any).ticket_number || `TKT-${id.slice(0, 8)}`;

        await notifyTicketCommented({
          ticketId: id,
          ticketNumber,
          title: ticket.title,
          commenterName: commenter?.full_name || 'Staff',
          comment,
          raisedByUserId: ticket.raised_by,
          assignedToUserId: ticket.assigned_to,
          propertyId: ticket.property_id,
        }).catch(err => {
          fastify.log.error(`[TICKETS] WhatsApp comment notification failed: ${err.message}`);
        });

        return { data };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        throw err;
      }
    }
  );

  // GET /tickets/:id/comments
  fastify.get<{ Params: { id: string } }>(
    '/tickets/:id/comments',
    async (request, reply) => {
      const { id } = request.params;

      const { data, error } = await supabaseAdmin
        .from('ticket_comments')
        .select('*, users(full_name)')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (error) {
        fastify.log.error(`[TICKETS] Fetch comments failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return { data: data || [] };
    }
  );
};