import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageOrganization } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }
    const organizationId = searchParams.get("organizationId");
    const search = searchParams.get("search");
    const category = searchParams.get("category");

    if (!propertyId && !organizationId) {
      return NextResponse.json({ error: "propertyId or organizationId is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Resolve organization_id from property if needed
    let orgId = organizationId;
    if (propertyId && !orgId) {
      const access = await getPropertyAccess(auth.user.id, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { data: prop } = await admin.from("properties").select("organization_id").eq("id", propertyId).maybeSingle();
      orgId = prop?.organization_id;
    } else if (organizationId) {
      if (!(await canManageOrganization(auth.user.id, organizationId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (!orgId) {
      return NextResponse.json({ error: "Could not resolve organization" }, { status: 400 });
    }

    let query = admin
      .from("procurement_catalog")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[saas-mobile-server] procurement catalog GET error:", error);
      return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
    }

    // ── Fallback to stock_items if procurement_catalog is empty ───────────
    let items = data ?? [];
    if (items.length === 0) {
      let sq = admin
        .from("stock_items")
        .select("id, name, description, category, unit, per_unit_cost, quantity, property_id, organization_id, created_at, updated_at")
        .eq("organization_id", orgId)
        .order("name", { ascending: true });

      if (propertyId) {
        sq = sq.eq("property_id", propertyId);
      }
      if (search) {
        sq = sq.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }
      if (category && category !== "all") {
        sq = sq.eq("category", category);
      }

      const { data: stockData, error: stockError } = await sq;
      if (!stockError && stockData && stockData.length > 0) {
        items = stockData.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          photo_url: null,
          category: item.category,
          estimated_price: item.per_unit_cost ?? 0,
          unit: item.unit ?? 'pcs',
          is_active: true,
          organization_id: item.organization_id,
          created_at: item.created_at,
          updated_at: item.updated_at,
          _source: 'stock_items',
        }));
      }
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[saas-mobile-server] procurement catalog GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
