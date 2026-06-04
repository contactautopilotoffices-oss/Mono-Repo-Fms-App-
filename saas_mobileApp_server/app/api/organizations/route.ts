import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: organizations, error } = await admin
      .from("organizations")
      .select("id, name, code")
      .order("name", { ascending: true });

    if (error) {
      console.error("[organizations] error:", error);
      return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: organizations ?? [] });
  } catch (error) {
    console.error("[organizations] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
