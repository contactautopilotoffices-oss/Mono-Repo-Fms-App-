import { serverApi } from '@/lib/serverApi';

// ---------------------------------------------------------------------------
// Types (aligned with saas_one schema)
// ---------------------------------------------------------------------------

export interface ElectricityMeter {
  id: string;
  property_id: string;
  name: string;
  meter_number?: string | null;
  meter_type: 'main' | 'generator' | 'solar' | 'sub';
  max_load_kw?: number | null;
  status?: string | null;
  last_reading?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ElectricityReading {
  id: string;
  property_id: string;
  meter_id: string;
  reading_date: string;
  opening_reading: number;
  closing_reading: number;
  computed_units?: number | null;
  final_units?: number | null;
  computed_cost?: number | null;
  multiplier_id?: string | null;
  multiplier_value_used?: number | null;
  tariff_id?: string | null;
  tariff_rate_used?: number | null;
  peak_load_kw?: number | null;
  notes?: string | null;
  alert_status?: string | null;
  photo_url?: string | null;
  ocr_reading?: number | null;
  ocr_confidence?: number | null;
  ocr_status?: string | null;
  created_by?: string | null;
  created_at?: string;
  meter?: ElectricityMeter;
}

export interface GridTariff {
  id: string;
  property_id: string;
  utility_provider?: string | null;
  rate_per_unit: number;
  unit_type?: string | null;
  effective_from: string;
  effective_to?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface MeterMultiplier {
  id: string;
  meter_id: string;
  ct_ratio_primary?: number | null;
  ct_ratio_secondary?: number | null;
  pt_ratio_primary?: number | null;
  pt_ratio_secondary?: number | null;
  meter_constant?: number | null;
  multiplier_value?: number | null;
  effective_from: string;
  effective_to?: string | null;
  reason?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface ReadingPayload {
  meter_id: string;
  reading_date: string;
  opening_reading: number;
  closing_reading: number;
  notes?: string | null;
  photo_url?: string | null;
  created_by?: string | null;
}

// ---------------------------------------------------------------------------
// Electricity Service — all operations go through the mobile server API client
// ---------------------------------------------------------------------------

export const electricityService = {
  // ── Fetch Meters ──────────────────────────────────────────────────────────
  async fetchMeters(propertyId: string) {
    const res = await serverApi.get<{ meters: ElectricityMeter[] }>('/api/electricity/meters', { propertyId });
    return { success: !res.error, data: res.data?.meters || [], error: res.error };
  },

  // ── Create Meter ──────────────────────────────────────────────────────────
  async createMeter(payload: Partial<ElectricityMeter> & { initial_multiplier?: Partial<MeterMultiplier> }) {
    const res = await serverApi.post<{ meter: ElectricityMeter }>('/api/electricity/meters', payload);
    return { success: !res.error, data: res.data?.meter ?? null, error: res.error };
  },

  // ── Delete Meter ──────────────────────────────────────────────────────────
  async deleteMeter(meterId: string) {
    const res = await serverApi.delete(`/api/electricity/meters/${meterId}`);
    return { success: !res.error, data: null, error: res.error };
  },

  // ── Fetch Readings ────────────────────────────────────────────────────────
  async fetchReadings(propertyId: string, filters?: { meterId?: string; fromDate?: string; toDate?: string }) {
    const query: Record<string, string> = { propertyId };
    if (filters?.meterId) query.meterId = filters.meterId;
    if (filters?.fromDate) query.fromDate = filters.fromDate;
    if (filters?.toDate) query.toDate = filters.toDate;

    const res = await serverApi.get<{ readings: ElectricityReading[] }>('/api/electricity/readings', query);
    return { success: !res.error, data: res.data?.readings || [], error: res.error };
  },

  // ── Submit Reading ────────────────────────────────────────────────────────
  async submitReading(propertyId: string, payload: ReadingPayload) {
    const res = await serverApi.post<{ reading: ElectricityReading }>('/api/electricity/readings', {
      ...payload,
      property_id: propertyId
    });
    return { success: !res.error, data: res.data?.reading ?? null, error: res.error };
  },

  // ── Delete Reading ────────────────────────────────────────────────────────
  async deleteReading(readingId: string, _meterId: string, propertyId: string) {
    const res = await serverApi.delete(`/api/electricity/readings/${readingId}?propertyId=${propertyId}`);
    return { success: !res.error, data: null, error: res.error };
  },

  // ── Fetch Grid Tariffs ────────────────────────────────────────────────────
  async fetchTariffs(propertyId: string) {
    const res = await serverApi.get<{ tariffs: GridTariff[] }>('/api/electricity/tariffs', { propertyId });
    return { success: !res.error, data: res.data?.tariffs ?? [], error: res.error };
  },

  // ── Create Tariff (closes previous active) ────────────────────────────────
  async createTariff(payload: Partial<GridTariff>) {
    const res = await serverApi.post<{ tariff: GridTariff }>('/api/electricity/tariffs', payload);
    return { success: !res.error, data: res.data?.tariff ?? null, error: res.error };
  },

  // ── Delete Tariff ─────────────────────────────────────────────────────────
  async deleteTariff(tariffId: string, propertyId: string) {
    const res = await serverApi.delete(`/api/electricity/tariffs/${tariffId}`);
    return { success: !res.error, data: null, error: res.error };
  },

  // ── Fetch Meter Multipliers ───────────────────────────────────────────────
  async fetchMultipliers(meterId: string) {
    const res = await serverApi.get<{ data: MeterMultiplier[] }>('/api/electricity/meter-multipliers', { meterId });
    return { success: !res.error, data: res.data?.data ?? [], error: res.error };
  },

  // ── Create Multiplier (closes previous active) ────────────────────────────
  async createMultiplier(payload: Partial<MeterMultiplier>) {
    const res = await serverApi.post<{ data: MeterMultiplier }>('/api/electricity/meter-multipliers', payload);
    return { success: !res.error, data: res.data?.data ?? null, error: res.error };
  },
};
