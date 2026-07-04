import { apiFetch } from '@/utils/api/mobileApi';

export interface VmsCheckInPayload {
  propertyId: string;
  name: string;
  mobile?: string;
  category: string;
  whom_to_meet: string;
  whom_to_meet_uid?: string;
  purpose?: string;
  coming_from?: string;
  photo_url?: string;
}

export interface PpmUpdatePayload {
  id: string;
  propertyId?: string;
  status: 'pending' | 'done' | 'postponed' | 'skipped';
  done_date?: string;
  remark?: string;
}

/**
 * Mobile-Native Secure Services
 * All operations now go through the server API with Bearer token auth.
 */
export const mobileServices = {
  // ─── VMS (Visitors) Operations ─────────────────────────────────────────────

  /**
   * Performs visitor check-in securely using the server API.
   */
  async vmsCheckIn(payload: VmsCheckInPayload) {
    try {
      const response = await apiFetch<{
        success: boolean;
        visitorId: string;
        visitor: any;
        message?: string;
        error?: string;
      }>('/api/visitors', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: payload.propertyId,
          name: payload.name,
          mobile: payload.mobile,
          category: payload.category,
          whom_to_meet: payload.whom_to_meet,
          whom_to_meet_uid: payload.whom_to_meet_uid,
          purpose: payload.purpose,
          coming_from: payload.coming_from,
          photo_url: payload.photo_url,
        }),
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to check in visitor');
      }

      // Trigger notifications via server (background)
      this.triggerVisitorNotifications(response.visitor, payload.propertyId, response.visitor.organization_id).catch(err =>
        console.error('[VMS] Notification dispatch error:', err)
      );

      return {
        success: true,
        visitorId: response.visitorId,
        visitor: response.visitor,
        message: response.message || `Welcome ${payload.name}! Visit logged.`,
      };
    } catch (error: any) {
      console.error('[VMS Service] Check-in error:', error);
      throw error;
    }
  },

  /**
   * Helper to fetch recipients and queue alerts for visitor check-in.
   * This still requires some client-side logic for notification formatting.
   * Note: Full notification dispatch should ideally be handled server-side.
   */
  async triggerVisitorNotifications(visitor: any, propertyId: string, organizationId: string) {
    // Notification dispatch is now handled by the server API.
    // This method is kept for backward compatibility but is a no-op.
    // The server (/api/visitors POST) handles notification creation internally.
    console.log('[VMS] Visitor notifications handled by server API');
  },

  /**
   * Performs visitor checkout securely via server API.
   */
  async vmsCheckOut(visitorId: string, propertyId: string) {
    try {
      const response = await apiFetch<{
        success: boolean;
        message?: string;
        visitor?: any;
        error?: string;
      }>(`/api/visitors/${encodeURIComponent(visitorId)}/checkout?propertyId=${encodeURIComponent(propertyId)}`, {
        method: 'PATCH',
      });

      if (response.error && !response.success) {
        throw new Error(response.error || 'Failed to check out visitor');
      }

      return {
        success: true,
        message: response.message || `Goodbye! Logged out successfully.`,
        visitor: response.visitor,
      };
    } catch (error: any) {
      console.error('[VMS Service] Checkout error:', error);
      throw error;
    }
  },

  /**
   * Computes accurate Visitor statistics for the property via server API.
   */
  async vmsFetchTodayStats(propertyId: string) {
    try {
      const response = await apiFetch<{
        visitors?: any[];
        stats: {
          total_today: number;
          checked_in: number;
          checked_out: number;
        };
        error?: string;
      }>(`/api/visitors?propertyId=${encodeURIComponent(propertyId)}&date=today`);

      if (response.error) {
        throw new Error(response.error);
      }

      return {
        total: response.stats.total_today || 0,
        checked_in: response.stats.checked_in || 0,
        checked_out: response.stats.checked_out || 0,
      };
    } catch (error) {
      console.error('[VMS Service] Fetch stats error:', error);
      return { total: 0, checked_in: 0, checked_out: 0 };
    }
  },

  // ─── PPM (Preventive Maintenance) Operations ────────────────────────────────

  /**
   * Updates a PPM Schedule entry via server API.
   */
  async updatePpmStatus(payload: PpmUpdatePayload, currentUserId: string) {
    try {
      // 1. Fetch existing schedule record via PPM API
      const ppmData = await apiFetch<{
        schedules: any[];
        contracts?: any[];
      }>(`/api/ppm?propertyId=${encodeURIComponent(payload.propertyId || '')}`);

      const existing = ppmData.schedules?.find((s: any) => s.id === payload.id);
      if (!existing) {
        throw new Error('PPM schedule not found');
      }

      // 2. Perform update via server API
      const response = await apiFetch<{
        success: boolean;
        schedule?: any;
        error?: string;
      }>('/api/ppm/status', {
        method: 'PATCH',
        body: JSON.stringify({
          id: payload.id,
          propertyId: existing.property_id,
          status: payload.status,
          done_date: payload.done_date,
          remark: payload.remark,
        }),
      });

      if (!response.success || response.error) {
        throw new Error(response.error || 'Failed to update schedule status');
      }

      // 3. Dispatch status update notifications if status actually changed
      if (existing.status !== payload.status) {
        this.triggerPpmNotifications(response.schedule || existing, existing.status, currentUserId).catch(err =>
          console.error('[PPM] Status alert error:', err)
        );
      }

      return { success: true, schedule: response.schedule };
    } catch (error: any) {
      console.error('[PPM Service] Update status error:', error);
      throw error;
    }
  },

  /**
   * Gathers recipients and queues alerts for PPM updates.
   * Note: Full notification dispatch should be handled server-side.
   */
  async triggerPpmNotifications(schedule: any, previousStatus: string, updatedByUserId: string) {
    // Notification dispatch is now handled by the server API.
    // This method is kept for backward compatibility but is a no-op.
    console.log('[PPM] Status notifications handled by server API');
  },

  // ─── SOP (Checklist) Operations ─────────────────────────────────────────────

  async updateSOPChecklistItem(propertyId: string, completionId: string, completionItemId: string, updates: any) {
    // TODO: sop_completion_items does not exist in saas_one schema
    console.warn('[SOP Service] sop_completion_items table does not exist in saas_one schema');
    return { success: false, data: null };
  },

  async submitSOPChecklist(propertyId: string, completionId: string, isLate: boolean = false) {
    try {
      const response = await apiFetch<{
        success: boolean;
        run?: any;
        error?: string;
      }>(`/api/sop/runs/${encodeURIComponent(completionId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          completed_at: new Date().toISOString(),
          is_late: isLate,
        }),
      });

      if (response.error) throw new Error(response.error);
      return { success: true, data: response.run };
    } catch (error) {
      console.error('[SOP Service] Submit checklist error:', error);
      throw error;
    }
  },
};
