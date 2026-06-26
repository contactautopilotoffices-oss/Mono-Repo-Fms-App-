import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';
import { dieselApi } from './dieselApi';

// Re-export types and API for convenience
export { dieselApi };
export type {
  DieselDashboardData,
  PrefetchResult,
} from './dieselApi';

// ---------------------------------------------------------------------------
// Types (aligned with saas_one schema)
// ---------------------------------------------------------------------------

export interface Generator {
  id: string;
  property_id: string;
  name: string;
  make?: string | null;
  capacity_kva?: number | null;
  tank_capacity_litres?: number | null;
  status: string;
  initial_run_hours?: number | null;
  initial_kwh_reading?: number | null;
  initial_diesel_level?: number | null;
  effective_from_date?: string | null;
  created_at?: string;
}

export interface DieselReading {
  id: string;
  property_id: string;
  generator_id: string;
  reading_date: string;
  opening_hours: number;
  closing_hours: number;
  opening_kwh?: number | null;
  closing_kwh?: number | null;
  opening_diesel_level: number;
  closing_diesel_level: number;
  diesel_added_litres: number;
  computed_consumed_litres?: number | null;
  computed_run_hours?: number | null;
  computed_cost?: number | null;
  tariff_id?: string | null;
  tariff_rate_used?: number | null;
  notes?: string | null;
  alert_status?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface DGTariff {
  id: string;
  generator_id: string;
  cost_per_litre: number;
  effective_from: string;
  effective_to?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface ReadingPayload {
  property_id: string;
  generator_id: string;
  reading_date: string;
  opening_hours: number;
  closing_hours: number;
  opening_kwh?: number;
  closing_kwh?: number;
  opening_diesel_level: number;
  closing_diesel_level: number;
  diesel_added_litres: number;
  notes?: string | null;
}

export interface LastClosing {
  hours: number;
  kwh: number;
  diesel: number;
}

// ---------------------------------------------------------------------------
// HIGH-PERFORMANCE: Parallel fetch with carry-forward processing
// Replaces sequential fetches with parallel Promise.all()
// ---------------------------------------------------------------------------

export const dieselService = {
  // ── FAST: Parallel fetch all data (generators + readings + tariffs) ─────────
  // Uses dieselApi's parallel fetching for ~3x faster load times
  async fetchAll(propertyId: string): Promise<ApiResponse<{ generators: Generator[]; readings: DieselReading[]; lastClosings: Record<string, LastClosing> }>> {
    try {
      const result = await dieselApi.fetchAll(propertyId);
      if (!result.success) throw new Error(result.error);

      // Build lastClosings from dieselApi result
      const lastClosings: Record<string, LastClosing> = {};
      Object.entries(result.data.previousClosings).forEach(([genId, closing]) => {
        lastClosings[genId] = closing;
      });

      return {
        success: true,
        data: {
          generators: result.data.generators,
          readings: result.data.readings,
          lastClosings,
        },
        status: 200,
      };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── PREFETCH: Load data ahead of user navigation ─────────────────────────
  // Use this in parent components for instant display from cache
  async prefetch(propertyId: string): Promise<void> {
    try {
      await dieselApi.prefetch(propertyId);
    } catch (e) {
      console.warn('[dieselService.prefetch] Background prefetch failed:', e);
    }
  },

  // ── Fetch all diesel data (generators + readings) ─────────────────────────
  async fetchAllOriginal(propertyId: string): Promise<ApiResponse<{ generators: Generator[]; readings: DieselReading[] }>> {
    try {
      const [genRes, readRes] = await Promise.all([
        serverApi.get<any>(`/api/diesel/generators?propertyId=${propertyId}`),
        serverApi.get<any>(`/api/diesel/readings?propertyId=${propertyId}`),
      ]);
      if (genRes.error) throw new Error(genRes.error.message);
      if (readRes.error) throw new Error(readRes.error.message);
      return { success: true, data: { generators: genRes.data?.generators ?? [], readings: readRes.data?.readings ?? [] }, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Fetch Generators ──────────────────────────────────────────────────────
  async fetchGenerators(propertyId: string): Promise<ApiResponse<Generator[]>> {
    try {
      const res = await serverApi.get<any>(`/api/diesel/generators?propertyId=${propertyId}`);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.generators || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Create Generator ──────────────────────────────────────────────────────
  async createGenerator(payload: Partial<Generator>): Promise<ApiResponse<Generator>> {
    try {
      const res = await serverApi.post<any>(`/api/diesel/generators`, payload);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.generator, status: 201 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Update Generator ──────────────────────────────────────────────────────
  async updateGenerator(generatorId: string, payload: Partial<Generator>): Promise<ApiResponse<Generator>> {
    try {
      const res = await serverApi.patch<any>(`/api/diesel/generators/${generatorId}`, payload);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data?.generator, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Generator ──────────────────────────────────────────────────────
  async deleteGenerator(generatorId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.delete<any>(`/api/diesel/generators/${generatorId}`);
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch Readings ────────────────────────────────────────────────────────
  async fetchReadings(propertyId: string, filters?: { generatorId?: string; fromDate?: string; toDate?: string }): Promise<ApiResponse<DieselReading[]>> {
    try {
      let url = `/api/diesel/readings?propertyId=${propertyId}`;
      if (filters?.generatorId) url += `&generatorId=${filters.generatorId}`;
      if (filters?.fromDate) url += `&fromDate=${filters.fromDate}`;
      if (filters?.toDate) url += `&toDate=${filters.toDate}`;

      const { data, error } = await serverApi.get<any>(url);
      if (error) throw new Error(error.message || 'Unknown error');
      return { success: true, data: data?.readings || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Submit Reading ────────────────────────────────────────────────────────
  async submitReading(payload: ReadingPayload): Promise<ApiResponse<DieselReading>> {
    try {
      // computed_run_hours is generated by the database
      const computed_consumed_litres = payload.opening_diesel_level + payload.diesel_added_litres - payload.closing_diesel_level;

      const res = await serverApi.post<any>(`/api/diesel/readings`, {
        property_id: payload.property_id,
        generator_id: payload.generator_id,
        reading_date: payload.reading_date,
        opening_hours: payload.opening_hours,
        closing_hours: payload.closing_hours,
        opening_kwh: payload.opening_kwh ?? null,
        closing_kwh: payload.closing_kwh ?? null,
        opening_diesel_level: payload.opening_diesel_level,
        closing_diesel_level: payload.closing_diesel_level,
        diesel_added_litres: payload.diesel_added_litres,
        computed_consumed_litres,
        notes: payload.notes ?? null,
      });

      if (res.error) throw new Error(res.error.message ?? 'Unknown error');
      return { success: true, data: res.data?.reading, status: 201 };
    } catch (err: any) {
      console.error('dieselService.submitReading:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Reading ────────────────────────────────────────────────────────
  async deleteReading(readingId: string, propertyId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.delete<any>(`/api/diesel/readings/${readingId}?propertyId=${propertyId}`);
      if (res.error) throw new Error(res.error.message ?? 'Unknown error');
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch Tariffs ─────────────────────────────────────────────────────────
  async fetchTariffs(generatorId: string): Promise<ApiResponse<DGTariff[]>> {
    try {
      const res = await serverApi.get<any>(`/api/diesel/tariffs?generatorId=${generatorId}`);
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data?.tariffs || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Create Tariff (closes previous active) ────────────────────────────────
  async createTariff(payload: Partial<DGTariff>): Promise<ApiResponse<DGTariff>> {
    try {
      const res = await serverApi.post<any>(`/api/diesel/tariffs`, payload);
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data?.tariff, status: 201 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Tariff ─────────────────────────────────────────────────────────
  async deleteTariff(tariffId: string, generatorId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.delete<any>(`/api/diesel/tariffs/${tariffId}`);
      if (res.error) throw new Error(res.error.message);

      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },
};
