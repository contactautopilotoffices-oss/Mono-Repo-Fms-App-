import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../utils/supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VisitorLog {
  id: string;
  visitor_id: string;
  property_id: string;
  organization_id: string;
  name: string;
  mobile: string | null;
  category: string;
  coming_from: string | null;
  whom_to_meet: string;
  whom_to_meet_uid: string | null;
  purpose: string | null;
  photo_url: string | null;
  checkin_time: string;
  checkout_time: string | null;
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CheckInSchema = z.object({
  property_id: z.string().min(1),
  name: z.string().min(1).max(255),
  mobile: z.string().max(20).optional(),
  category: z.enum(['visitor', 'vendor', 'delivery', 'interview', 'other']).default('visitor'),
  coming_from: z.string().max(255).optional(),
  whom_to_meet: z.string().min(1).max(255),
  whom_to_meet_uid: z.string().optional(),
  purpose: z.string().max(255).optional(),
  photo_url: z.string().url().optional(),
});

const CheckOutSchema = z.object({
  visitor_id: z.string().min(1),
  property_id: z.string().min(1).optional(),
});

const ForceCheckoutSchema = z.object({
  visitor_log_id: z.string().min(1),
  property_id: z.string().min(1).optional(),
  reason: z.string().max(255).optional(),
});

const FetchVisitorsSchema = z.object({
  property_id: z.string().min(1),
  date_filter: z.enum(['today', 'yesterday', 'week', 'month', 'custom', 'all_time']).default('today'),
  custom_date: z.string().optional(),
  status: z.enum(['checked_in', 'checked_out', 'all']).default('all'),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const FetchStatsSchema = z.object({
  property_id: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateRange(dateFilter: string, customDate?: string): { from: string; to: string } {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const endOfDay = `${todayStr}T23:59:59.999Z`;

  switch (dateFilter) {
    case 'today':
      return { from: `${todayStr}T00:00:00.000Z`, to: endOfDay };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ys = y.toISOString().split('T')[0];
      return { from: `${ys}T00:00:00.000Z`, to: `${ys}T23:59:59.999Z` };
    }
    case 'week': {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      return { from: w.toISOString(), to: now.toISOString() };
    }
    case 'month': {
      const m = new Date(now);
      m.setMonth(m.getMonth() - 1);
      return { from: m.toISOString(), to: now.toISOString() };
    }
    case 'custom': {
      // customDate format: "YYYY-MM-DD,YYYY-MM-DD" (from,to)
      if (customDate && customDate.includes(',')) {
        const [fromDate, toDate] = customDate.split(',');
        return {
          from: `${fromDate}T00:00:00.000Z`,
          to: `${toDate}T23:59:59.999Z`,
        };
      }
      // Single date fallback
      return {
        from: `${customDate || todayStr}T00:00:00.000Z`,
        to: `${customDate || todayStr}T23:59:59.999Z`,
      };
    }
    case 'all_time':
      // Return a very wide date range for all-time
      return { from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z' };
    default:
      return { from: `${todayStr}T00:00:00.000Z`, to: endOfDay };
  }
}

function wrapError(err: unknown): { message: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === 'string') return { message: err };
  return { message: 'Unknown error' };
}

function requireSupabase(request: any, reply: any): boolean {
  if (!request.supabase) {
    reply.status(401);
    reply.send({ error: 'unauthorized', message: 'Missing Authorization header' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const vmsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/vms/check-in
  fastify.post<{ Body: z.infer<typeof CheckInSchema> }>(
    '/api/vms/check-in',
    async (request, reply) => {
      if (!requireSupabase(request, reply)) return;

      try {
        const body = CheckInSchema.parse(request.body);

        // Resolve organization_id from property
        const { data: prop } = await supabaseAdmin
          .from('properties')
          .select('organization_id')
          .eq('id', body.property_id)
          .maybeSingle();

        if (!prop?.organization_id) {
          reply.status(400);
          return { error: 'invalid_property', message: 'Property not found or has no organization' };
        }

        // Generate sequential visitor_id via RPC
        let generatedVisitorId: string;
        const idResult = await supabaseAdmin.rpc('generate_visitor_id', {
          p_property_id: body.property_id,
        });

        if (idResult.error || !idResult.data) {
          fastify.log.error(`[VMS] generate_visitor_id failed: ${idResult.error?.message}`);
          // Fallback: use UUID prefix
          generatedVisitorId = `VIS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        } else {
          generatedVisitorId = idResult.data;
        }

        const newVisitor: Omit<VisitorLog, 'id' | 'created_at'> = {
          visitor_id: generatedVisitorId,
          property_id: body.property_id,
          organization_id: prop.organization_id,
          name: body.name,
          mobile: body.mobile ?? null,
          category: body.category,
          coming_from: body.coming_from ?? null,
          whom_to_meet: body.whom_to_meet,
          whom_to_meet_uid: body.whom_to_meet_uid ?? null,
          purpose: body.purpose ?? null,
          photo_url: body.photo_url ?? null,
          checkin_time: new Date().toISOString(),
          checkout_time: null,
          status: 'checked_in',
        };

        const { data, error } = await supabaseAdmin
          .from('visitor_logs')
          .insert(newVisitor)
          .select()
          .single();

        if (error) {
          fastify.log.error(`[VMS] Insert failed: ${error.message}`);
          reply.status(500);
          return { error: 'insert_failed', message: error.message };
        }

        return { data, error: null };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        return { data: null, error: wrapError(err) };
      }
    }
  );

  // PATCH /api/vms/check-out
  fastify.patch<{ Body: z.infer<typeof CheckOutSchema> }>(
    '/api/vms/check-out',
    async (request, reply) => {
      if (!requireSupabase(request, reply)) return;

      try {
        const body = CheckOutSchema.parse(request.body);

        // Verify visitor exists and is checked_in
        const { data: existing } = await supabaseAdmin
          .from('visitor_logs')
          .select('id, status')
          .eq('id', body.visitor_id)
          .maybeSingle();

        if (!existing) {
          reply.status(404);
          return { error: 'not_found', message: 'Visitor not found' };
        }

        if (existing.status !== 'checked_in') {
          reply.status(409);
          return { error: 'already_checked_out', message: 'Visitor is already checked out' };
        }

        const { data, error } = await supabaseAdmin
          .from('visitor_logs')
          .update({ status: 'checked_out', checkout_time: new Date().toISOString() })
          .eq('id', body.visitor_id)
          .select()
          .single();

        if (error) {
          fastify.log.error(`[VMS] Check-out failed: ${error.message}`);
          reply.status(500);
          return { error: 'update_failed', message: error.message };
        }

        return { data, error: null };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        return { data: null, error: wrapError(err) };
      }
    }
  );

  // POST /api/vms/force-checkout
  fastify.post<{ Body: z.infer<typeof ForceCheckoutSchema> }>(
    '/api/vms/force-checkout',
    async (request, reply) => {
      if (!requireSupabase(request, reply)) return;

      try {
        const body = ForceCheckoutSchema.parse(request.body);

        const { data, error } = await supabaseAdmin
          .from('visitor_logs')
          .update({ status: 'checked_out', checkout_time: new Date().toISOString() })
          .eq('id', body.visitor_log_id)
          .select()
          .single();

        if (error) {
          fastify.log.error(`[VMS] Force-checkout failed: ${error.message}`);
          reply.status(500);
          return { error: 'update_failed', message: error.message };
        }

        return { data, error: null };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        return { data: null, error: wrapError(err) };
      }
    }
  );

  // GET /api/vms/visitors
  fastify.get<{ Querystring: z.infer<typeof FetchVisitorsSchema> }>(
    '/api/vms/visitors',
    async (request, reply) => {
      if (!requireSupabase(request, reply)) return;

      try {
        const { property_id, date_filter, custom_date, status, search, limit, offset } =
          FetchVisitorsSchema.parse(request.query);

        const { from, to } = getDateRange(date_filter, custom_date);

        let q = supabaseAdmin
          .from('visitor_logs')
          .select('*', { count: 'exact' })
          .eq('property_id', property_id)
          .gte('checkin_time', from)
          .lte('checkin_time', to)
          .order('checkin_time', { ascending: false })
          .range(offset, offset + limit - 1);

        if (status !== 'all') {
          q = q.eq('status', status);
        }

        if (search) {
          q = q.or(
            `name.ilike.%${search}%,mobile.ilike.%${search}%,whom_to_meet.ilike.%${search}%`
          );
        }

        const { data, error, count } = await q;

        if (error) {
          fastify.log.error(`[VMS] Fetch visitors failed: ${error.message}`);
          reply.status(500);
          return { error: 'query_failed', message: error.message };
        }

        // Compute stats from today's window
        const todayStr = new Date().toISOString().split('T')[0];
        const todayQ = supabaseAdmin
          .from('visitor_logs')
          .select('status', { count: 'exact' })
          .eq('property_id', property_id)
          .gte('checkin_time', `${todayStr}T00:00:00.000Z`)
          .lte('checkin_time', `${todayStr}T23:59:59.999Z`);

        const { count: totalToday, data: todayRows } = await todayQ;
        const checkedIn = todayRows?.filter((r) => r.status === 'checked_in').length ?? 0;
        const checkedOut = todayRows?.filter((r) => r.status === 'checked_out').length ?? 0;

        return {
          data: {
            visitors: data ?? [],
            stats: {
              total_today: totalToday ?? 0,
              checked_in: checkedIn,
              checked_out: checkedOut,
            },
          },
          total: count ?? 0,
          limit,
          offset,
          error: null,
        };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        return { data: null, error: wrapError(err) };
      }
    }
  );

  // GET /api/vms/stats
  fastify.get<{ Querystring: z.infer<typeof FetchStatsSchema> }>(
    '/api/vms/stats',
    async (request, reply) => {
      if (!requireSupabase(request, reply)) return;

      try {
        const { property_id } = FetchStatsSchema.parse(request.query);
        const todayStr = new Date().toISOString().split('T')[0];

        const { data, error } = await supabaseAdmin
          .from('visitor_logs')
          .select('status')
          .eq('property_id', property_id)
          .gte('checkin_time', `${todayStr}T00:00:00.000Z`)
          .lte('checkin_time', `${todayStr}T23:59:59.999Z`);

        if (error) {
          fastify.log.error(`[VMS] Fetch stats failed: ${error.message}`);
          reply.status(500);
          return { error: 'query_failed', message: error.message };
        }

        const rows = data ?? [];
        return {
          data: {
            total_today: rows.length,
            checked_in: rows.filter((r) => r.status === 'checked_in').length,
            checked_out: rows.filter((r) => r.status === 'checked_out').length,
          },
          error: null,
        };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        return { data: null, error: wrapError(err) };
      }
    }
  );

  // POST /api/vms/upload-photo
  fastify.post(
    '/api/vms/upload-photo',
    async (request, reply) => {
      if (!requireSupabase(request, reply)) return;

      const schema = z.object({
        visitor_id: z.string().min(1),
        photo_url: z.string().url(),
      });

      try {
        const { visitor_id, photo_url } = schema.parse(request.body);

        const { data, error } = await supabaseAdmin
          .from('visitor_logs')
          .update({ photo_url })
          .eq('id', visitor_id)
          .select()
          .single();

        if (error) {
          fastify.log.error(`[VMS] Photo update failed: ${error.message}`);
          reply.status(500);
          return { error: 'update_failed', message: error.message };
        }

        return { data, error: null };
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400);
          return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
        }
        return { data: null, error: wrapError(err) };
      }
    }
  );

  // POST /api/visitors/photos
  fastify.post('/api/visitors/photos', async (request, reply) => {
    if (!requireSupabase(request, reply)) return;

    try {
      const { propertyId } = request.query as { propertyId?: string };

      if (!propertyId) {
        reply.status(400);
        return { error: 'Missing propertyId query param' };
      }

      // Parse JSON body with base64 file data
      const body = request.body as { visitor_id?: string; fileBase64?: string; contentType?: string };

      if (!body.visitor_id) {
        reply.status(400);
        return { error: 'Missing visitor_id' };
      }
      if (!body.fileBase64) {
        reply.status(400);
        return { error: 'Missing fileBase64' };
      }

      // Decode base64 to buffer
      const fileBuffer = Buffer.from(body.fileBase64, 'base64');
      const visitor_id = body.visitor_id;
      const contentType = body.contentType || 'image/jpeg';

      // Check file size (max 5MB)
      if (fileBuffer.length > 5 * 1024 * 1024) {
        reply.status(400);
        return { error: `File too large. ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB exceeds 5MB limit.` };
      }

      // Upload to Supabase Storage
      const BUCKET_NAME = 'visitor-photos';
      const filePath = `${propertyId}/${visitor_id}.jpg`;

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(filePath, fileBuffer, {
          cacheControl: '3600',
          upsert: true,
          contentType,
        });

      if (uploadError) {
        fastify.log.error(`[visitors/photos] Upload error:`, uploadError);
        reply.status(500);
        return { error: `Upload failed: ${uploadError.message}` };
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(uploadData.path);

      // Update visitor_logs with photo URL
      await supabaseAdmin
        .from('visitor_logs')
        .update({ photo_url: urlData.publicUrl })
        .eq('visitor_id', visitor_id)
        .eq('property_id', propertyId);

      return {
        success: true,
        url: urlData.publicUrl,
        path: uploadData.path,
      };
    } catch (err) {
      fastify.log.error('[visitors/photos] Error:', err);
      reply.status(500);
      return { error: wrapError(err) };
    }
  });
};
