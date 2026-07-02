import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types (aligned with saas_one cafeteria / vendor schema)
// ---------------------------------------------------------------------------

export interface CafeteriaVendor {
  id: string;
  property_id: string;
  organization_id?: string;
  shop_name: string;
  owner_name?: string;
  email?: string;
  phone?: string;
  service_type?: string;
  commission_rate: number;
  monthly_rent?: number;
  status: string;
  contract_start_date?: string;
  contract_end_date?: string;
  created_at?: string;
  user_id?: string | null;
}

export interface CafeteriaRevenue {
  id: string;
  vendor_id: string;
  property_id: string;
  revenue_date: string;
  revenue_amount: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  vendor?: {
    id: string;
    shop_name: string;
    commission_rate: number;
  };
}

export interface CafeteriaSummary {
  property_id: string;
  period: string;
  total_revenue: number;
  total_commission: number;
  active_vendors: number;
}

export interface CafeteriaAnalytics {
  property_id: string;
  date_from: string;
  date_to: string;
  total_revenue: number;
  total_commission: number;
  active_vendors: number;
  trend: { date: string; revenue: number; commission: number }[];
  vendor_breakdown: {
    vendor_id: string;
    vendor_name: string;
    commission_rate: number;
    total_revenue: number;
    total_commission: number;
    entry_count: number;
  }[];
}

export interface CafeteriaRevenuePayload {
  property_id: string;
  vendor_id: string;
  revenue_date: string;
  revenue_amount: number;
}

export interface CafeteriaData {
  vendors: CafeteriaVendor[];
  revenues: CafeteriaRevenue[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const cafeteriaService = {
  // ── Fetch all vendors + revenues for a property ───────────────────────────
  async fetchAll(propertyId: string, month?: string): Promise<ApiResponse<CafeteriaData>> {
    try {
      const [vendorRes, revenueRes] = await Promise.all([
        serverApi.get<any>(`/api/cafeteria/vendors?propertyId=${propertyId}`),
        serverApi.get<any>(`/api/cafeteria/revenue?propertyId=${propertyId}${month ? `&month=${month}` : ''}`),
      ]);
      if (vendorRes.error) throw new Error(vendorRes.error.message || 'Unknown error');
      if (revenueRes.error) throw new Error(revenueRes.error.message || 'Unknown error');
      return {
        success: true,
        data: {
          vendors: vendorRes.data?.vendors ?? [],
          revenues: revenueRes.data?.revenues ?? [],
        },
        status: 200,
      };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Fetch vendors ─────────────────────────────────────────────────────────
  async fetchVendors(propertyId: string): Promise<ApiResponse<CafeteriaVendor[]>> {
    try {
      const res = await serverApi.get<any>(`/api/cafeteria/vendors?propertyId=${propertyId}`);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.vendors || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Fetch revenues ────────────────────────────────────────────────────────
  async fetchRevenues(
    propertyId: string,
    filters?: { vendorId?: string; month?: string; fromDate?: string; toDate?: string; period?: 'today' | 'month' | 'all' }
  ): Promise<ApiResponse<CafeteriaRevenue[]>> {
    try {
      let url = `/api/cafeteria/revenue?propertyId=${propertyId}`;
      if (filters?.vendorId) url += `&vendorId=${filters.vendorId}`;
      if (filters?.month) url += `&month=${filters.month}`;
      if (filters?.fromDate) url += `&fromDate=${filters.fromDate}`;
      if (filters?.toDate) url += `&toDate=${filters.toDate}`;
      if (filters?.period) url += `&period=${filters.period}`;

      const res = await serverApi.get<any>(url);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.revenues || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Submit revenue (upsert by vendor + date) ──────────────────────────────
  async submitRevenue(payload: CafeteriaRevenuePayload): Promise<ApiResponse<CafeteriaRevenue>> {
    try {
      const res = await serverApi.post<any>('/api/cafeteria/revenue', {
        property_id: payload.property_id,
        vendor_id: payload.vendor_id,
        revenue_date: payload.revenue_date,
        revenue_amount: payload.revenue_amount,
      });
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.revenue, status: 201 };
    } catch (err: any) {
      console.error('cafeteriaService.submitRevenue:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete revenue entry ──────────────────────────────────────────────────
  async deleteRevenue(revenueId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.request(`/api/cafeteria/revenue/${revenueId}`, 'DELETE') as any;
      if (res?.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch summary ─────────────────────────────────────────────────────────
  async fetchSummary(propertyId: string, period?: 'today' | 'month' | 'all'): Promise<ApiResponse<CafeteriaSummary>> {
    try {
      let url = `/api/cafeteria/summary?propertyId=${propertyId}`;
      if (period) url += `&period=${period}`;

      const res = await serverApi.get<any>(url);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Fetch analytics ───────────────────────────────────────────────────────
  async fetchAnalytics(propertyId: string, dateFrom?: string, dateTo?: string): Promise<ApiResponse<CafeteriaAnalytics>> {
    try {
      let url = `/api/cafeteria/analytics?propertyId=${propertyId}`;
      if (dateFrom) url += `&dateFrom=${dateFrom}`;
      if (dateTo) url += `&dateTo=${dateTo}`;

      const res = await serverApi.get<any>(url);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Calculate commission ──────────────────────────────────────────────────
  calculateCommission(revenue: number, rate: number): number {
    return Math.round(revenue * (rate / 100) * 100) / 100;
  },
};

export default cafeteriaService;
