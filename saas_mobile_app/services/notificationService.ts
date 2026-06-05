/**
 * Notification Service
 * Fetches and manages notifications from the notifications table.
 * Push tokens are stored separately via usePushNotifications hook.
 */

import { serverApi } from '@/lib/serverApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  user_id: string;
  ticket_id?: string;
  booking_id?: string;
  property_id?: string;
  organization_id?: string;
  notification_type: string;
  title: string;
  message: string;
  deep_link?: string;
  is_read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Fetch notifications for current user
// ---------------------------------------------------------------------------

export async function fetchNotifications(
  userId: string,
  limit: number = 20
): Promise<{ notifications?: AppNotification[]; error?: string }> {
  try {
    const { data, error } = await serverApi.query<AppNotification[]>({
      table: 'notifications',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'user_id', value: userId }],
      orders: [{ column: 'created_at', ascending: false }],
      limit,
    });

    if (error) throw new Error(error.message);
    return { notifications: (data ?? []) as AppNotification[] };
  } catch (err: any) {
    console.error('[notificationService] fetchNotifications:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Mark notification as read
// ---------------------------------------------------------------------------

export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<{ error?: string }> {
  try {
    const { error } = await serverApi.query({
      table: 'notifications',
      action: 'update',
      values: { is_read: true },
      filters: [
        { op: 'eq', column: 'id', value: notificationId },
        { op: 'eq', column: 'user_id', value: userId },
      ],
    });

    if (error) throw new Error(error.message);
    return {};
  } catch (err: any) {
    console.error('[notificationService] markNotificationRead:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Mark all notifications as read
// ---------------------------------------------------------------------------

export async function markAllNotificationsRead(
  userId: string
): Promise<{ error?: string }> {
  try {
    const { error } = await serverApi.query({
      table: 'notifications',
      action: 'update',
      values: { is_read: true },
      filters: [{ op: 'eq', column: 'user_id', value: userId }],
    });

    if (error) throw new Error(error.message);
    return {};
  } catch (err: any) {
    console.error('[notificationService] markAllNotificationsRead:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Get unread count
// ---------------------------------------------------------------------------

export async function getUnreadCount(
  userId: string
): Promise<{ count?: number; error?: string }> {
  try {
    const { data, error } = await serverApi.query<{ count: number }[]>({
      table: 'notifications',
      action: 'select',
      select: 'id',
      filters: [
        { op: 'eq', column: 'user_id', value: userId },
        { op: 'eq', column: 'is_read', value: false },
      ],
    });

    if (error) throw new Error(error.message);
    return { count: (data ?? []).length };
  } catch (err: any) {
    console.error('[notificationService] getUnreadCount:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Extract deep link from notification data
// ---------------------------------------------------------------------------

export function extractDeepLink(notification: AppNotification): string | null {
  if (notification.deep_link) {
    return `/property/${notification.property_id || 'all'}${notification.deep_link}`;
  }
  if (notification.ticket_id) {
    return `/property/${notification.property_id || 'all'}/tickets/${notification.ticket_id}`;
  }
  if (notification.booking_id) {
    return `/property/${notification.property_id || 'all'}/rooms`;
  }
  return null;
}
