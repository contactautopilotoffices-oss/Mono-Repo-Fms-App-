import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAnonClient } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user || !auth.token) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAnonClient(auth.token);
    const body = await request.json();
    const { completionId, items, checked, ticketId, templateTitle, templateId } = body;

    if (!completionId) {
      return NextResponse.json({ error: "Missing completionId" }, { status: 400 });
    }

    // Update completion status
    const { error: updateError } = await supabase
      .from('sop_completions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: auth.user.id
      })
      .eq('id', completionId);

    if (updateError) {
      console.error("[sop/completions] update error:", updateError);
      return NextResponse.json({ error: "Failed to update completion" }, { status: 500 });
    }

    // Upsert per-item completion records
    if (items && items.length > 0) {
      const completionItems = items.map((item: any) => ({
        completion_id: completionId,
        checklist_item_id: item.id,
        is_completed: checked?.has(item.id) || false,
        completed_by: checked?.has(item.id) ? auth.user.id : null,
        completed_at: checked?.has(item.id) ? new Date().toISOString() : null,
      }));

      const { error: itemsError } = await supabase
        .from('sop_completion_items')
        .upsert(completionItems);

      if (itemsError) {
        console.error("[sop/completions] upsert items error:", itemsError);
      }
    }

    // Log to ticket_activity_log if a ticket is linked
    if (ticketId && auth.user.id) {
      const { error: logError } = await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: ticketId,
          user_id: auth.user.id,
          action: 'sop_checklist_completed',
          new_value: templateTitle || templateId || 'SOP checklist completed',
        });

      if (logError) {
        console.error("[sop/completions] log error:", logError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[sop/completions] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
