import { useState, useEffect, useCallback } from 'react';
import { serverApi } from '@/lib/serverApi';

export interface OrgData {
  orgName: string;
  properties: any[];
  tickets: any[];
  sopCount: number;
  sopTotal: number;
  energyKwh: number;
  vmsStats: { total: number; in: number; out: number };
  vendorStats: { revenue: number; commission: number };
  healthScore: number;
  attentionItems: any[];
}

export default function useOrgData(orgId: string) {
  const [data, setData] = useState<OrgData>({
    orgName: 'Organization',
    properties: [],
    tickets: [],
    sopCount: 0,
    sopTotal: 0,
    energyKwh: 0,
    vmsStats: { total: 0, in: 0, out: 0 },
    vendorStats: { revenue: 0, commission: 0 },
    healthScore: 100,
    attentionItems: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrgData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);

    try {
      // ───────────────────────────────────────────────────────────────────────
      // This used to be ~7 serial awaits PLUS three separate `for` loops that
      // issued one request per property (electricity reading, health score,
      // attention items). For an org with 20 properties that is 7 + 60 = 67
      // sequential round trips to render one screen.
      //
      // Now: 2 waves, with the per-property work fanned out concurrently inside
      // each wave.
      // ───────────────────────────────────────────────────────────────────────

      // ── Wave 1: org name + the property list it all keys off ───────────────
      const [orgRes, propsRes] = await Promise.all([
        serverApi.query<{ name: string }>({
          table: 'organizations',
          action: 'select',
          select: 'name',
          filters: [{ op: 'eq', column: 'id', value: orgId }],
          single: true,
        }),
        serverApi.query<any[]>({
          table: 'properties',
          action: 'select',
          select: 'id, name, code, image_url, organization_id',
          filters: [{ op: 'eq', column: 'organization_id', value: orgId }],
        }),
      ]);

      const orgName = orgRes.data?.name || 'Organization';
      const propertyList = (propsRes.data || []) as any[];
      const propIds = propertyList.map((p: any) => p.id);

      if (propIds.length === 0) {
        setData({
          orgName,
          properties: [],
          tickets: [],
          sopCount: 0,
          sopTotal: 0,
          energyKwh: 0,
          vmsStats: { total: 0, in: 0, out: 0 },
          vendorStats: { revenue: 0, commission: 0 },
          healthScore: 100,
          attentionItems: [],
        });
        setIsLoading(false);
        return;
      }

      // ── Wave 2: everything else, all at once ───────────────────────────────
      const [
        ticketsRes,
        sopRes,
        vmsRes,
        revRes,
        energyResults,
        healthResults,
        attentionResults,
      ] = await Promise.all([
        serverApi.query<any[]>({
          table: 'tickets',
          action: 'select',
          // Explicit columns: this was `select: '*'` across EVERY property in the
          // org, which pulls every column of every ticket over the wire.
          select: 'id, ticket_number, title, status, priority, created_at, resolved_at, property_id, assigned_to, raised_by',
          filters: [{ op: 'in', column: 'property_id', values: propIds }],
        }),
        serverApi.query<any[]>({
          table: 'sop_completions',
          action: 'select',
          select: 'status',
          filters: [{ op: 'in', column: 'property_id', values: propIds }],
        }),
        serverApi.query<any[]>({
          table: 'visitor_logs',
          action: 'select',
          select: 'status',
          filters: [{ op: 'in', column: 'property_id', values: propIds }],
        }),
        serverApi.query<any[]>({
          table: 'vendor_daily_revenue',
          action: 'select',
          select: 'revenue_amount',
          filters: [{ op: 'in', column: 'property_id', values: propIds }],
        }),

        // Per-property fan-outs. Still one request each (the latest reading per
        // property and these two RPCs are not expressible as a single call), but
        // concurrent rather than sequential.
        Promise.all(
          propIds.map((propId: string) =>
            serverApi.query<any>({
              table: 'electricity_readings',
              action: 'select',
              select: 'final_units',
              filters: [{ op: 'eq', column: 'property_id', value: propId }],
              orders: [{ column: 'created_at', ascending: false }],
              limit: 1,
              maybeSingle: true,
            }).catch(() => ({ data: null, error: null }))
          )
        ),
        Promise.all(
          propIds.map((propId: string) =>
            serverApi
              .rpc<number>('get_property_health_score', { property_id: propId })
              .catch(() => ({ data: null, error: null }))
          )
        ),
        Promise.all(
          propIds.map((propId: string) =>
            serverApi
              .rpc<any[]>('get_attention_items', { p_property_id: propId, p_limit: 3 })
              .catch(() => ({ data: null, error: null }))
          )
        ),
      ]);

      const tickets = (ticketsRes.data || []) as any[];

      const sopData = sopRes.data ?? [];
      const sopTotal = sopData.length;
      const sopCount = sopData.filter((s: any) => s.status === 'completed').length;

      const vmsData = vmsRes.data ?? [];
      const vmsStats = {
        total: vmsData.length,
        in: vmsData.filter((v: any) => v.status === 'checked_in').length,
        out: vmsData.filter((v: any) => v.status === 'checked_out').length,
      };

      const totalRev = (revRes.data ?? []).reduce(
        (acc: number, row: any) => acc + (row.revenue_amount || 0),
        0
      );
      const vendorStats = { revenue: totalRev, commission: totalRev * 0.1 };

      const energyKwh = energyResults.reduce(
        (acc: number, r: any) => acc + Math.round(r?.data?.final_units || 0),
        0
      );

      const validScores = healthResults
        .map((r: any) => r?.data)
        .filter((v: any): v is number => typeof v === 'number');
      const healthScore =
        validScores.length > 0
          ? Math.round(validScores.reduce((a: number, b: number) => a + b, 0) / validScores.length)
          : 100;

      const attentionItems = attentionResults.flatMap((r: any) =>
        Array.isArray(r?.data) ? r.data : []
      );

      setData({
        orgName,
        properties: propertyList,
        tickets,
        sopCount,
        sopTotal,
        energyKwh,
        vmsStats,
        vendorStats,
        healthScore,
        attentionItems: attentionItems.slice(0, 10), // cap at 10 items
      });
      setError(null);
    } catch (err) {
      console.error('[useOrgData] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch org data');
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchOrgData();
  }, [fetchOrgData]);

  return { data, isLoading, error, refetch: fetchOrgData };
}
