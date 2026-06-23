import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAnonClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/tickets/[id]/validate
 * Tenant/client validates a ticket that is pending validation
 * Action: approve (resolved) or reject (open)
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user || !auth.token) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: ticketId } = await context.params;
    if (!ticketId) {
      return NextResponse.json({ error: "Ticket id is required" }, { status: 400 });
    }

    const supabase = createAnonClient(auth.token);
    const admin = createAdminClient();

    // Fetch current ticket
    const { data: ticket, error: ticketError } = await admin
      .from("tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Verify property access
    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check ticket is pending validation
    if (ticket.status !== "pending_validation") {
      return NextResponse.json({
        error: "Ticket is not pending validation"
      }, { status: 400 });
    }

    // Verify user is a tenant (client) in this property
    const { data: membership, error: memberError } = await admin
      .from("property_memberships")
      .select("role")
      .eq("property_id", ticket.property_id)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (memberError || !membership) {
      return NextResponse.json({
        error: "You are not a member of this property"
      }, { status: 403 });
    }

    const userRole = membership.role?.toUpperCase();
    if (userRole !== "TENANT" && userRole !== "CLIENT") {
      return NextResponse.json({
        error: "Only tenants can validate tickets"
      }, { status: 403 });
    }

    const body = await request.json();
    const { approved, validation_note } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json({
        error: "Field 'approved' (boolean) is required"
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      validated_by: auth.user.id,
      validated_at: now,
      validation_status: approved ? "approved" : "rejected",
      updated_at: now,
    };

    if (approved) {
      updates.status = "resolved";
    } else {
      updates.status = "open";
      updates.resolved_at = null;
      if (validation_note) {
        updates.validation_note = validation_note;
      }
    }

    // Update ticket
    const { data: updatedTicket, error: updateError } = await admin
      .from("tickets")
      .update(updates)
      .eq("id", ticketId)
      .select()
      .single();

    if (updateError) {
      console.error("[tickets/[id]/validate] update error:", updateError);
      return NextResponse.json({ error: "Failed to validate ticket" }, { status: 500 });
    }

    // Log activity
    await admin.from("ticket_activity_log").insert({
      ticket_id: ticketId,
      performed_by: auth.user.id,
      action: approved ? "validated_approved" : "validated_rejected",
      old_value: "pending_validation",
      new_value: approved ? "resolved" : (validation_note || "rejected by client"),
    });

    // Send push notification to assigned MST
    if (ticket.assigned_to) {
      const { sendPushNotification, NOTIFICATION_TYPES } = await import("@/lib/notificationService");
      sendPushNotification({
        userId: ticket.assigned_to,
        propertyId: ticket.property_id,
        organizationId: ticket.organization_id,
        type: NOTIFICATION_TYPES.TICKET_CREATED,
        title: approved ? "Ticket Approved" : "Ticket Rejected",
        message: approved
          ? `Your work on "${ticket.title}" has been approved.`
          : `Your work on "${ticket.title}" was rejected. ${validation_note || "Please review."}`,
        ticketId: ticket.id,
        priority: "NORMAL",
      }).catch(err => console.warn("[Push] Failed to send notification:", err));
    }

    return NextResponse.json({
      success: true,
      ticket: updatedTicket,
      message: approved
        ? "Ticket approved and marked as resolved"
        : "Ticket rejected and reopened",
      approved
    });
  } catch (error) {
    console.error("[tickets/[id]/validate] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
