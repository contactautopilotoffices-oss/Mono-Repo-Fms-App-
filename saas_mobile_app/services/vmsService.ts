/**
 * vmsService — Visitor Management System
 * Routes through server/src/routes/vms.ts
 * Mirrors web app VMS API using same visitor_logs table & columns.
 */

import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';
import { whatsappService } from './whatsappService';

// ---------------------------------------------------------------------------
// Types — mirror DB columns exactly
// ---------------------------------------------------------------------------

export type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface VisitorLog {
  id: string;
  visitor_id: string;       // auto-generated human ID e.g. "DLF-00123"
  property_id: string;
  organization_id: string;
  name: string;
  mobile: string | null;
  category: string;          // visitor | vendor | delivery | interview | other
  coming_from: string | null;
  whom_to_meet: string;
  whom_to_meet_uid: string | null;
  purpose: string | null;
  photo_url: string | null;
  checkin_time: string;
  checkout_time: string | null;
  status: 'checked_in' | 'checked_out';
  created_at: string;
}

export interface HostResult {
  id: string;
  name: string;
  full_name?: string;
  email?: string;
  role?: string;
}

export interface VisitorStats {
  total_today: number;
  checked_in: number;
  checked_out: number;
}

// ---------------------------------------------------------------------------
// VMS Service
// ---------------------------------------------------------------------------

export const vmsService = {
  // ── Fetch Visitors ──────────────────────────────────────────────────────────
  async fetchVisitors(
    propertyId: string,
    options?: {
      dateFilter?: DateFilter;
      customDate?: string;
      status?: 'checked_in' | 'checked_out' | 'all';
      search?: string;
    }
  ): Promise<ApiResponse<{ visitors: VisitorLog[]; stats: VisitorStats }>> {
    try {
      const result = await serverApi.get<{ visitors: VisitorLog[]; stats: VisitorStats }>(
        '/api/visitors',
        {
          propertyId: propertyId,
          date: options?.dateFilter ?? 'today',
          custom_date: options?.customDate,
          status: options?.status ?? 'all',
          search: options?.search,
        }
      );

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data!, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  async fetchStats(propertyId: string): Promise<ApiResponse<VisitorStats>> {
    try {
      const result = await serverApi.get<{ stats: VisitorStats }>('/api/visitors', {
        propertyId: propertyId,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data!.stats, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Check In ────────────────────────────────────────────────────────────────
  // POST /api/visitors — generates visitor_id server-side
  async checkIn(payload: {
    propertyId: string;
    name: string;
    mobile?: string;
    category?: string;
    whom_to_meet: string;
    whom_to_meet_uid?: string;
    coming_from?: string;
    purpose?: string;
    photo_url?: string;
  }): Promise<ApiResponse<{ visitor: VisitorLog; visitorId: string; visitor_id: string }>> {
    try {
      const result = await serverApi.post<VisitorLog>('/api/visitors', {
        propertyId: payload.propertyId,
        name: payload.name,
        mobile: payload.mobile,
        category: payload.category ?? 'visitor',
        coming_from: payload.coming_from,
        whom_to_meet: payload.whom_to_meet,
        whom_to_meet_uid: payload.whom_to_meet_uid,
        purpose: payload.purpose,
        photo_url: payload.photo_url,
      });

      if (result.error) throw new Error(result.error.message);

      const visitor = result.data!;

      // Send WhatsApp notification to host
      if (payload.whom_to_meet_uid) {
        whatsappService.notifyHostOnVisitorCheckIn({
          visitorName: payload.name,
          checkInTime: new Date().toLocaleString(),
          purpose: payload.purpose,
          hostUserId: payload.whom_to_meet_uid,
        }).catch(err => console.warn('[VMS] WhatsApp notification failed:', err));
      }

      return {
        success: true,
        data: { visitor, visitorId: visitor.id, visitor_id: visitor.visitor_id },
        status: 201,
      };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Check Out ──────────────────────────────────────────────────────────────
  // PATCH /api/visitors/[visitorId]/checkout
  async checkOut(visitorId: string, propertyId: string): Promise<ApiResponse<VisitorLog>> {
    try {
      const result = await serverApi.patch<VisitorLog>(`/api/visitors/${visitorId}/checkout?propertyId=${propertyId}`);

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data!, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Force Check Out (admin) ─────────────────────────────────────────────────
  async forceCheckout(
    visitorLogId: string,
    propertyId?: string,
    reason?: string
  ): Promise<ApiResponse<VisitorLog>> {
    try {
      const result = await serverApi.post<VisitorLog>(`/api/visitors/force-checkout?propertyId=${propertyId || ''}`, {
        visitor_log_id: visitorLogId,
        reason,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data!, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Search Hosts (property members) ──────────────────────────────────────────
  async searchHosts(propertyId: string, query: string): Promise<ApiResponse<HostResult[]>> {
    try {
      const res = await serverApi.query<any[]>({
        table: 'property_memberships',
        action: 'select',
        select: 'user_id, role, users:user_id(id, full_name, email)',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'eq', column: 'is_active', value: true }
        ],
        limit: 50,
      });

      if (res.error) throw new Error(res.error.message);

      const lq = query.toLowerCase();
      const hosts = (res.data ?? [])
        .map((m: any) => ({
          id: m.user_id,
          name: m.users?.full_name || 'Unknown',
          full_name: m.users?.full_name || 'Unknown',
          email: m.users?.email || '',
          role: m.role || '',
        }))
        .filter((h: any) => h.id && (query.length < 2 || h.name.toLowerCase().includes(lq) || h.email.toLowerCase().includes(lq)))
        .slice(0, 20);

      return { success: true, data: hosts, status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Upload Photo ─────────────────────────────────────────────────────────────
  async uploadPhoto(
    uri: string,
    visitorId: string,
    _propertyId?: string
  ): Promise<ApiResponse<string>> {
    try {
      const fileRes = await fetch(uri);
      const blob = await fileRes.blob();
      const path = `visitor-photos/${visitorId}.jpg`;

      const { error: uploadError } = await serverApi.upload(
        'visitor-photos',
        path,
        blob,
        'image/jpeg'
      );

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = await serverApi.getPublicUrl('visitor-photos', path);
      const publicUrl = urlData?.publicUrl ?? '';

      // Update visitor record with photo URL
      if (publicUrl) {
        await serverApi.post('/api/vms/upload-photo', {
          visitor_id: visitorId,
          photo_url: publicUrl,
        });
      }

      return { success: true, data: publicUrl, status: 201 };
    } catch (err: any) {
      return { success: false, data: '', error: err.message, status: 500 };
    }
  },

  // ── getVisitorLogs (alias for backward compatibility) ────────────────────────
  async getVisitorLogs(
    propertyId: string,
    options?: {
      dateFilter?: DateFilter;
      customDate?: string;
      status?: 'checked_in' | 'checked_out' | 'all';
      search?: string;
    }
  ): Promise<ApiResponse<VisitorLog[]>> {
    const result = await vmsService.fetchVisitors(propertyId, options);
    if (result.success && result.data) {
      return { success: true, data: result.data.visitors, status: 200 };
    }
    return { success: false, data: [], error: result.error ?? 'Failed to fetch visitors', status: 500 };
  },
};
