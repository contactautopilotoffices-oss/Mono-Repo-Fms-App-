/**
 * Notification Service — Mobile Server API Integration
 *
 * Handles sending push notifications and fetching notification history.
 * Uses the mobile server (saas_mobileApp_server) for API calls.
 *
 * Base URL: https://fms-dev-saas-one.vercel.app (or EXPO_PUBLIC_MOBILE_SERVER_URL)
 */

import { getSupabaseToken } from '@/utils/api/mobileApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  user_id: string;
  ticket_id?: string | null;
  booking_id?: string | null;
  property_id?: string | null;
  organization_id?: string | null;
  notification_type: string;
  title: string;
  message: string;
  deep_link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SendNotificationPayload {
  userId?: string;
  userIds?: string[];
  role?: string;
  propertyId?: string;
  organizationId?: string;
  type: string;
  title: string;
  message: string;
  deepLink?: string;
  ticketId?: string;
  bookingId?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

// Mobile server base URL
const getBaseUrl = () => process.env.EXPO_PUBLIC_MOBILE_SERVER_URL || 'https://fms-dev-saas-one.vercel.app';

// ---------------------------------------------------------------------------
// Notification type constants (matches server)
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = {
  // Tickets
  TICKET_CREATED: 'ticket_created',
  TICKET_ASSIGNED: 'ticket_assigned',
  TICKET_UPDATED: 'ticket_updated',
  TICKET_RESOLVED: 'ticket_resolved',
  TICKET_CLOSED: 'ticket_closed',
  TICKET_SLA_BREACHED: 'ticket_sla_breached',
  TICKET_COMMENTED: 'ticket_commented',

  // PPM (Planned Preventive Maintenance)
  PPM_DUE: 'ppm_due',
  PPM_OVERDUE: 'ppm_overdue',
  PPM_COMPLETED: 'ppm_completed',

  // Material Requests
  MATERIAL_REQUEST_CREATED: 'material_request_created',
  MATERIAL_REQUEST_APPROVED: 'material_request_approved',
  MATERIAL_REQUEST_REJECTED: 'material_request_rejected',

  // Meeting Rooms
  MEETING_ROOM_BOOKED: 'meeting_room_booked',
  MEETING_ROOM_CANCELLED: 'meeting_room_cancelled',
  MEETING_ROOM_REMINDER: 'meeting_room_reminder',

  // Visitors
  VISITOR_CHECKIN: 'visitor_checkin',
  VISITOR_CHECKOUT: 'visitor_checkout',
  VISITOR_EXPECTED: 'visitor_expected',

  // Shifts
  SHIFT_STARTED: 'shift_started',
  SHIFT_ENDED: 'shift_ended',
  SHIFT_REMINDER: 'shift_reminder',

  // General
  ANNOUNCEMENT: 'announcement',
  SYSTEM_ALERT: 'system_alert',
} as const;

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getSupabaseToken();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Send push notification
// ---------------------------------------------------------------------------

export async function sendPushNotification(
  payload: SendNotificationPayload
): Promise<{ success?: boolean; notificationsCreated?: number; pushNotificationsSent?: number; error?: string }> {
  try {
    const result = await apiRequest<{ success: boolean; notificationsCreated: number; pushNotificationsSent: number }>(
      '/api/notifications/send',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return result;
  } catch (err: any) {
    console.error('[notificationService] sendPushNotification:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Send ticket notification to assigned staff
// ---------------------------------------------------------------------------

export async function notifyTicketAssigned(
  ticketId: string,
  ticketNumber: string,
  ticketTitle: string,
  assignedUserId: string,
  propertyId: string,
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL'
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId: assignedUserId,
    propertyId,
    type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
    title: `New Ticket Assigned: ${ticketNumber}`,
    message: ticketTitle,
    deepLink: `/property/${propertyId}/tickets/${ticketId}`,
    ticketId,
    priority,
  });
}

// ---------------------------------------------------------------------------
// Send ticket created notification
// ---------------------------------------------------------------------------

export async function notifyTicketCreated(
  ticketId: string,
  ticketNumber: string,
  ticketTitle: string,
  createdByUserId: string,
  propertyId: string,
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL'
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId: createdByUserId,
    propertyId,
    type: NOTIFICATION_TYPES.TICKET_CREATED,
    title: `Ticket Created: ${ticketNumber}`,
    message: `Your ticket "${ticketTitle}" has been submitted`,
    deepLink: `/property/${propertyId}/tickets/${ticketId}`,
    ticketId,
    priority,
  });
}

// ---------------------------------------------------------------------------
// Send PPM notification
// ---------------------------------------------------------------------------

export async function notifyPPMDue(
  ppmId: string,
  systemName: string,
  plannedDate: string,
  userId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId,
    propertyId,
    type: NOTIFICATION_TYPES.PPM_DUE,
    title: 'PPM Due Today',
    message: `${systemName} maintenance is scheduled for ${plannedDate}`,
    deepLink: `/property/${propertyId}/ppm/${ppmId}`,
    priority: 'NORMAL',
  });
}

export async function notifyPPMOverdue(
  ppmId: string,
  systemName: string,
  plannedDate: string,
  userId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId,
    propertyId,
    type: NOTIFICATION_TYPES.PPM_OVERDUE,
    title: 'PPM Overdue',
    message: `${systemName} maintenance was due on ${plannedDate} and is now overdue`,
    deepLink: `/property/${propertyId}/ppm/${ppmId}`,
    priority: 'HIGH',
  });
}

// ---------------------------------------------------------------------------
// Send visitor notification
// ---------------------------------------------------------------------------

export async function notifyVisitorCheckin(
  visitorId: string,
  visitorName: string,
  _hostName: string,
  hostUserId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId: hostUserId,
    propertyId,
    type: NOTIFICATION_TYPES.VISITOR_CHECKIN,
    title: 'Visitor Arrived',
    message: `${visitorName} has checked in and is waiting for you`,
    deepLink: `/property/${propertyId}/visitors/${visitorId}`,
    priority: 'NORMAL',
  });
}

export async function notifyVisitorExpected(
  visitorId: string,
  visitorName: string,
  expectedTime: string,
  hostUserId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId: hostUserId,
    propertyId,
    type: NOTIFICATION_TYPES.VISITOR_EXPECTED,
    title: 'Expected Visitor',
    message: `${visitorName} is expected at ${expectedTime}`,
    deepLink: `/property/${propertyId}/visitors/${visitorId}`,
    priority: 'NORMAL',
  });
}

// ---------------------------------------------------------------------------
// Send meeting room notification
// ---------------------------------------------------------------------------

export async function notifyMeetingRoomBooked(
  bookingId: string,
  roomName: string,
  startTime: string,
  userId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId,
    propertyId,
    type: NOTIFICATION_TYPES.MEETING_ROOM_BOOKED,
    title: 'Room Booked',
    message: `Your booking for ${roomName} starts at ${startTime}`,
    deepLink: `/property/${propertyId}/rooms/${bookingId}`,
    bookingId,
    priority: 'NORMAL',
  });
}

export async function notifyMeetingRoomReminder(
  bookingId: string,
  roomName: string,
  startTime: string,
  userId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId,
    propertyId,
    type: NOTIFICATION_TYPES.MEETING_ROOM_REMINDER,
    title: 'Meeting Reminder',
    message: `Your meeting in ${roomName} starts in 15 minutes at ${startTime}`,
    deepLink: `/property/${propertyId}/rooms/${bookingId}`,
    bookingId,
    priority: 'NORMAL',
  });
}

// ---------------------------------------------------------------------------
// Send material request notification
// ---------------------------------------------------------------------------

export async function notifyMaterialRequestCreated(
  requestId: string,
  itemName: string,
  requestedBy: string,
  approverUserId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId: approverUserId,
    propertyId,
    type: NOTIFICATION_TYPES.MATERIAL_REQUEST_CREATED,
    title: 'Material Request Pending',
    message: `${requestedBy} has requested: ${itemName}`,
    deepLink: `/property/${propertyId}/stock/${requestId}`,
    priority: 'NORMAL',
  });
}

export async function notifyMaterialRequestApproved(
  requestId: string,
  itemName: string,
  requesterUserId: string,
  propertyId: string
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    userId: requesterUserId,
    propertyId,
    type: NOTIFICATION_TYPES.MATERIAL_REQUEST_APPROVED,
    title: 'Request Approved',
    message: `Your request for ${itemName} has been approved`,
    deepLink: `/property/${propertyId}/stock/${requestId}`,
    priority: 'NORMAL',
  });
}

// ---------------------------------------------------------------------------
// Fetch notifications for user
// ---------------------------------------------------------------------------

export async function fetchNotifications(
  userId: string,
  propertyId?: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ notifications?: AppNotification[]; count?: number; error?: string }> {
  try {
    const params = new URLSearchParams({ userId, limit: String(limit), offset: String(offset) });
    if (propertyId) params.set('propertyId', propertyId);

    const result = await apiRequest<{ notifications: AppNotification[]; count: number }>(
      `/api/notifications?${params.toString()}`
    );
    return {
      notifications: result.notifications || [],
      count: result.count || 0,
    };
  } catch (err: any) {
    console.error('[notificationService] fetchNotifications:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Mark notification as read
// ---------------------------------------------------------------------------

export async function markNotificationRead(
  notificationId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    await apiRequest<{ success: boolean }>(
      `/api/notifications/${notificationId}/read`,
      { method: 'PATCH' }
    );
    return { success: true };
  } catch (err: any) {
    console.error('[notificationService] markNotificationRead:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Get unread notification count
// ---------------------------------------------------------------------------

export async function getUnreadCount(
  userId: string
): Promise<{ count?: number; error?: string }> {
  try {
    const result = await apiRequest<{ unreadCount: number }>(
      `/api/notifications/unread-count?userId=${userId}`
    );
    return { count: result.unreadCount || 0 };
  } catch (err: any) {
    console.error('[notificationService] getUnreadCount:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Mark all notifications as read
// ---------------------------------------------------------------------------

export async function markAllNotificationsRead(
  userId: string,
  propertyId?: string
): Promise<{ success?: boolean; markedRead?: number; error?: string }> {
  try {
    const result = await apiRequest<{ success: boolean; markedRead: number }>(
      '/api/notifications/read-all',
      {
        method: 'POST',
        body: JSON.stringify({ userId, propertyId }),
      }
    );
    return { success: true, markedRead: result.markedRead || 0 };
  } catch (err: any) {
    console.error('[notificationService] markAllNotificationsRead:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Broadcast notification to role at property
// ---------------------------------------------------------------------------

export async function notifyPropertyRole(
  role: string,
  propertyId: string,
  type: string,
  title: string,
  message: string,
  deepLink?: string,
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL'
): Promise<{ success?: boolean; error?: string }> {
  return sendPushNotification({
    role,
    propertyId,
    type,
    title,
    message,
    deepLink,
    priority,
  });
}