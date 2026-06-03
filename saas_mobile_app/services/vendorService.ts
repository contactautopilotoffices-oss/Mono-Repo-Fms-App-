/**
 * Vendor Service - Food Vendor Revenue Management
 *
 * Features:
 * - Fetch vendors for a property
 * - Commission cycle management
 * - Daily revenue tracking
 * - Export functionality
 */

import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Vendor {
  id: string;
  property_id: string;
  organization_id?: string;
  shop_name: string;
  owner_name?: string;
  email?: string;
  phone?: string;
  service_type?: string;
  commission_rate: number;
  contract_start_date?: string;
  contract_end_date?: string;
  status: string;
}

export interface CommissionCycle {
  id: string;
  vendor_id: string;
  cycle_number: number;
  cycle_start: string;
  cycle_end: string;
  commission_rate: number;
  total_revenue: number;
  commission_amount: number;
  commission_due: number;
  status: 'in_progress' | 'payable' | 'paid' | 'overdue';
  paid_at?: string;
  created_at: string;
}

export interface DailyRevenue {
  id: string;
  vendor_id: string;
  property_id: string;
  entry_date: string;
  revenue_amount: number;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface VendorSummary {
  totalVendors: number;
  activeVendors: number;
  totalRevenue: number;
  totalCommission: number;
  pendingPayments: number;
}

// ---------------------------------------------------------------------------
// Vendor Service
// ---------------------------------------------------------------------------

export const vendorService = {
  // ── Fetch all vendors for a property ────────────────────────────────────
  async getVendors(propertyId: string): Promise<ApiResponse<Vendor[]>> {
    try {
      const res = await serverApi.query<Vendor[]>({
        table: 'vendors',
        action: 'select',
        select: '*',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'eq', column: 'status', value: 'active' },
        ],
        orders: [{ column: 'shop_name', ascending: true }],
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data ?? [], status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Fetch single vendor ─────────────────────────────────────────────────
  async getVendor(vendorId: string): Promise<ApiResponse<Vendor>> {
    try {
      const res = await serverApi.query<Vendor[]>({
        table: 'vendors',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: vendorId }],
        limit: 1,
      });

      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length === 0) {
        return { success: false, data: null, error: 'Vendor not found', status: 404 };
      }

      return { success: true, data: res.data[0], status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Create/Register vendor ───────────────────────────────────────────────
  async createVendor(payload: Partial<Vendor>): Promise<ApiResponse<Vendor>> {
    try {
      const res = await serverApi.query<Vendor>({
        table: 'vendors',
        action: 'insert',
        values: {
          ...payload,
          status: 'active',
        },
        select: '*',
        single: true,
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any, status: 201 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Update vendor ───────────────────────────────────────────────────────
  async updateVendor(vendorId: string, payload: Partial<Vendor>): Promise<ApiResponse<Vendor>> {
    try {
      const res = await serverApi.query<Vendor>({
        table: 'vendors',
        action: 'update',
        values: payload,
        filters: [{ op: 'eq', column: 'id', value: vendorId }],
        select: '*',
        single: true,
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Fetch commission cycles ──────────────────────────────────────────────
  async getCommissionCycles(vendorId: string): Promise<ApiResponse<CommissionCycle[]>> {
    try {
      const res = await serverApi.query<CommissionCycle[]>({
        table: 'commission_cycles',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'vendor_id', value: vendorId }],
        orders: [{ column: 'cycle_number', ascending: false }],
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data ?? [], status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Create commission cycle ─────────────────────────────────────────────
  async createCommissionCycle(payload: Partial<CommissionCycle>): Promise<ApiResponse<CommissionCycle>> {
    try {
      // First, close any in_progress cycles for this vendor
      if (payload.vendor_id && payload.cycle_start) {
        await serverApi.query({
          table: 'commission_cycles',
          action: 'update',
          values: {
            status: 'payable',
            cycle_end: payload.cycle_start,
          },
          filters: [
            { op: 'eq', column: 'vendor_id', value: payload.vendor_id },
            { op: 'eq', column: 'status', value: 'in_progress' },
          ],
        });
      }

      const res = await serverApi.query<CommissionCycle>({
        table: 'commission_cycles',
        action: 'insert',
        values: {
          ...payload,
          status: 'in_progress',
        },
        select: '*',
        single: true,
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any, status: 201 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Update cycle (mark as paid) ─────────────────────────────────────────
  async updateCommissionCycle(cycleId: string, payload: Partial<CommissionCycle>): Promise<ApiResponse<CommissionCycle>> {
    try {
      const res = await serverApi.query<CommissionCycle>({
        table: 'commission_cycles',
        action: 'update',
        values: payload,
        filters: [{ op: 'eq', column: 'id', value: cycleId }],
        select: '*',
        single: true,
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Fetch daily revenue entries ─────────────────────────────────────────
  async getDailyRevenue(propertyId: string, vendorId?: string, period?: 'today' | 'month' | 'all'): Promise<ApiResponse<DailyRevenue[]>> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

      const filters: any[] = [{ op: 'eq', column: 'property_id', value: propertyId }];

      if (vendorId) {
        filters.push({ op: 'eq', column: 'vendor_id', value: vendorId });
      }

      if (period === 'today') {
        filters.push({ op: 'eq', column: 'entry_date', value: today });
      } else if (period === 'month') {
        filters.push({ op: 'gte', column: 'entry_date', value: monthStart });
      }

      const res = await serverApi.query<DailyRevenue[]>({
        table: 'vendor_daily_revenue',
        action: 'select',
        select: '*',
        filters,
        orders: [{ column: 'entry_date', ascending: false }],
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data ?? [], status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Add daily revenue entry ─────────────────────────────────────────────
  async addDailyRevenue(payload: {
    property_id: string;
    vendor_id: string;
    entry_date: string;
    revenue_amount: number;
    notes?: string;
  }): Promise<ApiResponse<DailyRevenue>> {
    try {
      // Check if entry exists for this date
      const existing = await serverApi.query<DailyRevenue[]>({
        table: 'vendor_daily_revenue',
        action: 'select',
        filters: [
          { op: 'eq', column: 'vendor_id', value: payload.vendor_id },
          { op: 'eq', column: 'entry_date', value: payload.entry_date },
        ],
        limit: 1,
      });

      if (existing.data && existing.data.length > 0) {
        // Update existing entry
        const res = await serverApi.query<DailyRevenue>({
          table: 'vendor_daily_revenue',
          action: 'update',
          values: { revenue_amount: payload.revenue_amount, notes: payload.notes },
          filters: [{ op: 'eq', column: 'id', value: existing.data[0].id }],
          select: '*',
          single: true,
        });

        if (res.error) throw new Error(res.error.message);
        return { success: true, data: res.data as any, status: 200 };
      }

      // Create new entry
      const res = await serverApi.query<DailyRevenue>({
        table: 'vendor_daily_revenue',
        action: 'insert',
        values: payload,
        select: '*',
        single: true,
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any, status: 201 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Delete daily revenue entry ───────────────────────────────────────────
  async deleteDailyRevenue(entryId: string): Promise<ApiResponse<void>> {
    try {
      const res = await serverApi.query({
        table: 'vendor_daily_revenue',
        action: 'delete',
        filters: [{ op: 'eq', column: 'id', value: entryId }],
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: undefined, status: 200 };
    } catch (err: any) {
      return { success: false, data: undefined, error: err.message, status: 500 };
    }
  },

  // ── Get vendor summary ──────────────────────────────────────────────────
  async getVendorSummary(propertyId: string): Promise<ApiResponse<VendorSummary>> {
    try {
      // Fetch vendors
      const vendorsRes = await serverApi.query<Vendor[]>({
        table: 'vendors',
        action: 'select',
        select: 'id, status, commission_rate',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      });

      const vendors = vendorsRes.data ?? [];
      const activeVendors = vendors.filter(v => v.status === 'active');

      // Fetch pending cycles
      const cyclesRes = await serverApi.query<CommissionCycle[]>({
        table: 'commission_cycles',
        action: 'select',
        select: 'total_revenue, commission_amount, status',
        filters: [
          { op: 'in', column: 'vendor_id', value: activeVendors.map(v => v.id) },
          { op: 'in', column: 'status', value: ['in_progress', 'payable', 'overdue'] },
        ],
      });

      const pendingCycles = cyclesRes.data ?? [];
      const totalCommission = pendingCycles.reduce((sum, c) => sum + (c.commission_amount || 0), 0);

      // Fetch today's revenue
      const today = new Date().toISOString().split('T')[0];
      const revenueRes = await serverApi.query<DailyRevenue[]>({
        table: 'vendor_daily_revenue',
        action: 'select',
        select: 'revenue_amount',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'eq', column: 'entry_date', value: today },
        ],
      });

      const totalRevenue = (revenueRes.data ?? []).reduce((sum, r) => sum + r.revenue_amount, 0);

      return {
        success: true,
        data: {
          totalVendors: vendors.length,
          activeVendors: activeVendors.length,
          totalRevenue,
          totalCommission,
          pendingPayments: pendingCycles.length,
        },
        status: 200,
      };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Calculate commission ────────────────────────────────────────────────
  calculateCommission(revenue: number, rate: number): number {
    return Math.round(revenue * (rate / 100) * 100) / 100;
  },
};

export default vendorService;
