/**
 * Tool Layer — validated server API implementations for the voice pipeline.
 */

import { apiFetch } from '@/utils/api/mobileApi';

// ---------------------------------------------------------------------------
// Tool result types
// ---------------------------------------------------------------------------
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Ticket tools
// ---------------------------------------------------------------------------
export async function listTicketsTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const limit = Number(params.limit ?? 10);
    const status = params.status as string | undefined;

    const queryParams = new URLSearchParams({
      propertyId,
      limit: String(limit),
    });
    if (status) queryParams.set('status', status);

    const response = await apiFetch<{
      tickets?: Array<{
        id: string;
        ticket_number: string;
        title: string;
        status: string;
        priority: string;
        created_at: string;
      }>;
      total?: number;
      error?: string;
    }>(`/api/tickets?${queryParams.toString()}`);

    if (response.error) throw new Error(response.error);

    return { success: true, data: response.tickets ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getTicketStatusTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const ticketId = params.ticket_id as string | undefined;
    const status = params.status as string | undefined;

    const queryParams = new URLSearchParams({ propertyId });
    if (ticketId) queryParams.set('ticketId', ticketId);
    if (status) queryParams.set('status', status);

    const response = await apiFetch<{
      tickets?: Array<{
        id: string;
        ticket_number: string;
        title: string;
        status: string;
        priority: string;
        created_at: string;
      }>;
      error?: string;
    }>(`/api/tickets?${queryParams.toString()}`);

    if (response.error) throw new Error(response.error);

    return { success: true, data: response.tickets ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function createTicketTool(
  propertyId: string,
  organizationId: string,
  userId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const title = String(params.title ?? 'Voice-created ticket').slice(0, 200);
    const description = String(params.description ?? '');
    const priority = String(params.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'critical';

    const response = await apiFetch<{
      success?: boolean;
      ticket?: { id: string; ticket_number: string };
      classification?: {
        issue_code: string;
        skill_group: string;
        confidence: string;
        priority?: string;
      };
      error?: string;
    }>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        propertyId,
        organizationId,
        priority,
      }),
    });

    if (response.error) throw new Error(response.error);

    return { success: true, data: { id: response.ticket?.id, ticket_number: response.ticket?.ticket_number } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Meeting room tools
// ---------------------------------------------------------------------------
export async function listRoomsTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const capacity = Number(params.capacity ?? 0);

    const response = await apiFetch<{
      rooms?: Array<{
        id: string;
        name: string;
        capacity: number;
        location: string;
        status: string;
      }>;
      error?: string;
    }>(`/api/meeting-rooms/available?propertyId=${propertyId}`);

    if (response.error) throw new Error(response.error);

    let rooms = response.rooms ?? [];
    if (capacity > 0) {
      rooms = rooms.filter((r: any) => r.capacity >= capacity);
    }

    return { success: true, data: rooms };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function bookRoomTool(
  propertyId: string,
  userId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const roomId = params.room_id as string;
    const date = String(params.date ?? new Date().toISOString().split('T')[0]);
    const startTime = String(params.start_time ?? '09:00');
    const endTime = String(params.end_time ?? '10:00');

    if (!roomId) return { success: false, error: 'Room ID is required' };

    const bookingDateTime = new Date(`${date}T${startTime}`);
    if (bookingDateTime < new Date()) {
      return { success: false, error: 'Cannot book for a past date/time' };
    }

    const response = await apiFetch<{
      success?: boolean;
      booking?: any;
      error?: string;
    }>('/api/meeting-room-bookings', {
      method: 'POST',
      body: JSON.stringify({
        meetingRoomId: roomId,
        propertyId,
        date,
        startTime,
        endTime,
      }),
    });

    if (response.error) throw new Error(response.error);

    return { success: true, data: response.booking };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Visitor tools
// ---------------------------------------------------------------------------
export async function listVisitorsTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const limit = Number(params.limit ?? 5);

    const response = await apiFetch<{
      visitors?: Array<{
        id: string;
        name: string;
        visitor_id?: string;
        host_name?: string;
        check_in_time?: string;
        check_out_time?: string;
        purpose?: string;
        status?: string;
      }>;
      error?: string;
    }>(`/api/visitors?propertyId=${propertyId}&limit=${limit}`);

    if (response.error) throw new Error(response.error);

    return { success: true, data: response.visitors ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Property info tool
// ---------------------------------------------------------------------------
export async function getPropertyInfoTool(propertyId: string): Promise<ToolResult> {
  try {
    const response = await apiFetch<{
      property?: {
        name: string;
        address?: string;
      };
      error?: string;
    }>(`/api/properties/${propertyId}`);

    if (response.error) throw new Error(response.error);

    // Fetch ticket stats via tickets stats API
    let openCount = 0;
    let totalCount = 0;

    try {
      const statsResponse = await apiFetch<{
        stats?: {
          open?: number;
          total?: number;
        };
      }>(`/api/tickets/stats?propertyId=${propertyId}`);

      if (statsResponse.stats) {
        openCount = statsResponse.stats.open ?? 0;
        totalCount = statsResponse.stats.total ?? 0;
      }
    } catch {
      // Stats are optional, continue without them
    }

    return {
      success: true,
      data: {
        ...(response.property as Record<string, unknown>),
        openTicketCount: openCount,
        totalTicketCount: totalCount,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
