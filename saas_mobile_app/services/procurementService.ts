import { serverApi } from '@/lib/serverApi';

export interface MaterialRequest {
  id: string;
  ticket_id: string;
  status: string;
  requested_by: string;
  assignee_uid: string;
  created_at: string;
  updated_at: string;
  delivered_at?: string;
  total_amount?: number;
  total_estimated_cost?: number;
  quotation_file_url?: string;
  items?: any[];
  line_items?: any[];
  ticket?: {
      ticket_number: string;
      title: string;
      priority: string;
      description?: string;
  };
  property?: {
      id: string;
      name: string;
  };
  requester?: {
      full_name: string;
  };
  assignee?: {
      full_name: string;
  };
}

export interface ProcurementActivityLog {
  id: string;
  material_request_id: string;
  procurement_order_id?: string;
  user_id: string;
  action: string;
  old_value?: string;
  new_value?: string;
  metadata?: any;
  created_at: string;
  user?: { full_name: string };
  material_request?: {
    property_id: string;
    ticket?: { ticket_number: string; title: string };
  };
}

/**
 * Service for Procurement module via mobile Fastify server
 */
export const procurementService = {
  /**
   * Fetch material requests for a specific property
   */
  async fetchRequests(propertyId: string): Promise<MaterialRequest[]> {
    if (!propertyId || propertyId === 'undefined' || propertyId === 'all') return [];
    
    // Equivalent to /api/procurement/requests
    const res = await serverApi.query<MaterialRequest[]>({
      table: 'material_requests',
      action: 'select',
      select: `
        *,
        ticket:tickets(ticket_number, title, priority, description),
        property:properties(id, name),
        requester:users!requested_by(full_name),
        assignee:users!assignee_uid(full_name)
      `,
      filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      orders: [{ column: 'created_at', ascending: false }]
    });

    if (res.error) {
      console.error('[procurementService] fetchRequests error:', res.error);
      throw new Error(res.error.message || 'Failed to fetch material requests');
    }

    return res.data || [];
  },

  /**
   * Fetch procurement activity logs
   */
  async fetchLogs(propertyId: string): Promise<ProcurementActivityLog[]> {
    if (!propertyId || propertyId === 'undefined' || propertyId === 'all') return [];

    const res = await serverApi.query<ProcurementActivityLog[]>({
      table: 'procurement_activity_log',
      action: 'select',
      select: `
        *,
        user:users!user_id(full_name),
        material_request:material_requests!inner(
          property_id,
          ticket:tickets(ticket_number, title)
        )
      `,
      filters: [{ op: 'eq', column: 'material_requests.property_id', value: propertyId }],
      orders: [{ column: 'created_at', ascending: false }]
    });

    if (res.error) {
      console.error('[procurementService] fetchLogs error:', res.error);
      throw new Error(res.error.message || 'Failed to fetch procurement logs');
    }

    return res.data || [];
  },

  /**
   * Update material request status
   */
  async updateRequestStatus(
    requestId: string, 
    status: string, 
    quotedPrice?: number, 
    quotationFileUrl?: string
  ): Promise<boolean> {
    const res = await serverApi.rpc<{ success: boolean }>('procurement_update_status', {
      p_request_id: requestId,
      p_status: status,
      p_quoted_price: quotedPrice,
      p_quotation_url: quotationFileUrl
    });

    if (res.error) {
      console.error('[procurementService] updateRequestStatus error:', res.error);
      throw new Error(res.error.message || 'Failed to update request status');
    }

    return true;
  },

  /**
   * Fetch procurement users
   */
  async fetchProcurementUsers(propertyId: string) {
    if (!propertyId || propertyId === 'undefined' || propertyId === 'all') return [];

    const res = await serverApi.query<{ user_id: string; user: { id: string; full_name: string } }[]>({
      table: 'property_memberships',
      action: 'select',
      select: 'user_id, user:users!user_id(id, full_name)',
      filters: [
        { op: 'eq', column: 'property_id', value: propertyId },
        { op: 'eq', column: 'role', value: 'procurement' },
        { op: 'eq', column: 'is_active', value: true }
      ]
    });

    if (res.error) {
      console.error('[procurementService] fetchProcurementUsers error:', res.error);
      throw new Error(res.error.message || 'Failed to fetch procurement users');
    }

    return res.data?.map(m => m.user) || [];
  }
};
