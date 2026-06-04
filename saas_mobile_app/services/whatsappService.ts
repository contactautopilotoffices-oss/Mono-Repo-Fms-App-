/**
 * WhatsApp Service - Mobile WhatsApp Notification Service
 *
 * Uses WasenderAPI (same as web app) for sending WhatsApp notifications.
 *
 * Features:
 * - Send to user by ID (auto-resolves phone from users table)
 * - Send to phone number directly
 * - Batch send to multiple users
 * - Message templates for different scenarios
 *
 * Environment variables needed:
 * - EXPO_PUBLIC_WHATSAPP_API_URL (WasenderAPI base URL)
 * - EXPO_PUBLIC_WHATSAPP_API_KEY
 * - EXPO_PUBLIC_WHATSAPP_SENDER_ID
 */

import { serverApi } from '@/lib/serverApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppOptions {
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'document';
  preview?: boolean;
}

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UserPhone {
  id: string;
  user_id?: string;
  phone?: string;
  full_name?: string;
  email?: string;
  user_metadata?: { phone?: string; full_name?: string };
}

// ---------------------------------------------------------------------------
// Message Templates
// ---------------------------------------------------------------------------

export const WhatsAppTemplates = {
  // Visitor Check-in - Send to Host
  visitorCheckIn: (data: {
    visitorName: string;
    checkInTime: string;
    purpose?: string;
    hostName: string;
  }) => `🏢 *New Visitor Alert*

Hi ${data.hostName},

A visitor has checked in to meet you.

👤 *Visitor:* ${data.visitorName}
⏰ *Time:* ${data.checkInTime}
📋 *Purpose:* ${data.purpose || 'General Visit'}

Please proceed to reception.

- Autopilot Office`,

  // Room Booking Confirmation
  roomBooking: (data: {
    roomName: string;
    bookedBy: string;
    dateTime: string;
    duration: string;
    propertyName: string;
  }) => `🏢 *Meeting Room Booked*

Hi ${data.bookedBy},

Your meeting room has been confirmed.

📅 *Room:* ${data.roomName}
📍 *Property:* ${data.propertyName}
⏰ *Time:* ${data.dateTime}
⏱ *Duration:* ${data.duration}

Please arrive 5 minutes early.

- Autopilot Office`,

  // Room Booking - Notify Property Admin
  roomBookingAdmin: (data: {
    roomName: string;
    bookedBy: string;
    dateTime: string;
    attendees: number;
    propertyName: string;
  }) => `🏢 *Room Booking Alert*

A new room booking has been made at ${data.propertyName}.

📅 *Room:* ${data.roomName}
👤 *Booked by:* ${data.bookedBy}
⏰ *Time:* ${data.dateTime}
👥 *Attendees:* ${data.attendees}

- Autopilot Office`,

  // Material Request Created - Notify Procurement
  materialRequest: (data: {
    requestId: string;
    itemName: string;
    quantity: string;
    requestedBy: string;
    priority: string;
    propertyName: string;
  }) => `📦 *New Material Request*

A new procurement request has been submitted.

🔖 *Request ID:* ${data.requestId}
📍 *Property:* ${data.propertyName}
📝 *Item:* ${data.itemName}
📊 *Quantity:* ${data.quantity}
⚡ *Priority:* ${data.priority}
👤 *Requested by:* ${data.requestedBy}

Please review and process.

- Autopilot Office`,

  // Material Request - Notify Super Admin
  materialRequestAdmin: (data: {
    requestId: string;
    itemName: string;
    estimatedCost?: string;
    propertyName: string;
  }) => `📦 *Material Request Pending Approval*

A material request requires your attention.

🔖 *Request ID:* ${data.requestId}
📍 *Property:* ${data.propertyName}
📝 *Item:* ${data.itemName}
💰 *Est. Cost:* ${data.estimatedCost || 'TBD'}

Please approve/reject.

- Autopilot Office`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return '91' + digits;
  }
  return digits;
}

// ---------------------------------------------------------------------------
// WhatsApp Service
// ---------------------------------------------------------------------------

export const whatsappService = {
  /**
   * Send WhatsApp message to a user by their ID
   */
  async sendToUser(userId: string, options: WhatsAppOptions): Promise<WhatsAppResult> {
    try {
      const userRes = await serverApi.query<UserPhone[]>({
        table: 'users',
        action: 'select',
        select: 'id, phone, user_metadata',
        filters: [{ op: 'eq', column: 'id', value: userId }],
        limit: 1,
      });

      if (userRes.error) {
        return { success: false, error: userRes.error.message };
      }

      const user = userRes.data?.[0];
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const phone = user.user_metadata?.phone || user.phone;
      if (!phone) {
        return { success: false, error: 'User has no phone number' };
      }

      return this.sendToPhone(phone, options);
    } catch (err: any) {
      console.error('[WhatsApp] sendToUser error:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Send WhatsApp message to multiple users
   */
  async sendToUsers(userIds: string[], options: WhatsAppOptions): Promise<void> {
    const promises = userIds.map(userId => this.sendToUser(userId, options));
    await Promise.all(promises);
  },

  /**
   * Send WhatsApp message directly to a phone number
   */
  async sendToPhone(phone: string, options: WhatsAppOptions): Promise<WhatsAppResult> {
    try {
      const formattedPhone = formatPhone(phone);
      const apiUrl = process.env.EXPO_PUBLIC_WHATSAPP_API_URL;
      const apiKey = process.env.EXPO_PUBLIC_WHATSAPP_API_KEY;
      const senderId = process.env.EXPO_PUBLIC_WHATSAPP_SENDER_ID;

      if (!apiUrl || !apiKey || !senderId) {
        console.warn('[WhatsApp] API not configured, skipping message');
        return { success: false, error: 'WhatsApp API not configured' };
      }

      const response = await fetch(`${apiUrl}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          number: formattedPhone,
          sender: senderId,
          message: options.message,
          priority: 10,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[WhatsApp] API error:', error);
        return { success: false, error };
      }

      const result = await response.json();
      return { success: true, messageId: result.id };
    } catch (err: any) {
      console.error('[WhatsApp] sendToPhone error:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Notify host when visitor checks in
   */
  async notifyHostOnVisitorCheckIn(payload: {
    visitorName: string;
    checkInTime: string;
    purpose?: string;
    hostUserId: string;
  }): Promise<WhatsAppResult> {
    const message = WhatsAppTemplates.visitorCheckIn({
      visitorName: payload.visitorName,
      checkInTime: payload.checkInTime,
      purpose: payload.purpose,
      hostName: '',
    });

    return this.sendToUser(payload.hostUserId, { message });
  },

  /**
   * Notify property admin on room booking
   */
  async notifyAdminsOnRoomBooking(payload: {
    roomName: string;
    bookedBy: string;
    dateTime: string;
    duration: string;
    attendees: number;
    propertyId: string;
  }): Promise<void> {
    try {
      const adminRes = await serverApi.query<{ user_id: string }[]>({
        table: 'property_memberships',
        action: 'select',
        select: 'user_id',
        filters: [
          { op: 'eq', column: 'property_id', value: payload.propertyId },
          { op: 'in', column: 'role', values: ['property_admin', 'admin', 'org_admin', 'owner'] },
        ],
      });

      if (adminRes.error || !adminRes.data || adminRes.data.length === 0) {
        console.warn('[WhatsApp] No admins found for room booking notification');
        return;
      }

      const adminIds = adminRes.data.map(a => a.user_id);
      const message = WhatsAppTemplates.roomBookingAdmin({
        roomName: payload.roomName,
        bookedBy: payload.bookedBy,
        dateTime: payload.dateTime,
        attendees: payload.attendees,
        propertyName: '',
      });

      await this.sendToUsers(adminIds, { message });
    } catch (err) {
      console.error('[WhatsApp] notifyAdminsOnRoomBooking error:', err);
    }
  },

  /**
   * Notify procurement users on material request
   */
  async notifyProcurementOnMaterialRequest(payload: {
    requestId: string;
    itemName: string;
    quantity: string;
    requestedBy: string;
    priority: string;
    propertyId: string;
  }): Promise<void> {
    try {
      const [procurementRes, adminRes] = await Promise.all([
        serverApi.query<{ user_id: string }[]>({
          table: 'property_memberships',
          action: 'select',
          select: 'user_id',
          filters: [
            { op: 'eq', column: 'property_id', value: payload.propertyId },
            { op: 'in', column: 'role', values: ['procurement', 'purchase_manager', 'purchase_executive'] },
          ],
        }),
        serverApi.query<{ user_id: string }[]>({
          table: 'property_memberships',
          action: 'select',
          select: 'user_id',
          filters: [
            { op: 'eq', column: 'property_id', value: payload.propertyId },
            { op: 'in', column: 'role', values: ['org_admin', 'owner', 'super_admin'] },
          ],
        }),
      ]);

      const procurementIds = (procurementRes.data ?? []).map(a => a.user_id);
      const adminIds = (adminRes.data ?? []).map(a => a.user_id);
      const allUserIds = Array.from(new Set([...procurementIds, ...adminIds]));

      if (allUserIds.length === 0) {
        console.warn('[WhatsApp] No procurement users found');
        return;
      }

      const message = WhatsAppTemplates.materialRequest({
        requestId: payload.requestId,
        itemName: payload.itemName,
        quantity: payload.quantity,
        requestedBy: payload.requestedBy,
        priority: payload.priority,
        propertyName: '',
      });

      await this.sendToUsers(allUserIds, { message });
    } catch (err) {
      console.error('[WhatsApp] notifyProcurementOnMaterialRequest error:', err);
    }
  },
};

export default whatsappService;
