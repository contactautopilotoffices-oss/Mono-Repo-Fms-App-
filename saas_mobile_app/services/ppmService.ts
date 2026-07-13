// @ts-nocheck
/**
 * ppmService — Planned Preventive Maintenance
 * Routes through server/src/routes/ppm.ts (dedicated endpoints).
 * Uses same ppm_schedules, amc_contracts, maintenance_vendors tables as web app.
 */

import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types — mirror DB columns exactly
// ---------------------------------------------------------------------------

export interface MaintenanceVendor {
  id: string;
  company_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  specialization?: string[] | null;
  is_active?: boolean;
}

export interface PPMSchedule {
  id: string;
  organization_id?: string | null;
  property_id?: string | null;
  si_no?: string | null;
  system_name: string;
  detail_name?: string | null;
  scope_of_work?: string | null;
  frequency: string;
  location?: string | null;
  maker?: string | null;
  checker?: string | null;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  vendor_contact_person?: string | null;
  vendor_id?: string | null;
  planned_date: string;
  done_date?: string | null;
  remark?: string | null;
  status: 'pending' | 'done' | 'postponed' | 'skipped';
  verification_status?: 'pending' | 'submitted' | 'verified' | 'rejected' | null;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  completion_photos?: string[] | null;
  completion_doc_url?: string | null;
  invoice_url?: string | null;
  attachments?: {
    certificate?: string;
    invoice?: string;
    photos?: string[];
    completed_by?: string;
    completed_by_name?: string;
    completed_at?: string;
  } | null;
  completed_by?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  maintenance_vendors?: MaintenanceVendor | null;
}

export interface AMCContract {
  id: string;
  organization_id: string;
  property_id: string | null;
  system_name: string;
  vendor_name: string;
  vendor_contact?: string | null;
  contract_start_date: string;
  contract_end_date: string;
  contract_value?: number | null;
  payment_terms?: string | null;
  scope_of_work?: string | null;
  notes?: string | null;
  status: 'active' | 'expired' | 'expiring_soon' | 'renewed';
  created_at?: string;
}

export interface PPMStats {
  total: number;
  done: number;
  pending: number;
  postponed: number;
  skipped: number;
  overdue: number;
}

export interface PPMUpdatePayload {
  id: string;
  status?: 'pending' | 'done' | 'postponed' | 'skipped';
  done_date?: string | null;
  remark?: string | null;
  verification_status?: string;
  completed_by?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  vendor_contact_person?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999;
  const target = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function computeAMCStatus(endDate: string): AMCContract['status'] {
  const days = daysUntil(endDate);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_soon';
  return 'active';
}

// ---------------------------------------------------------------------------
// PPM Service
// ---------------------------------------------------------------------------

export const ppmService = {
  // ── Fetch Schedules ───────────────────────────────────────────────────────
  // Supports both old call pattern: fetchSchedules(propertyId, orgId)
  // and new pattern: fetchSchedules(propertyId, { organizationId, status, ... })
  async fetchSchedules(
    propertyId: string,
    orgIdOrOptions?: string | null | {
      organizationId?: string | null;
      status?: string;
      frequency?: string;
      limit?: number;
      offset?: number;
    },
    _deprecatedLimit?: number
  ): Promise<ApiResponse<PPMSchedule[]>> {
    const options = typeof orgIdOrOptions === 'string' || orgIdOrOptions === null
      ? { organizationId: orgIdOrOptions }
      : orgIdOrOptions ?? {};
    try {
      const result = await serverApi.get<{ schedules: PPMSchedule[] }>('/api/ppm', {
        propertyId,
        organizationId: options?.organizationId,
        status: options?.status,
        frequency: options?.frequency,
        limit: options?.limit ?? 200,
        offset: options?.offset ?? 0,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data?.schedules ?? [], status: 200 };
    } catch (err: any) {
      console.error('[PPM] fetchSchedules:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Fetch Stats ────────────────────────────────────────────────────────────
  async fetchStats(propertyId: string, organizationId?: string): Promise<ApiResponse<PPMStats>> {
    try {
      const result = await serverApi.get<{ stats: PPMStats }>('/api/ppm/stats', {
        propertyId,
        organizationId,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data?.stats!, status: 200 };
    } catch (err: any) {
      console.error('[PPM] fetchStats:', err);
      return { success: false, data: { total: 0, done: 0, pending: 0, postponed: 0, skipped: 0, overdue: 0 }, error: err.message, status: 500 };
    }
  },

  // ── Fetch AMC Contracts ─────────────────────────────────────────────────────
  async fetchContracts(propertyId: string, organizationId?: string): Promise<ApiResponse<AMCContract[]>> {
    try {
      const result = await serverApi.get<{ contracts: any[] }>('/api/ppm/contracts', {
        propertyId,
        organizationId,
      });

      if (result.error) throw new Error(result.error.message);
      const contracts: AMCContract[] = (result.data?.contracts ?? []).map((c) => ({
        ...c,
        status: computeAMCStatus(c.contract_end_date ?? c.end_date),
      }));
      return { success: true, data: contracts, status: 200 };
    } catch (err: any) {
      console.error('[PPM] fetchContracts:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Search Assets / Schedules ───────────────────────────────────────────────
  async lookupAsset(propertyId: string, searchTerm: string): Promise<ApiResponse<PPMSchedule[]>> {
    try {
      const result = await serverApi.get<{ schedules: PPMSchedule[] }>('/api/ppm/search', {
        propertyId,
        q: searchTerm,
        limit: 20,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data?.schedules ?? [], status: 200 };
    } catch (err: any) {
      console.error('[PPM] lookupAsset:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Fetch Maintenance Vendors ───────────────────────────────────────────────
  async fetchVendors(organizationId?: string | null): Promise<ApiResponse<MaintenanceVendor[]>> {
    try {
      const filters: any[] = [{ op: 'eq', column: 'is_active', value: true }];
      if (organizationId) {
        filters.push({ op: 'eq', column: 'organization_id', value: organizationId });
      }
      const { data, error } = await serverApi.query({
        table: 'maintenance_vendors',
        action: 'select',
        select: 'id, company_name, contact_person, phone, email, specialization, is_active',
        filters,
      });
      if (error) throw new Error(error.message);
      return { success: true, data: (data as MaintenanceVendor[]) ?? [], status: 200 };
    } catch (err: any) {
      console.error('[PPM] fetchVendors:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Create Schedule ────────────────────────────────────────────────────────
  async createSchedule(payload: {
    organization_id?: string | null;
    property_id?: string | null;
    system_name: string;
    detail_name?: string | null;
    scope_of_work?: string | null;
    frequency?: string;
    location?: string | null;
    vendor_name?: string | null;
    vendor_phone?: string | null;
    vendor_contact_person?: string | null;
    planned_date: string;
    status?: string;
    remark?: string | null;
  }): Promise<ApiResponse<PPMSchedule>> {
    try {
      const result = await serverApi.post<PPMSchedule>('/api/ppm', {
        organization_id: payload.organization_id ?? null,
        property_id: payload.property_id ?? null,
        system_name: payload.system_name.trim(),
        detail_name: payload.detail_name?.trim() || null,
        scope_of_work: payload.scope_of_work?.trim() || null,
        frequency: payload.frequency || 'monthly',
        location: payload.location?.trim() || null,
        vendor_name: payload.vendor_name?.trim() || null,
        vendor_phone: payload.vendor_phone?.trim() || null,
        vendor_contact_person: payload.vendor_contact_person?.trim() || null,
        planned_date: payload.planned_date,
        status: payload.status || 'pending',
        remark: payload.remark || null,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data!, status: 201 };
    } catch (err: any) {
      console.error('[PPM] createSchedule:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Update Schedule ─────────────────────────────────────────────────────────
  async updateSchedule(payload: PPMUpdatePayload): Promise<ApiResponse<PPMSchedule>> {
    try {
      const body: Record<string, unknown> = {};
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.done_date !== undefined) body.done_date = payload.done_date;
      if (payload.remark !== undefined) body.remark = payload.remark;
      if (payload.verification_status !== undefined) body.verification_status = payload.verification_status;
      if (payload.completed_by !== undefined) body.completed_by = payload.completed_by;
      if (payload.vendor_id !== undefined) body.vendor_id = payload.vendor_id;
      if (payload.vendor_name !== undefined) body.vendor_name = payload.vendor_name;
      if (payload.vendor_phone !== undefined) body.vendor_phone = payload.vendor_phone;
      if (payload.vendor_contact_person !== undefined) body.vendor_contact_person = payload.vendor_contact_person;

      const result = await serverApi.patch<PPMSchedule>(`/api/ppm/${payload.id}`, body);

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: result.data!, status: 200 };
    } catch (err: any) {
      console.error('[PPM] updateSchedule:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Upload Attachment ─────────────────────────────────────────────────────
  async uploadAttachment(
    scheduleId: string,
    uri: string,
    type: 'photo' | 'certificate' | 'invoice'
  ): Promise<ApiResponse<string>> {
    try {
      const attachType = type === 'certificate' ? 'doc' : type;
      const ext = uri.split('.').pop() || 'jpg';
      const mimeType = ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const filename = `${scheduleId}/${attachType}_${Date.now()}.${ext}`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await serverApi.uploadFile('ppm-attachments', filename, arrayBuffer, mimeType);
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = await serverApi.getPublicUrl('ppm-attachments', filename);
      const publicUrl = urlData?.publicUrl ?? '';
      if (!publicUrl) throw new Error('Failed to get public URL');

      // Record the URL via server endpoint
      const result = await serverApi.post(`/api/ppm/${scheduleId}/attachments`, {
        url: publicUrl,
        attach_type: attachType,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: publicUrl, status: 201 };
    } catch (err: any) {
      console.error('[PPM] uploadAttachment:', err);
      return { success: false, data: '', error: err.message, status: 500 };
    }
  },

  // ── Delete Attachment ──────────────────────────────────────────────────────
  async deleteAttachment(
    scheduleId: string,
    url: string,
    type: 'photo' | 'certificate' | 'invoice'
  ): Promise<ApiResponse<boolean>> {
    try {
      const attachType = type === 'certificate' ? 'doc' : type;
      const result = await serverApi.delete(`/api/ppm/${scheduleId}/attachments`, {
        url,
        attach_type: attachType,
      });

      if (result.error) throw new Error(result.error.message);
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      console.error('[PPM] deleteAttachment:', err);
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },
};
