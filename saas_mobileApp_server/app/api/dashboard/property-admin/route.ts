import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { getCache, setCache, CACHE_TTL } from "@/lib/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    
    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const userId = auth.user.id;
    const cacheKey = `dashboard:property-admin:${propertyId}:${userId}`;

    // 1. Try to fetch from Redis Cache
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, source: "cache" });
    }

    // 2. Cache miss -> Fetch from Database
    const admin = createAdminClient();
    const isAll = propertyId === 'all';
    
    // Resolve which properties this user has access to if "all"
    let propIds: string[] = [];
    if (isAll) {
      // Find org memberships first
      const { data: orgMems } = await admin
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', userId)
        .or('is_active.eq.true,is_active.is.null')
        .in('role', ['org_super_admin', 'super_tenant', 'master_admin'])
        .limit(1);
        
      const orgMembership = orgMems && orgMems.length > 0 ? orgMems[0] : null;
        
      if (orgMembership?.organization_id) {
        const { data: props } = await admin
          .from('properties')
          .select('id')
          .eq('organization_id', orgMembership.organization_id);
        propIds = (props ?? []).map((p: any) => p.id);
      } else {
        return NextResponse.json({ error: "Unauthorized access to org properties" }, { status: 403 });
      }
    } else {
      const access = await getPropertyAccess(userId, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Access Denied to this Property" }, { status: 403 });
      }
      propIds = [propertyId];
    }

    if (propIds.length === 0) {
      return NextResponse.json({ success: true, data: null, source: "db" });
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // Build the bulk parallel queries
    const bulkQueries = Promise.all([
      // Property Name (only if single)
      isAll 
        ? Promise.resolve({ data: { name: 'All Properties Overview', image_url: null } })
        : admin.from('properties').select('name, image_url').eq('id', propertyId).single(),
        
      // Recent Tickets
      admin.from('tickets')
        .select('id, title, status, priority, created_at, is_internal, photo_before_url')
        .in('property_id', propIds)
        .order('created_at', { ascending: false })
        .limit(100),
        
      // Active SOP Templates
      admin.from('sop_templates')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('is_active', true),
        
      // SOP Completions Today
      admin.from('sop_completions')
        .select('status', { count: 'exact' })
        .in('property_id', propIds)
        .eq('completion_date', todayStr)
        .eq('status', 'completed'),
        
      // Visitor Logs
      admin.from('visitor_logs')
        .select('status, created_at')
        .in('property_id', propIds),
        
      // Vendor Daily Revenue
      admin.from('vendor_daily_revenue')
        .select('revenue_amount, vendor_id')
        .in('property_id', propIds),
        
      // Total Tickets Count (All)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds),
      // Open Tickets Count (All)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).in('status', ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist', 'blocked']),
      // Closed Tickets Count (All)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).in('status', ['completed', 'resolved', 'closed', 'pending_validation']),
      
      // Total Tickets Count (Month)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      // Open Tickets Count (Month)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).in('status', ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist', 'blocked']),
      // Closed Tickets Count (Month)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).in('status', ['completed', 'resolved', 'closed', 'pending_validation']),

      // Total Tickets Count (Today)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).gte('created_at', todayStr),
      // Open Tickets Count (Today)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).gte('created_at', todayStr).in('status', ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist', 'blocked']),
      // Closed Tickets Count (Today)
      admin.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propIds).gte('created_at', todayStr).in('status', ['completed', 'resolved', 'closed', 'pending_validation']),

      // Tenant Users
      admin.from('property_memberships').select('user_id').in('property_id', propIds).in('role', ['tenant', 'super_tenant']),
    ]);

    // Build the per-property parallel queries
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const perPropQueries = Promise.all(propIds.map(async (pid) => {
      const [elec, elecMonthly, diesel, water, health, attention, funnel, ppm, ppmSchedules] = await Promise.all([
        // Last reading (for trend calculation)
        admin.from('electricity_readings')
          .select('final_units, computed_units, created_at')
          .eq('property_id', pid)
          .order('reading_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // All readings for main meter (to calculate today, month, all-time)
        admin.from('electricity_readings')
          .select('computed_units, final_units, reading_date, electricity_meters!inner(meter_type)')
          .eq('property_id', pid)
          .eq('electricity_meters.meter_type', 'main')
          .order('reading_date', { ascending: false }),
        admin.from('diesel_readings')
          .select('closing_diesel_level, computed_consumed_litres, reading_date')
          .eq('property_id', pid)
          .order('reading_date', { ascending: false }),
        // Water readings
        admin.from('water_readings')
          .select('quantity, computed_cost, reading_date, source:water_sources!inner(property_id, source_type)')
          .eq('water_sources.property_id', pid)
          .order('reading_date', { ascending: false }),
        admin.rpc('get_property_health_score', { p_property_id: pid }),
        admin.rpc('get_attention_items', { p_property_id: pid, p_limit: 10 }),
        admin.rpc('get_ticket_funnel', { p_property_id: pid, p_days: 30 }),
        admin.rpc("get_ppm_stats", { prop_id: pid }),
        admin.from('ppm_schedules')
          .select('id, system_name, detail_name, planned_date, status, frequency')
          .eq('property_id', pid)
          .order('planned_date', { ascending: true })
      ]);
      return { elec, elecMonthly, diesel, water, health, attention, funnel, ppm, ppmSchedules };
    }));

    // Wait for all queries to execute
    const [
      [
        propRes, 
        ticketRes, 
        sopTemplatesRes, 
        sopCompletionsRes, 
        vmsRes, 
        revRes, 
        countTotalAllRes, countOpenAllRes, countClosedAllRes,
        countTotalMonthRes, countOpenMonthRes, countClosedMonthRes,
        countTotalTodayRes, countOpenTodayRes, countClosedTodayRes,
        tenantUsersRes
      ], 
      perPropResults
    ] = await Promise.all([bulkQueries, perPropQueries]);

    // --- AGGREGATE RESULTS ---
    
    // VMS Stats
    let vmsStats = {
      today: { total: 0, in: 0, out: 0 },
      month: { total: 0, in: 0, out: 0 },
      all: { total: 0, in: 0, out: 0 }
    };
    if (vmsRes?.data) {
      const todayStr = new Date().toISOString().split('T')[0];
      const mStartStr = monthStart.split('T')[0];
      
      vmsRes.data.forEach((v: any) => {
        const dateStr = v.created_at ? v.created_at.split('T')[0] : '';
        const isToday = dateStr === todayStr;
        const isMonth = dateStr >= mStartStr;
        
        vmsStats.all.total++;
        if (v.status === 'checked_in') vmsStats.all.in++;
        if (v.status === 'checked_out') vmsStats.all.out++;
        
        if (isMonth) {
          vmsStats.month.total++;
          if (v.status === 'checked_in') vmsStats.month.in++;
          if (v.status === 'checked_out') vmsStats.month.out++;
        }
        
        if (isToday) {
          vmsStats.today.total++;
          if (v.status === 'checked_in') vmsStats.today.in++;
          if (v.status === 'checked_out') vmsStats.today.out++;
        }
      });
    }

    // Vendor Stats
    let vendorStats = { revenue: 0, commission: 0 };
    if (revRes?.data) {
      const totalRev = revRes.data.reduce((acc: number, row: any) => acc + (row.revenue_amount || 0), 0);
      vendorStats = { revenue: totalRev, commission: totalRev * 0.1 };
    }

    // Per Property Aggregation
    let totalElec = 0;
    let elecTrendSum = 0;
    let elecTrendCount = 0;
    let monthlyElecSum = 0;
    let totalDieselLevel = 0;
    let totalDieselConsumption = 0;
    let dieselCount = 0;
    let totalWaterQuantity = 0;
    let totalWaterCost = 0;
    let healthSum = 0;
    let attentionArr: any[] = [];
    let funnelCounts: Record<string, number> = {};
    let pTotal = 0, pDone = 0, pPending = 0, pOverdue = 0, pPostponed = 0;

    perPropResults.forEach(res => {
      // Last reading (for current/trend)
      if (res.elec.data) {
        const lastReading = res.elec.data as any;
        if (lastReading?.final_units || lastReading?.computed_units) {
          const lastElec = lastReading.computed_units || lastReading.final_units || 0;
          totalElec += lastElec;
        }
      }

      let elecToday = 0;
      let elecMonth = 0;
      let elecAll = 0;

      // Readings for main meter (for consumption stats)
      if (res.elecMonthly?.data && Array.isArray(res.elecMonthly.data)) {
        const allReadings = res.elecMonthly.data as any[];
        const todayStr = new Date().toISOString().split('T')[0];
        const mStartStr = monthStart.split('T')[0];
        
        allReadings.forEach(r => {
          const units = r.final_units ?? r.computed_units ?? 0;
          elecAll += units;
          if (r.reading_date >= mStartStr) elecMonth += units;
          if (r.reading_date === todayStr) elecToday += units;
        });
        
        monthlyElecSum += elecMonth; // keep old behavior
        totalElec += elecAll;
      }
      
      // Store in per-property results so we can aggregate if needed
      (res as any).elecStats = { today: elecToday, month: elecMonth, all: elecAll };

      let dieselToday = 0, dieselMonth = 0, dieselAll = 0;
      let dieselLevel = 0;
      if (res.diesel.data && Array.isArray(res.diesel.data)) {
        const dReadings = res.diesel.data as any[];
        if (dReadings.length > 0) {
          dieselLevel = dReadings[0].closing_diesel_level || 0;
          totalDieselLevel += dieselLevel;
          dieselCount++;
        }
        const todayStr = new Date().toISOString().split('T')[0];
        const mStartStr = monthStart.split('T')[0];
        dReadings.forEach(r => {
          const c = r.computed_consumed_litres || 0;
          dieselAll += c;
          if (r.reading_date >= mStartStr) dieselMonth += c;
          if (r.reading_date === todayStr) dieselToday += c;
        });
      }
      (res as any).dieselStats = { today: dieselToday, month: dieselMonth, all: dieselAll };

      let waterTodayQty = 0, waterMonthQty = 0, waterAllQty = 0;
      let waterTodayCost = 0, waterMonthCost = 0, waterAllCost = 0;
      let waterSources = { 
        today: {} as Record<string, { count: number, cost: number, qty: number }>, 
        month: {} as Record<string, { count: number, cost: number, qty: number }>, 
        all: {} as Record<string, { count: number, cost: number, qty: number }> 
      };
      
      if (res.water.error) {
        console.error("[SuperAdmin API] Water readings query error:", JSON.stringify(res.water.error));
      }
      
      if (res.water.data && Array.isArray(res.water.data)) {
        const wReadings = res.water.data as any[];
        const todayStr = new Date().toISOString().split('T')[0];
        const mStartStr = monthStart.split('T')[0];
        wReadings.forEach(r => {
          const q = r.quantity || 0;
          const c = r.computed_cost || 0;
          const sType = r.source?.source_type || 'Unknown';
          
          waterAllQty += q; waterAllCost += c;
          if (!waterSources.all[sType]) waterSources.all[sType] = { count: 0, cost: 0, qty: 0 };
          waterSources.all[sType].count++; waterSources.all[sType].cost += c; waterSources.all[sType].qty += q;
          
          if (r.reading_date >= mStartStr) { 
            waterMonthQty += q; waterMonthCost += c; 
            if (!waterSources.month[sType]) waterSources.month[sType] = { count: 0, cost: 0, qty: 0 };
            waterSources.month[sType].count++; waterSources.month[sType].cost += c; waterSources.month[sType].qty += q;
          }
          if (r.reading_date === todayStr) { 
            waterTodayQty += q; waterTodayCost += c; 
            if (!waterSources.today[sType]) waterSources.today[sType] = { count: 0, cost: 0, qty: 0 };
            waterSources.today[sType].count++; waterSources.today[sType].cost += c; waterSources.today[sType].qty += q;
          }
        });
      }
      (res as any).waterStats = { 
        qty: { today: waterTodayQty, month: waterMonthQty, all: waterAllQty },
        cost: { today: waterTodayCost, month: waterMonthCost, all: waterAllCost },
        sources: waterSources
      };
      if (res.health.data) healthSum += (res.health.data as number);
      if (res.attention.data) attentionArr.push(...(res.attention.data as any[]));
      
      if (res.funnel.data) {
        (res.funnel.data as any[]).forEach(fItem => {
          funnelCounts[fItem.status_label] = (funnelCounts[fItem.status_label] || 0) + fItem.ticket_count;
        });
      }
      
      if (res.ppm.data) {
        pTotal += res.ppm.data.total ?? 0;
        pDone += res.ppm.data.done ?? 0;
        pPending += res.ppm.data.pending ?? 0;
        pOverdue += res.ppm.data.overdue ?? 0;
        pPostponed += res.ppm.data.postponed ?? 0;
      }
    });

    const ppmSchedulesArr = perPropResults.flatMap(res => res.ppmSchedules?.data ?? []);

    const aggElecStats = perPropResults.reduce((acc, res) => {
      acc.today += (res as any).elecStats?.today || 0;
      acc.month += (res as any).elecStats?.month || 0;
      acc.all += (res as any).elecStats?.all || 0;
      return acc;
    }, { today: 0, month: 0, all: 0 });

    const aggDieselStats = perPropResults.reduce((acc, res) => {
      acc.today += (res as any).dieselStats?.today || 0;
      acc.month += (res as any).dieselStats?.month || 0;
      acc.all += (res as any).dieselStats?.all || 0;
      return acc;
    }, { today: 0, month: 0, all: 0 });

    const aggWaterStats = perPropResults.reduce((acc, res) => {
      acc.qty.today += (res as any).waterStats?.qty?.today || 0;
      acc.qty.month += (res as any).waterStats?.qty?.month || 0;
      acc.qty.all += (res as any).waterStats?.qty?.all || 0;
      acc.cost.today += (res as any).waterStats?.cost?.today || 0;
      acc.cost.month += (res as any).waterStats?.cost?.month || 0;
      acc.cost.all += (res as any).waterStats?.cost?.all || 0;
      
      const wSources = (res as any).waterStats?.sources;
      if (wSources) {
        (['today', 'month', 'all'] as const).forEach(period => {
          Object.keys(wSources[period] || {}).forEach(sType => {
            if (!acc.sources[period][sType]) acc.sources[period][sType] = { count: 0, cost: 0, qty: 0 };
            acc.sources[period][sType].count += wSources[period][sType].count;
            acc.sources[period][sType].cost += wSources[period][sType].cost;
            acc.sources[period][sType].qty += wSources[period][sType].qty;
          });
        });
      }
      return acc;
    }, { 
      qty: { today: 0, month: 0, all: 0 }, 
      cost: { today: 0, month: 0, all: 0 },
      sources: { 
        today: {} as Record<string, { count: number, cost: number, qty: number }>, 
        month: {} as Record<string, { count: number, cost: number, qty: number }>, 
        all: {} as Record<string, { count: number, cost: number, qty: number }> 
      }
    });

    // Derive final fields
    const healthScore = propIds.length > 0 ? Math.round(healthSum / propIds.length) : 100;
    const sortedAttention = attentionArr.sort((a, b) => {
      const score = (sev: string) => sev === 'critical' ? 3 : sev === 'high' ? 2 : 1;
      return score(b.severity) - score(a.severity);
    }).slice(0, 10);
    const ticketFunnel = Object.entries(funnelCounts).map(([status_label, ticket_count]) => ({ status_label, ticket_count }));
    const tenantData = tenantUsersRes?.data || [];
    const tenantUserIds = tenantData.map((t: any) => t.user_id).filter(Boolean);

    // --- RETURN PAYLOAD ---
    const dashboardData = {
      propertyId,
      propertyName: propRes?.data?.name ?? "",
      propertyLogoUrl: propRes?.data?.image_url ?? null,
      tickets: ticketRes.data ?? [],
      ticketCounts: {
        all: { total: countTotalAllRes?.count ?? 0, open: countOpenAllRes?.count ?? 0, closed: countClosedAllRes?.count ?? 0 },
        month: { total: countTotalMonthRes?.count ?? 0, open: countOpenMonthRes?.count ?? 0, closed: countClosedMonthRes?.count ?? 0 },
        today: { total: countTotalTodayRes?.count ?? 0, open: countOpenTodayRes?.count ?? 0, closed: countClosedTodayRes?.count ?? 0 },
      },
      sopTotal: sopTemplatesRes.count ?? 0,
      sopCount: sopCompletionsRes.count ?? 0,
      energyKwh: Math.round(aggElecStats.month),
      energyStats: {
        today: Math.round(aggElecStats.today),
        month: Math.round(aggElecStats.month),
        all: Math.round(aggElecStats.all)
      },
      energyTrend: elecTrendCount > 0 ? Math.round(elecTrendSum / elecTrendCount) : 0,
      healthScore,
      attentionItems: sortedAttention,
      ticketFunnel,
      vmsStats,
      vendorStats,
      dieselStats: {
        level: dieselCount > 0 ? Math.round(totalDieselLevel / dieselCount) : 0,
        consumption: {
          today: Math.round(aggDieselStats.today),
          month: Math.round(aggDieselStats.month),
          all: Math.round(aggDieselStats.all)
        }
      },
      waterStats: {
        quantity: {
          today: Math.round(aggWaterStats.qty.today),
          month: Math.round(aggWaterStats.qty.month),
          all: Math.round(aggWaterStats.qty.all)
        },
        cost: {
          today: Math.round(aggWaterStats.cost.today),
          month: Math.round(aggWaterStats.cost.month),
          all: Math.round(aggWaterStats.cost.all)
        },
        sources: aggWaterStats.sources
      },
      ppm: {
        total: pTotal,
        done: pDone,
        pending: pPending,
        overdue: pOverdue,
        postponed: pPostponed
      },
      ppmSchedules: ppmSchedulesArr,
      tenantUserIds,
      loadedPropertyId: propertyId,
      fetchedAt: Date.now(),
    };

    // 3. Store in Redis
    await setCache(cacheKey, dashboardData, CACHE_TTL.HOT);

    return NextResponse.json({ success: true, data: dashboardData, source: "db" });
  } catch (error) {
    console.error("[saas-mobile-server] property-admin dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
