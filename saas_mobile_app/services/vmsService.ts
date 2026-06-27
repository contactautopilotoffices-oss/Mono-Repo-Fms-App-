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
      const result = await serverApi.get<{ visitors: VisitorLog[]; stats: VisitorStats; data?: { visitors: VisitorLog[]; stats: VisitorStats } }>(
        '/api/visitors',
        {
          propertyId: propertyId,
          date: options?.dateFilter === 'custom' ? options?.customDate : (options?.dateFilter ?? 'today'),
          status: options?.status ?? 'all',
          search: options?.search,
        }
      );

      if (result.error) throw new Error(result.error.message);
      // Handle nested data structure from server
      const data = result.data?.data ?? result.data;
      return { success: true, data, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  async fetchStats(propertyId: string): Promise<ApiResponse<VisitorStats>> {
    try {
      const result = await serverApi.get<any>('/api/visitors', {
        propertyId: propertyId,
        date: 'today',
      });

      if (result.error) throw new Error(result.error.message);
      // Handle nested data structure
      const statsData = result.data?.stats ?? result.data?.data?.stats;
      return { success: true, data: statsData as VisitorStats, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Check In ────────────────────────────────────────────────────────────────
  // POST /api/vms/check-in — generates visitor_id server-side
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
  // PATCH /api/vms/check-out
  async checkOut(visitorId: string, propertyId: string): Promise<ApiResponse<VisitorLog>> {
    try {
      const result = await serverApi.patch<VisitorLog>(`/api/visitors/${visitorId}/checkout?propertyId=${propertyId}`, {});

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
    propertyId?: string
  ): Promise<ApiResponse<string>> {
    try {
      // Import media processor dynamically to avoid blocking app startup
      const { compressImageForUpload } = require('@/utils/mediaProcessor');

      // Compress image before upload
      const compressedUri = await compressImageForUpload(uri);
      if (!compressedUri) {
        throw new Error('Failed to compress image');
      }

      // Read compressed file and convert to base64
      const response = await fetch(compressedUri);
      const blob = await response.blob();
      const reader = new FileReader();

      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix if present
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Check file size
      const fileSizeKB = (base64Data.length * 3) / 4 / 1024;
      console.log(`[uploadPhoto] File size: ${fileSizeKB.toFixed(1)} KB`);

      if (fileSizeKB > 5000) {
        throw new Error('Image still too large after compression');
      }

      // Use /api/visitors/photos endpoint with base64
      const res = await serverApi.post<{ url?: string; success?: boolean }>(`/api/visitors/photos?propertyId=${propertyId}`, {
        visitor_id: visitorId,
        fileBase64: base64Data,
        contentType: 'image/jpeg',
      });

      if (res.error) throw new Error(typeof res.error === 'string' ? res.error : JSON.stringify(res.error));

      return { success: true, data: res.data?.url ?? '', status: 201 };
    } catch (err: any) {
      console.error('[uploadPhoto] Error:', err);
      return { success: false, data: '', error: err.message, status: 500 };
    }
  },

  // ── Update Visitor Photo URL ─────────────────────────────────────────────────
  async updateVisitorPhoto(
    visitorId: string,
    propertyId: string,
    photoUrl: string
  ): Promise<ApiResponse<VisitorLog>> {
    try {
      const result = await serverApi.patch<VisitorLog>(
        `/api/visitors/${visitorId}/photo?propertyId=${propertyId}`,
        { photo_url: photoUrl }
      );

      if (result.error) throw new Error(result.error.message);

      return { success: true, data: result.data!, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
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
