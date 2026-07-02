import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types (aligned with saas_one water schema)
// ---------------------------------------------------------------------------

export type WaterSourceType = 'jar' | 'tanker';

export interface WaterSource {
  id: string;
  property_id: string;
  name: string;
  source_type: WaterSourceType;
  capacity_litres?: number | null;
  is_active?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  water_tariffs?: WaterTariff[];
}

export interface WaterTariff {
  id: string;
  source_id: string;
  rate_per_unit: number;
  effective_from: string;
  effective_to?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface WaterReading {
  id: string;
  source_id: string;
  reading_date: string;
  quantity: number;
  tariff_id?: string | null;
  tariff_rate_used?: number | null;
  computed_cost?: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  source?: { name: string; source_type: WaterSourceType };
}

export interface ReadingPayload {
  property_id: string;
  source_id: string;
  reading_date: string;
  quantity: number;
}

export interface WaterAnalyticsData {
  sources: WaterSource[];
  today: WaterReading[];
  month: WaterReading[];
  prevMonth: WaterReading[];
  trend: WaterReading[];
  custom: WaterReading[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toDateStr(value: string | null | undefined): string {
  return value ? value.split('T')[0] : '';
}

export function computeReadingCost(reading: WaterReading, allTariffs: WaterTariff[]): number {
  const quantity = Number(reading.quantity) || 0;
  const computedCost = Number(reading.computed_cost);
  if (computedCost > 0) return computedCost;

  // Fallback to the rate that was stored on the reading itself
  const storedRate = Number(reading.tariff_rate_used);
  if (storedRate > 0 && quantity > 0) return quantity * storedRate;

  const sourceTariffs = allTariffs.filter(t => t.source_id === reading.source_id);
  if (sourceTariffs.length === 0 || quantity === 0) return 0;

  const rDate = toDateStr(reading.reading_date);
  const sorted = [...sourceTariffs].sort((a, b) =>
    toDateStr(a.effective_from) < toDateStr(b.effective_from) ? 1 : -1
  );
  const active = sorted.find(t => toDateStr(t.effective_from) <= rDate) || sorted[0];
  const rate = Number(active?.rate_per_unit) || 0;
  return quantity * rate;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const waterService = {
  // ── Fetch all water sources + readings for a property ─────────────────────
  async fetchAll(propertyId: string, month?: string): Promise<ApiResponse<{ sources: WaterSource[]; readings: WaterReading[] }>> {
    try {
      const [srcRes, readRes] = await Promise.all([
        serverApi.get<any>(`/api/water/sources?propertyId=${propertyId}`),
        serverApi.get<any>(`/api/water/readings?propertyId=${propertyId}${month ? `&month=${month}` : ''}`),
      ]);
      if (srcRes.error) throw new Error(srcRes.error.message || 'Unknown error');
      if (readRes.error) throw new Error(readRes.error.message || 'Unknown error');
      return {
        success: true,
        data: {
          sources: srcRes.data?.sources ?? [],
          readings: readRes.data?.readings ?? [],
        },
        status: 200,
      };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Fetch Sources ─────────────────────────────────────────────────────────
  async fetchSources(propertyId: string): Promise<ApiResponse<WaterSource[]>> {
    try {
      const res = await serverApi.get<any>(`/api/water/sources?propertyId=${propertyId}`);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.sources || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Create Source ─────────────────────────────────────────────────────────
  async createSource(payload: Partial<WaterSource>): Promise<ApiResponse<WaterSource>> {
    try {
      const res = await serverApi.post<any>(`/api/water/sources`, payload);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.source, status: 201 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Update Source ─────────────────────────────────────────────────────────
  async updateSource(sourceId: string, payload: Partial<WaterSource>): Promise<ApiResponse<WaterSource>> {
    try {
      const res = await serverApi.request(`/api/water/sources/${sourceId}`, 'PUT', payload) as any;
      if (res?.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res?.source, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Source (soft) ──────────────────────────────────────────────────
  async deleteSource(sourceId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.request(`/api/water/sources/${sourceId}`, 'DELETE') as any;
      if (res?.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch Tariffs ─────────────────────────────────────────────────────────
  async fetchTariffs(propertyId: string): Promise<ApiResponse<WaterTariff[]>> {
    try {
      const res = await serverApi.get<any>(`/api/water/tariffs?propertyId=${propertyId}`);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.tariffs || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Create Tariff ─────────────────────────────────────────────────────────
  async createTariff(payload: Partial<WaterTariff> & { property_id: string }): Promise<ApiResponse<WaterTariff>> {
    try {
      const res = await serverApi.post<any>(`/api/water/tariffs`, payload);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.tariff, status: 201 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Fetch Readings ────────────────────────────────────────────────────────
  async fetchReadings(propertyId: string, filters?: { sourceId?: string; month?: string; fromDate?: string; toDate?: string }): Promise<ApiResponse<WaterReading[]>> {
    try {
      let url = `/api/water/readings?propertyId=${propertyId}`;
      if (filters?.sourceId) url += `&sourceId=${filters.sourceId}`;
      if (filters?.month) url += `&month=${filters.month}`;
      if (filters?.fromDate) url += `&fromDate=${filters.fromDate}`;
      if (filters?.toDate) url += `&toDate=${filters.toDate}`;

      const { data, error } = await serverApi.get<any>(url);
      if (error) throw new Error(error.message || 'Unknown error');
      return { success: true, data: data?.readings || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Submit Reading (upsert by source + date) ──────────────────────────────
  async submitReading(payload: ReadingPayload): Promise<ApiResponse<WaterReading>> {
    try {
      const res = await serverApi.post<any>(`/api/water/readings`, {
        property_id: payload.property_id,
        readings: [{
          source_id: payload.source_id,
          reading_date: payload.reading_date,
          quantity: payload.quantity,
        }]
      });
      if (res.error) throw new Error(res.error.message ?? 'Unknown error');
      return { success: true, data: res.data?.readings?.[0], status: 201 };
    } catch (err: any) {
      console.error('waterService.submitReading:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Reading ────────────────────────────────────────────────────────
  async deleteReading(readingId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.request(`/api/water/readings/${readingId}`, 'DELETE') as any;
      if (res?.error) throw new Error(res.error.message ?? 'Unknown error');
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch Analytics ───────────────────────────────────────────────────────
  async fetchAnalytics(propertyId: string, dateFrom?: string, dateTo?: string): Promise<ApiResponse<WaterAnalyticsData>> {
    try {
      let url = `/api/water/analytics?propertyId=${propertyId}`;
      if (dateFrom) url += `&dateFrom=${dateFrom}`;
      if (dateTo) url += `&dateTo=${dateTo}`;

      const res = await serverApi.get<any>(url);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },
};
