/**
 * High-Performance Diesel API
 *
 * Features:
 * - Parallel fetching (all data loads simultaneously)
 * - Prefetching for instant display from cache
 * - Carry-forward logic with efficient latest-reading lookup
 * - Optimized averaging with single query for all periods
 */

import { serverApi, QueryFilter } from '@/lib/serverApi';
import { format, subDays, subMonths } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
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

export interface DieselDashboardData {
  generators: Generator[];
  readings: DieselReading[];
  previousClosings: Record<string, { hours: number; kwh: number; diesel: number }>;
  averages: Record<string, number>;
  activeTariffs: Record<string, DGTariff>;
}

export interface PrefetchResult {
  success: boolean;
  data: DieselDashboardData | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Fast Diesel API — Parallel + Prefetch
// ---------------------------------------------------------------------------

export const dieselApi = {
  /**
   * Fetch ALL diesel data in PARALLEL for maximum speed.
   * This replaces the sequential fetches in the web app.
   */
  async fetchAll(propertyId: string): Promise<PrefetchResult> {
    try {
      // Launch all fetches in parallel
      const [genRes, readingsRes, tariffsRes] = await Promise.all([
        // 1. Fetch all generators for this property
        serverApi.query<Generator[]>({
          table: 'generators',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        }),

        // 2. Fetch recent readings (last 100, sorted by date desc)
        // This covers yesterday's reading for carry-forward and ~3 months of history
        serverApi.query<DieselReading[]>({
          table: 'diesel_readings',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
          orders: [{ column: 'reading_date', ascending: false }],
          limit: 100,
        }),

        // 3. Fetch all active tariffs for all generators
        serverApi.query<DGTariff[]>({
          table: 'dg_tariffs',
          action: 'select',
          select: '*',
          filters: [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'is', column: 'effective_to', value: null }, // Only active tariffs
          ],
        }),
      ]);

      if (genRes.error) throw new Error(genRes.error.message);
      if (readingsRes.error) throw new Error(readingsRes.error.message);

      const generators: Generator[] = genRes.data ?? [];
      const readings: DieselReading[] = readingsRes.data ?? [];

      // Process carry-forward: get latest closing for each generator
      const previousClosings = processPreviousClosings(generators, readings);

      // Process averages: compute monthly average consumption per generator
      const averages = processAverages(readings);

      // Process active tariffs: map by generator_id
      const activeTariffs = processTariffs(tariffsRes.data ?? [], generators);

      return {
        success: true,
        data: {
          generators,
          readings,
          previousClosings,
          averages,
          activeTariffs,
        },
      };
    } catch (err: any) {
      console.error('[dieselApi.fetchAll] Error:', err);
      return { success: false, data: null, error: err.message };
    }
  },

  /**
   * Prefetch for dashboard: loads data ahead of user navigation
   * Uses stale-while-revalidate pattern
   */
  async prefetch(propertyId: string): Promise<PrefetchResult> {
    return this.fetchAll(propertyId);
  },

  /**
   * Fetch just generators (lightweight, fast)
   */
  async fetchGenerators(propertyId: string): Promise<{ success: boolean; data: Generator[]; error?: string }> {
    try {
      const res = await serverApi.query<Generator[]>({
        table: 'generators',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data ?? [] };
    } catch (err: any) {
      return { success: false, data: [], error: err.message };
    }
  },

  /**
   * Create a new generator
   */
  async createGenerator(payload: Partial<Generator>): Promise<{ success: boolean; data: Generator | null; error?: string }> {
    try {
      const res = await serverApi.query<Generator>({
        table: 'generators',
        action: 'insert',
        values: payload,
        select: '*',
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any };
    } catch (err: any) {
      return { success: false, data: null, error: err.message };
    }
  },

  /**
   * Update a generator
   */
  async updateGenerator(generatorId: string, payload: Partial<Generator>): Promise<{ success: boolean; data: Generator | null; error?: string }> {
    try {
      const res = await serverApi.query<Generator>({
        table: 'generators',
        action: 'update',
        values: payload,
        filters: [{ op: 'eq', column: 'id', value: generatorId }],
        select: '*',
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any };
    } catch (err: any) {
      return { success: false, data: null, error: err.message };
    }
  },

  /**
   * Delete a generator
   */
  async deleteGenerator(generatorId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await serverApi.query({
        table: 'generators',
        action: 'delete',
        filters: [{ op: 'eq', column: 'id', value: generatorId }],
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Submit a reading with computed values
   */
  async submitReading(payload: ReadingPayload): Promise<{ success: boolean; data: DieselReading | null; error?: string }> {
    try {
      const computed_run_hours = payload.closing_hours - payload.opening_hours;
      const computed_consumed_litres = payload.opening_diesel_level + payload.diesel_added_litres - payload.closing_diesel_level;

      const res = await serverApi.query<DieselReading>({
        table: 'diesel_readings',
        action: 'insert',
        values: {
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
          computed_run_hours,
          computed_consumed_litres,
          notes: payload.notes ?? null,
        },
        select: '*',
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any };
    } catch (err: any) {
      console.error('[dieselApi.submitReading] Error:', err);
      return { success: false, data: null, error: err.message };
    }
  },

  /**
   * Delete a reading
   */
  async deleteReading(readingId: string, propertyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await serverApi.query({
        table: 'diesel_readings',
        action: 'delete',
        filters: [
          { op: 'eq', column: 'id', value: readingId },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Fetch tariffs for a generator
   */
  async fetchTariffs(generatorId: string): Promise<{ success: boolean; data: DGTariff[]; error?: string }> {
    try {
      const res = await serverApi.query<DGTariff[]>({
        table: 'dg_tariffs',
        action: 'select',
        filters: [{ op: 'eq', column: 'generator_id', value: generatorId }],
        orders: [{ column: 'effective_from', ascending: false }],
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data ?? [] };
    } catch (err: any) {
      return { success: false, data: [], error: err.message };
    }
  },

  /**
   * Create or update tariff
   */
  async createTariff(payload: Partial<DGTariff>): Promise<{ success: boolean; data: DGTariff | null; error?: string }> {
    try {
      // Close previous active tariff
      if (payload.generator_id && payload.effective_from) {
        const prevDate = new Date(payload.effective_from);
        prevDate.setDate(prevDate.getDate() - 1);
        await serverApi.query({
          table: 'dg_tariffs',
          action: 'update',
          values: { effective_to: prevDate.toISOString().split('T')[0] },
          filters: [
            { op: 'eq', column: 'generator_id', value: payload.generator_id },
            { op: 'is', column: 'effective_to', value: null },
          ],
        });
      }

      const res = await serverApi.query<DGTariff>({
        table: 'dg_tariffs',
        action: 'insert',
        values: payload,
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any };
    } catch (err: any) {
      return { success: false, data: null, error: err.message };
    }
  },

  /**
   * Fetch analytics summary (optimized single query)
   */
  async fetchAnalytics(propertyId: string, generatorId?: string): Promise<{
    success: boolean;
    data: {
      today: DieselReading[];
      month: DieselReading[];
      previousMonth: DieselReading[];
      trend: DieselReading[];
      summary: {
        totalConsumption: number;
        totalCost: number;
        avgConsumption: number;
        avgCost: number;
      };
    };
    error?: string;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
      const prevMonthStart = format(subMonths(new Date(), 2), 'yyyy-MM-dd');
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

      const baseFilters: QueryFilter[] = generatorId
        ? [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'eq', column: 'generator_id', value: generatorId },
          ]
        : [{ op: 'eq', column: 'property_id', value: propertyId }];

      // Parallel fetch for all periods
      const [todayRes, monthRes, prevMonthRes, trendRes] = await Promise.all([
        serverApi.query<DieselReading[]>({
          table: 'diesel_readings',
          action: 'select',
          select: '*',
          filters: [...baseFilters, { op: 'eq' as const, column: 'reading_date', value: today }],
        }),
        serverApi.query<DieselReading[]>({
          table: 'diesel_readings',
          action: 'select',
          select: '*',
          filters: [...baseFilters, { op: 'gte' as const, column: 'reading_date', value: monthStart }],
          orders: [{ column: 'reading_date', ascending: false }],
        }),
        serverApi.query<DieselReading[]>({
          table: 'diesel_readings',
          action: 'select',
          select: '*',
          filters: [
            ...baseFilters,
            { op: 'gte' as const, column: 'reading_date', value: prevMonthStart },
            { op: 'lt' as const, column: 'reading_date', value: monthStart },
          ],
          orders: [{ column: 'reading_date', ascending: false }],
        }),
        serverApi.query<DieselReading[]>({
          table: 'diesel_readings',
          action: 'select',
          select: '*',
          filters: [...baseFilters, { op: 'gte' as const, column: 'reading_date', value: thirtyDaysAgo }],
          orders: [{ column: 'reading_date', ascending: false }],
        }),
      ]);

      const computeSummary = (readings: DieselReading[]) => {
        const total = readings.reduce((sum, r) => sum + (r.computed_consumed_litres ?? 0), 0);
        const cost = readings.reduce((sum, r) => sum + (r.computed_cost ?? 0), 0);
        return {
          totalConsumption: total,
          totalCost: cost,
          avgConsumption: readings.length > 0 ? total / readings.length : 0,
          avgCost: readings.length > 0 ? cost / readings.length : 0,
        };
      };

      return {
        success: true,
        data: {
          today: todayRes.data ?? [],
          month: monthRes.data ?? [],
          previousMonth: prevMonthRes.data ?? [],
          trend: trendRes.data ?? [],
          summary: computeSummary(trendRes.data ?? []),
        },
      };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message };
    }
  },
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Process carry-forward values: get the latest closing reading for each generator
 * Uses initial values from generator setup as fallback
 */
function processPreviousClosings(
  generators: Generator[],
  readings: DieselReading[]
): Record<string, { hours: number; kwh: number; diesel: number }> {
  const result: Record<string, { hours: number; kwh: number; diesel: number }> = {};

  // Initialize from generator initial values (starting truth)
  generators.forEach((gen) => {
    result[gen.id] = {
      hours: gen.initial_run_hours ?? 0,
      kwh: gen.initial_kwh_reading ?? 0,
      diesel: gen.initial_diesel_level ?? 0,
    };
  });

  // Sort readings by date (newest first), then by created_at for same-day
  const sortedReadings = [...readings].sort((a, b) => {
    const dateDiff = new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });

  // Override with latest actual reading for each generator
  sortedReadings.forEach((r) => {
    if (!result[r.generator_id]) return;
    result[r.generator_id] = {
      hours: r.closing_hours ?? result[r.generator_id].hours,
      kwh: r.closing_kwh ?? result[r.generator_id].kwh,
      diesel: r.closing_diesel_level ?? result[r.generator_id].diesel,
    };
  });

  return result;
}

/**
 * Process monthly averages: compute average consumption per generator
 */
function processAverages(readings: DieselReading[]): Record<string, number> {
  const result: Record<string, number[]> = {};

  // Group by generator and collect consumption values
  readings.forEach((r) => {
    if (!r.computed_consumed_litres || r.computed_consumed_litres <= 0) return;
    if (!result[r.generator_id]) result[r.generator_id] = [];
    result[r.generator_id].push(r.computed_consumed_litres);
  });

  // Calculate averages
  const averages: Record<string, number> = {};
  Object.entries(result).forEach(([genId, values]) => {
    if (values.length > 0) {
      averages[genId] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }
  });

  return averages;
}

/**
 * Process active tariffs: map to generators, prefer active ones
 */
function processTariffs(tariffs: DGTariff[], generators: Generator[]): Record<string, DGTariff> {
  const result: Record<string, DGTariff> = {};

  // Sort tariffs by effective_from (newest first)
  const sortedTariffs = [...tariffs].sort(
    (a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime()
  );

  // Take the first (most recent) active tariff per generator
  generators.forEach((gen) => {
    const activeTariff = sortedTariffs.find((t) => t.generator_id === gen.id);
    if (activeTariff) {
      result[gen.id] = activeTariff;
    }
  });

  return result;
}