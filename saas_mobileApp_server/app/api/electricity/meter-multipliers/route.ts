import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const meterId = request.nextUrl.searchParams.get("meterId");
    if (!meterId) return NextResponse.json({ error: "Missing meterId" }, { status: 400 });

    const admin = createAdminClient();
    
    // Check access via meter's property
    const { data: meter } = await admin.from("electricity_meters").select("property_id").eq("id", meterId).single();
    if (!meter) return NextResponse.json({ error: "Meter not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, meter.property_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin.from("meter_multipliers").select("*").eq("meter_id", meterId).order("effective_from", { ascending: false });
    if (error) return NextResponse.json({ error: "Failed to fetch meter multipliers" }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] meter_multipliers GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const meterId = body.meterId || body.meter_id;
    if (!meterId || !body.effective_from) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const admin = createAdminClient();

    // Check access
    const { data: meter } = await admin.from("electricity_meters").select("property_id").eq("id", meterId).single();
    if (!meter) return NextResponse.json({ error: "Meter not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, meter.property_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const effectiveFrom = String(body.effective_from);
    const dayBefore = new Date(effectiveFrom);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split("T")[0];

    await admin
      .from("meter_multipliers")
      .update({ effective_to: dayBeforeStr })
      .eq("meter_id", meterId)
      .is("effective_to", null)
      .lt("effective_from", effectiveFrom);

    const { data, error } = await admin
      .from("meter_multipliers")
      .insert({
        meter_id: meterId,
        ct_ratio_primary: body.ct_ratio_primary ?? null,
        ct_ratio_secondary: body.ct_ratio_secondary ?? null,
        pt_ratio_primary: body.pt_ratio_primary ?? null,
        pt_ratio_secondary: body.pt_ratio_secondary ?? null,
        meter_constant: body.meter_constant ?? 1,
        effective_from: effectiveFrom,
        reason: body.reason ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
      
    if (error) return NextResponse.json({ error: "Failed to create multiplier" }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] meter_multipliers POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
