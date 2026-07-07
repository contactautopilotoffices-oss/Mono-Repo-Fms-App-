/**
 * Mobile API utility — calls the dedicated mobile server API routes.
 */
import { createClient } from '@/utils/supabase/client';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { serverApi } from '@/lib/serverApi';
import { fetchWithRetry } from './fetchWithRetry';

// ---------------------------------------------------------------------
// Supabase client-with-token (used for server-side API calls)
// ---------------------------------------------------------------------
import {
  createClientFromToken as _createClientFromToken,
  extractBearerToken as _extractBearerToken,
  getSupabaseToken as _getSupabaseToken,
  getCurrentUserId as _getCurrentUserId,
} from '@/utils/supabase/mobile-auth';

export const createClientFromToken = _createClientFromToken;
export const extractBearerToken = _extractBearerToken;
export const getSupabaseToken = _getSupabaseToken;
export const getCurrentUserId = _getCurrentUserId;

// ---------------------------------------------------------------------
// Mobile API base URL
// ---------------------------------------------------------------------
export const MOBILE_API_BASE = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL ?? 'http://192.168.0.224:3000';
// ---------------------------------------------------------------------
// Typed API Response shapes
// ---------------------------------------------------------------------
export interface TicketApiResponse {
  success?: boolean;
  ticket?: {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    raised_by: string;
    assigned_to?: string;
    skill_group_code?: string;
    issue_code?: string;
    confidence?: string;
    classification_source?: string;
    risk_flag?: string | null;
    llm_reasoning?: string | null;
  };
  error?: string;
  classification?: {
    issue_code: string;
    skill_group: string;
    confidence: string;
    isAutoClassified: boolean;
    status: string;
    assigned_to?: string;
    priority?: string | null;
    risk_flag?: string | null;
    reasoning?: string | null;
    enhancedClassification?: boolean;
    zone?: string;
    decisionSource?: string;
  };
}

export interface TicketListResponse {
  tickets?: Ticket[];
  total?: number;
  error?: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  raised_by: string;
  assigned_to?: string;
  category?: { id: string; code: string; name: string };
  assignee?: { id: string; full_name: string; email: string; user_photo_url?: string };
  property?: { id: string; name: string; code: string };
  organization?: { id: string; name: string; code: string };
}

export interface SuperTenantProperty {
  id: string;
  property_id: string;
  organization_id: string;
  assigned_by: string;
  created_at: string;
  properties: {
    id: string;
    name: string;
    code: string;
    status: string;
  };
}

export interface SuperTenantResponse {
  properties?: SuperTenantProperty[];
  error?: string;
}

// ---------------------------------------------------------------------
// Internal fetch helper with Bearer token
// ---------------------------------------------------------------------
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Next.js backend uses @supabase/ssr which requires cookies for auth.
  // We simulate the web cookie using the session data.
  if (sessionData?.session) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const projectIdMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (projectIdMatch) {
      const projectId = projectIdMatch[1];
      const cookieName = `sb-${projectId}-auth-token`;
      // @supabase/ssr expects JSON array with access_token & refresh_token
      const cookieValue = JSON.stringify([
        sessionData.session.access_token,
        sessionData.session.refresh_token,
        null,
        null,
        null
      ]);
      headers['Cookie'] = `${cookieName}=${encodeURIComponent(cookieValue)}`;
    }
  }

  const response = await fetchWithRetry(`${MOBILE_API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------
// Ticket API — mirrors POST /api/tickets from web app
// ---------------------------------------------------------------------
export interface CreateTicketInput {
  title?: string;
  description: string;
  propertyId: string;
  organizationId: string;
  priority?: 'low' | 'medium' | 'high' | 'critical' | 'urgent';
  isInternal?: boolean;
  assignedTo?: string;
}

export async function createTicket(input: CreateTicketInput): Promise<TicketApiResponse> {
  const body: Record<string, unknown> = {
    description: input.description,
    title: input.title,
    property_id: input.propertyId,
    organization_id: input.organizationId,
    is_internal: input.isInternal ?? false,
    priority: input.priority,
    assignedTo: input.assignedTo,
  };

  return apiFetch<TicketApiResponse>('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------
// Ticket list API — mirrors GET /api/tickets from web app
// ---------------------------------------------------------------------
export interface ListTicketsInput {
  propertyId?: string;
  organizationId?: string;
  status?: string;
  isInternal?: boolean;
  excludeInternal?: boolean;
  raisedBy?: string;
  raisedByRole?: string;
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listTickets(input: ListTicketsInput): Promise<TicketListResponse> {
  const params = new URLSearchParams();
  if (input.propertyId) params.set('property_id', input.propertyId);
  if (input.organizationId) params.set('organization_id', input.organizationId);
  if (input.status) params.set('status', input.status);
  if (input.isInternal !== undefined) params.set('internalOnly', String(input.isInternal));
  if (input.excludeInternal !== undefined) params.set('excludeInternal', String(input.excludeInternal));
  if (input.raisedBy) params.set('raised_by', input.raisedBy);
  if (input.raisedByRole) params.set('raisedByRole', input.raisedByRole);
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  if (input.offset !== undefined) params.set('offset', String(input.offset));
  if (input.dateFrom) params.set('dateFrom', input.dateFrom);
  if (input.dateTo) params.set('dateTo', input.dateTo);
  if (input.search) params.set('search', input.search);

  const qs = params.toString();
  return apiFetch<TicketListResponse>(`/api/tickets${qs ? `?${qs}` : ''}`);
}

// ---------------------------------------------------------------------
// Super Tenant Properties API — mirrors GET /api/super-tenant from web app
// ---------------------------------------------------------------------
export async function getSuperTenantProperties(userId?: string): Promise<SuperTenantResponse> {
  const params = userId ? `?user_id=${userId}` : '';
  return apiFetch<SuperTenantResponse>(`/api/super-tenant${params}`);
}

// ---------------------------------------------------------------------
// Gamification / Leaderboard API — mirrors /api/mst/gamification/* from web app
// ---------------------------------------------------------------------
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  photo_url: string | null;
  score: number;
  tickets_resolved: number;
  sla_met_count: number;
  first_time_fixes: number;
  streak_days: number;
  badges: Array<{
    code: string;
    name: string;
    icon: string;
    color: string;
    tier: string;
    earned_at: string;
  }>;
}

export interface LeaderboardResponse {
  period: 'daily' | 'weekly';
  score_date: string;
  leaderboard: LeaderboardEntry[];
  total: number;
  error?: string;
}

export interface GamificationBadge {
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tier: string;
  points_bonus: number;
  earned_at: string;
}

export interface MyStatsResponse {
  property_id: string;
  user_id: string;
  today: {
    total_points: number;
    tickets_resolved: number;
    sla_met_count: number;
    first_time_fixes: number;
    avg_resolution_minutes: number | null;
    rank: number | null;
    total_in_rank: number;
  };
  all_time: {
    total_points: number;
    tickets_resolved: number;
    sla_met_count: number;
  };
  streak: {
    current: number;
    longest: number;
  };
  badges: GamificationBadge[];
  next_achievements: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    tier: string;
    criteria: Record<string, unknown>;
    points_bonus: number;
  }>;
  error?: string;
}

export async function getLeaderboard(propertyId: string, period = 'daily'): Promise<LeaderboardResponse> {
  const params = new URLSearchParams();
  if (propertyId) params.set('property_id', propertyId);
  params.set('period', period);
  return apiFetch<LeaderboardResponse>(`/api/mst/gamification/leaderboard?${params.toString()}`);
}

export async function getMyGamificationStats(propertyId: string): Promise<MyStatsResponse> {
  const params = new URLSearchParams();
  if (propertyId) params.set('property_id', propertyId);
  return apiFetch<MyStatsResponse>(`/api/mst/gamification/my-stats?${params.toString()}`);
}

// ---------------------------------------------------------------------
// Property Access Check — mirrors GET /api/auth/property-access from web app
// ---------------------------------------------------------------------
export interface PropertyAccessResponse {
  authorized: boolean;
  role?: string;
}

/**
 * Check property access directly via Supabase (mobile-native).
 * Mirrors the exact logic from saas_development/app/api/auth/property-access/route.ts
 * but executes via the mobile Supabase client instead of an HTTP call.
 *
 * Logic (exact match to web):
 * 1. Master admin bypass
 * 2. Org-level access (org_admin / org_super_admin / owner)
 * 3. Property-level membership (staff, tenant, etc.)
 *
 * @param propertyId - The property ID to check access for
 * @param userOverride - (optional) Pre-fetched user object. When provided, this is used
 *   instead of calling getSession/getUser internally. This is the PREFERRED way to call
 *   this function on mobile/Expo Go because the supabase singleton in mobileApi.ts may
 *   not share session state with the AuthContext client (separate AsyncStorage hydration).
 */
export async function checkPropertyAccess(
  propertyId: string,
  userOverride?: { id: string; email?: string } | null
): Promise<PropertyAccessResponse> {
  try {
    // Org-wide "all" overview for org admins. The server property-access endpoint
    // is scoped to a single property and doesn't understand the 'all' sentinel, so
    // we resolve this case here via the server query proxy (RLS-bypassed server-side).
    if (propertyId === 'all') {
      // Resolve the acting user — prefer the passed-in user to avoid session
      // hydration races between the mobileApi singleton and AuthContext's client.
      let user = userOverride ?? null;
      if (!user) {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        user = sessionData?.session?.user ?? null;
      }
      if (!user) return { authorized: false };

      const { data: orgMemberships } = await serverApi.query<{ role: string }[]>({
        table: 'organization_memberships',
        action: 'select',
        select: 'role',
        filters: [
          { op: 'eq', column: 'user_id', value: user.id },
          { op: 'eq', column: 'is_active', value: true },
        ],
      });

      const adminRole = orgMemberships?.find((m) =>
        ['org_admin', 'org_super_admin', 'owner', 'admin'].includes(m.role)
      )?.role;
      return adminRole ? { authorized: true, role: adminRole } : { authorized: false };
    }

    // Specific property — delegate the full master-admin / org / property /
    // super-tenant evaluation to the server. It derives the user from the auth
    // token, so no userOverride plumbing is needed here.
    const { data, error } = await serverApi.get<PropertyAccessResponse>(
      '/api/auth/property-access',
      { propertyId }
    );
    // A 403 (no access) surfaces as an error here — treat as unauthorized.
    if (error || !data) return { authorized: false };
    return data;
  } catch (err) {
    console.error('[checkPropertyAccess] Unexpected error:', err);
    return { authorized: false, role: 'unknown' };
  }
}

// ---------------------------------------------------------------------
// Role path helpers — mirrors getRoleAllowedPaths / getRoleDefaultPath from web
// ---------------------------------------------------------------------
import { CAPABILITY_MATRIX } from '@/constants/capabilities';

const PROPERTY_ADMIN_ROLES = [
  'property_admin',
  'org_admin',
  'org_super_admin',
  'master_admin',
  'owner',
];

/**
 * Build allowed paths from capability matrix so sidebar modules always match route access.
 * Every role gets /dashboard. Additional paths are added based on CAPABILITY_MATRIX domains.
 */
export function getRoleAllowedPaths(role: string, propertyId: string): string[] {
  const basePath = `/property/${propertyId}`;
  const capabilities = CAPABILITY_MATRIX[role as keyof typeof CAPABILITY_MATRIX] || {};
  const paths: string[] = [
    basePath,
    `${basePath}/dashboard`,
    `${basePath}/lovable-mst`,
    `${basePath}/lovable-admin`,
    `${basePath}/lovable-super-admin`,
    `${basePath}/tenant`,
  ];

  if (capabilities.tickets) {
    paths.push(`${basePath}/tickets`);
    paths.push(`${basePath}/flow-map`);
  }
  if (capabilities.users) paths.push(`${basePath}/users`);
  if (capabilities.visitors) paths.push(`${basePath}/visitors`);
  if (capabilities.properties) paths.push(`${basePath}/rooms`);
  if (capabilities.assets) {
    paths.push(`${basePath}/diesel`);
    paths.push(`${basePath}/electricity`);
  }
  if (capabilities.water) {
    paths.push(`${basePath}/water`);
    paths.push(`${basePath}/water/analytics`);
  }
  if (capabilities.procurement || capabilities.stock) {
    paths.push(`${basePath}/stock`);
    paths.push(`${basePath}/stock/scan`);
  }
  if (capabilities.reports) paths.push(`${basePath}/reports`);
  if (capabilities.security) paths.push(`${basePath}/security`);
  if (capabilities.sop) paths.push(`${basePath}/checklist`);
  if (capabilities.cafeteria) paths.push(`${basePath}/cafeteria`);
  paths.push(`${basePath}/checklist/scan`);

  // Common pages every logged-in user can reach
  paths.push(`${basePath}/settings`, `${basePath}/profile`);

  // Admin-level roles get blanket access to all property pages
  if (PROPERTY_ADMIN_ROLES.includes(role)) {
    return Array.from(new Set([
      ...paths,
      `${basePath}`,
      `${basePath}/dashboard`,
      `${basePath}/checklist`,
      `${basePath}/checklist/scan`,
      `${basePath}/water`,
      `${basePath}/water/analytics`,
    ]));
  }

  return paths;
}

export function getRoleDefaultPath(role: string, propertyId: string): string {
  const normalizedRole = (role ?? '').toLowerCase().trim();
  if (['mst', 'maintenance_staff', 'staff'].includes(normalizedRole)) {
    return `/property/${propertyId}/lovable-mst`;
  }
  if ([
    'property_admin', 'admin', 'manager', 'property manager',
    'property_manager', 'facility_manager', 'facility manager',
    'spoc', 'administrator'
  ].includes(normalizedRole)) {
    return `/property/${propertyId}/dashboard`;
  }
  if (['org_admin', 'org_super_admin', 'owner'].includes(normalizedRole)) {
    return `/property/${propertyId}/dashboard`;
  }
  if (['procurement', 'purchase_manager', 'purchase_executive'].includes(normalizedRole)) {
    return `/property/${propertyId}/procurement`;
  }
  if (['tenant', 'super_tenant'].includes(normalizedRole)) {
    return `/property/${propertyId}/tenant`;
  }
  if (normalizedRole === 'vendor') {
    return `/property/${propertyId}/cafeteria`;
  }
  if (normalizedRole === 'security') {
    return `/property/${propertyId}/security`;
  }
  return `/property/${propertyId}/lovable-mst`; // Fallback to Lovable MST
}

/**
 * Check if a role is an admin-level role (gets full sidebar dashboard access).
 */
export function isAdminRole(role: string): boolean {
  return PROPERTY_ADMIN_ROLES.includes(role);
}

// =============================================================================
// Reports API
// =============================================================================

export interface ReportKPIs {
  totalSnags: number;
  closedSnags: number;
  openSnags: number;
  closureRate: number;
}

export interface ChartDataSet {
  labels: string[];
  data: number[];
  open?: number[];
  closed?: number[];
}

export interface ExecutiveReportResponse {
  property: { id: string; name: string; code: string };
  allTimeTotal: number;
  prevMonth: { label: string; total: number; closed: number; open: number; closureRate: number };
  currMonth: { label: string; total: number; closed: number; open: number; closureRate: number };
  topCategories: { name: string; count: number }[];
  trends: {
    prev: number[];
    curr: number[];
  };
  error?: string;
}

export interface RequestsReportResponse {
  success: boolean;
  month: { value: string; label: string };
  property: { id: string; name: string; code: string; address?: string };
  kpis: ReportKPIs;
  charts: {
    floor: ChartDataSet;
    department: ChartDataSet;
  };
  tickets: SnagTicket[];
  error?: string;
}

export interface SnagTicket {
  id: string;
  ticketNumber: string;
  ticketNumberDisplay: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  floor: string | null;
  floorLabel: string;
  location: string | null;
  reportedDate: string;
  closedDate: string | null;
  spocName: string;
  spocEmail: string;
  assigneeName: string;
  beforePhoto: string | null;
  afterPhoto: string | null;
  internal: boolean;
}

export interface SnagReportResponse {
  success: boolean;
  import: { id: string; filename: string; createdAt: string; completedAt: string | null; totalRows: number; validRows: number };
  property: { id: string; name: string; code: string; address?: string };
  kpis: ReportKPIs;
  charts: {
    floor: ChartDataSet;
    department: ChartDataSet;
  };
  tickets: SnagTicket[];
  error?: string;
}

export async function getExecutiveReport(propertyId: string): Promise<ExecutiveReportResponse> {
  return apiFetch<ExecutiveReportResponse>(`/api/reports/executive-summary?propertyId=${propertyId}`);
}

export async function getRequestsReport(propertyId: string, month?: string, startDate?: string, endDate?: string): Promise<RequestsReportResponse> {
  const params = new URLSearchParams({ propertyId });
  if (month) params.set('month', month);
  if (startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }

  return apiFetch<RequestsReportResponse>(`/api/reports/requests-report?${params.toString()}`);
}

export async function getSnagReport(importId: string): Promise<SnagReportResponse> {
  return apiFetch<SnagReportResponse>(`/api/reports/snag-report/${importId}`);
}

// =============================================================================
// Procurement / Material Request APIs — mirrors saas_one web app
// =============================================================================

export interface MaterialRequestItem {
  id?: string;
  name: string;
  quantity: number;
  unit_price?: number | null;
  total_price?: number | null;
  photo_url?: string | null;
  description?: string | null;
}

export interface MaterialRequest {
  id: string;
  ticket_id: string;
  property_id: string;
  organization_id: string;
  requested_by: string;
  assignee_uid?: string | null;
  items: MaterialRequestItem[];
  status: string;
  priority?: string;
  total_amount?: number | null;
  total_estimated_cost?: number;
  notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  escalated_by?: string | null;
  escalated_at?: string | null;
  approval_level?: number;
  target_approver_id?: string | null;
  target_approver_ids?: string[];
  target_approver_names?: string[];
  has_custom_items?: boolean;
  budget_type?: string;
  created_at: string;
  updated_at: string;
  ticket?: {
    ticket_number: string;
    title: string;
    floor_number?: string | null;
  };
  requester?: { full_name: string } | null;
  approver?: { full_name: string } | null;
  rejecter?: { full_name: string } | null;
  target_approver?: { full_name: string } | null;
  assignee?: { full_name: string } | null;
}

export interface MaterialRequestListResponse {
  requests?: MaterialRequest[];
  error?: string;
}

export async function listMaterialRequests(input: {
  propertyId?: string;
  organizationId?: string;
  ticketId?: string;
  approverId?: string;
}): Promise<MaterialRequest[]> {
  const filters: any[] = [];
  if (input.propertyId) filters.push({ op: 'eq', column: 'property_id', value: input.propertyId });
  if (input.organizationId) filters.push({ op: 'eq', column: 'organization_id', value: input.organizationId });
  if (input.ticketId) filters.push({ op: 'eq', column: 'ticket_id', value: input.ticketId });
  if (input.approverId) filters.push({ op: 'eq', column: 'target_approver_id', value: input.approverId });

  const res = await serverApi.query<MaterialRequest[]>({
    table: 'material_requests',
    action: 'select',
    select: '*, ticket:ticket_id(ticket_number, title, floor_number), requester:requested_by(full_name), approver:approved_by(full_name), rejecter:rejected_by(full_name), target_approver:target_approver_id(full_name), assignee:assignee_uid(full_name)',
    filters,
    orders: [{ column: 'created_at', ascending: false }],
  });

  if (res.error) throw new Error(res.error.message ?? 'Failed to load material requests');
  return (res.data ?? []) as MaterialRequest[];
}

export async function getProcurementCatalogItems(input: {
  propertyId?: string;
  organizationId?: string;
  search?: string;
  category?: string;
}): Promise<any[]> {
  const query: Record<string, any> = {};
  if (input.propertyId) query.propertyId = input.propertyId;
  if (input.organizationId) query.organizationId = input.organizationId;
  if (input.search) query.search = input.search;
  if (input.category) query.category = input.category;

  const res = await serverApi.get<{ items: any[]; error?: string }>('/api/procurement/catalog', query);
  
  if (res.error) throw new Error(res.error.message ?? 'Failed to load procurement catalog');
  return res.data?.items ?? [];
}

export async function addProcurementCatalogItem(input: {
  propertyId?: string;
  organizationId?: string;
  name: string;
  category?: string;
  unit_price?: number;
  quantity?: number;
  unit?: string;
  item_code?: string;
  photo_base64?: string;
}): Promise<any> {
  const res = await serverApi.post<any>('/api/procurement/catalog', {
    organization_id: input.organizationId,
    name: input.name,
    category: input.category || 'General',
    estimated_price: input.unit_price ?? 0,
    unit: input.unit || 'pcs',
    item_code: input.item_code,
    photo_base64: input.photo_base64,
  });

  if (res.error) throw new Error(res.error.message ?? 'Failed to add catalog item');
  return res.data;
}

export async function updateProcurementCatalogItem(
  id: string,
  organizationId: string,
  updates: Partial<{
    name: string;
    category: string;
    unit_price: number;
    quantity: number;
    unit: string;
    item_code: string;
    photo_base64: string;
    photo_url: string;
  }>
): Promise<any> {
  const res = await serverApi.patch<any>('/api/procurement/catalog', {
    id,
    organization_id: organizationId,
    name: updates.name,
    category: updates.category,
    estimated_price: updates.unit_price,
    unit: updates.unit,
    item_code: updates.item_code,
    photo_base64: updates.photo_base64,
    photo_url: updates.photo_url,
  });

  if (res.error) throw new Error(res.error.message ?? 'Failed to update catalog item');
  return res.data;
}

export async function deleteProcurementCatalogItem(id: string, organizationId: string): Promise<void> {
  const res = await serverApi.delete<any>('/api/procurement/catalog', {
    id,
    organization_id: organizationId
  });

  if (res.error) throw new Error(res.error.message ?? 'Failed to delete catalog item');
}

export async function getProcurementUsers(input: {
  propertyId?: string;
  organizationId?: string;
}): Promise<Array<{ id: string; full_name: string; email?: string; user_photo_url?: string; role?: string }>> {
  const query: Record<string, any> = {};
  if (input.propertyId) query.propertyId = input.propertyId;
  if (input.organizationId) query.organizationId = input.organizationId;

  const res = await serverApi.get<Array<any>>('/api/procurement/users', query);
  
  if (res.error) {
    console.error('[getProcurementUsers] Error:', res.error);
    return [];
  }
  
  return res.data ?? [];
}

/**
 * List material requests pending approval for a specific approver.
 * Mirrors GET /api/procurement/requests?approverId=<id>&propertyId=<id>
 */
export async function listPendingApprovals(
  approverId: string,
  propertyId?: string,
  organizationId?: string
): Promise<MaterialRequest[]> {
  return listMaterialRequests({ approverId, propertyId, organizationId });
}

/**
 * Approve, reject, or escalate a material request.
 * Mirrors PATCH /api/procurement/requests/<id>
 */
export async function updateMaterialRequestStatus(
  requestId: string,
  status: 'approved' | 'rejected' | 'escalated',
  notes?: string
): Promise<MaterialRequest> {
  const updatePayload: Record<string, any> = { status };
  if (notes !== undefined) updatePayload.notes = notes;
  const now = new Date().toISOString();
  if (status === 'approved') { updatePayload.approved_by = await getCurrentUserId(); updatePayload.approved_at = now; }
  if (status === 'rejected') { updatePayload.rejected_by = await getCurrentUserId(); updatePayload.rejected_at = now; }
  if (status === 'escalated') { updatePayload.escalated_by = await getCurrentUserId(); updatePayload.escalated_at = now; }

  const res = await serverApi.query<MaterialRequest>({
    table: 'material_requests',
    action: 'update',
    values: updatePayload,
    filters: [{ op: 'eq', column: 'id', value: requestId }],
  });

  if (res.error) throw new Error(res.error.message ?? 'Failed to update material request');
  return res.data as MaterialRequest;
}

export async function createTicketMaterialRequest(
  ticketId: string,
  payload: {
    assignee_uid: string;
    property_id: string;
    organization_id: string;
    budget_type?: 'rnm' | 'general';
    has_custom_items?: boolean;
    items: Array<{
      catalog_item_id?: string | null;
      name: string;
      quantity: number;
      unit_price?: number;
      photo_url?: string;
      description?: string;
      links?: string[];
      attachments?: string[];
    }>;
  }
): Promise<{ success?: boolean; material_request?: MaterialRequest; error?: string }> {
  try {
    const res = await apiFetch<MaterialRequest & { error?: string }>('/api/procurement/requests', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        property_id: payload.property_id,
        organization_id: payload.organization_id,
        assignee_uid: payload.assignee_uid,
        budget_type: payload.budget_type ?? 'general',
        has_custom_items: payload.has_custom_items ?? false,
        items: payload.items,
      }),
    });

    if (res.error) throw new Error(res.error);
    return { success: true, material_request: res };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to create material request' };
  }
}

/**
 * Upload a media file (photo or video) for a ticket.
 * Mirrors POST /api/tickets/[id]/photos or videos from the server
 */
export async function uploadTicketMedia(
  ticketId: string,
  mediaUri: string,
  type: 'before' | 'after' = 'before',
  mediaType: 'image' | 'video' = 'image'
): Promise<{ success: boolean; url?: string; type?: string; error?: string }> {
  const token = await getSupabaseToken();
  const filename = mediaUri.split('/').pop() || (mediaType === 'image' ? 'photo.webp' : 'video.mp4');
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : (mediaType === 'image' ? 'webp' : 'mp4');
  
  let fileType = '';
  if (mediaType === 'image') {
    fileType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  } else {
    fileType = ext === 'mov' ? 'video/quicktime' : `video/${ext}`;
  }

  const endpoint = mediaType === 'image' ? 'photos' : 'videos';
  const url = `${MOBILE_API_BASE}/api/tickets/${ticketId}/${endpoint}`;
  console.log(`[uploadTicketMedia] Uploading to ${url} with type ${fileType}`);
  
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: mediaUri,
      name: filename,
      type: fileType,
    } as any);
    formData.append('type', type);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { success: false, error: body || response.statusText };
    }

    const json = await response.json();
    console.log('[uploadTicketMedia] Success:', json);
    return json;
  } catch (err) {
    console.error('[uploadTicketMedia] Network error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Deletes a media file for a ticket via API.
 */
export async function deleteTicketMedia(
  ticketId: string,
  type: 'before' | 'after',
  mediaType: 'image' | 'video'
): Promise<{ success: boolean; error?: string }> {
  const token = await getSupabaseToken();
  const endpoint = mediaType === 'image' ? 'photos' : 'videos';

  console.log(`[deleteTicketMedia] Deleting ${MOBILE_API_BASE}/api/tickets/${ticketId}/${endpoint}?type=${type}`);

  try {
    const response = await fetch(`${MOBILE_API_BASE}/api/tickets/${ticketId}/${endpoint}?type=${type}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[deleteTicketMedia] Server error:', response.status, body);
      return { success: false, error: body || response.statusText };
    }

    return await response.json();
  } catch (err) {
    console.error('[deleteTicketMedia] Network error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ---------------------------------------------------------------------
// User Management & Add Member APIs (Unified with saas_one web)
// ---------------------------------------------------------------------

export interface UserListResponse {
  users: Array<{
    id: string;
    full_name: string;
    email: string;
    user_photo_url?: string;
    propertyRole?: string;
    orgRole?: string;
    propertyName?: string;
    propertyId?: string;
    is_active: boolean;
    joined_at: string;
    phone?: string;
  }>;
}

export interface CreateUserRequest {
  email: string;
  password?: string;
  full_name: string;
  phone?: string;
  organization_id: string;
  role?: string;
  property_id?: string;
  specialization?: string;
  skills?: string[];
}

export interface CreateUserResponse {
  success?: boolean;
  message?: string;
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };
  error?: string;
}

/**
 * Fetch all users for an organization or property via server API.
 */
export async function fetchUsersList(orgId?: string, propertyId?: string): Promise<UserListResponse> {
  try {
    if (propertyId) {
      const response = await apiFetch<{ success: boolean; data: any[] }>(`/api/properties/${propertyId}/users`);
      if (!response.success) return { users: [] };
      const users = (response.data || []).map((m: any) => ({
        id: m.user_id,
        full_name: m.full_name || 'Unknown',
        email: m.email || '',
        user_photo_url: m.user_photo_url,
        phone: m.phone,
        propertyRole: m.role,
        propertyId,
        is_active: m.is_active ?? true,
        joined_at: m.created_at,
      })).filter((u: any) => u.id);
      return { users };
    }
    if (orgId) {
      const response = await apiFetch<{ success: boolean; data: any[] }>(`/api/organizations/${orgId}/users`);
      if (!response.success) return { users: [] };
      const users = (response.data || []).map((m: any) => ({
        id: m.users?.id,
        full_name: m.users?.full_name || m.full_name || 'Unknown',
        email: m.users?.email || m.email || '',
        user_photo_url: m.users?.user_photo_url,
        phone: m.users?.phone,
        orgRole: m.role,
        is_active: m.is_active ?? true,
        joined_at: m.created_at,
      })).filter((u: any) => u.id);
      return { users };
    }
    return { users: [] };
  } catch (err: any) {
    console.error('[fetchUsersList] error:', err);
    return { users: [] };
  }
}

/**
 * Create a membership record for an existing user.
 * Note: Full user account creation (auth.admin.createUser) requires a backend.
 * This adds an existing user to a property/org membership.
 */
export async function createMemberUser(data: CreateUserRequest): Promise<CreateUserResponse> {
  try {
    // Check if user exists by email
    const { data: existingUser, error: lookupError } = await serverApi.query<{ id: string; full_name: string; email: string }>({
      table: 'users',
      action: 'select',
      select: 'id, full_name, email',
      filters: [{ op: 'eq', column: 'email', value: data.email.toLowerCase().trim() }],
      maybeSingle: true,
    });

    if (lookupError) throw new Error(lookupError.message);
    if (!existingUser) {
      return { success: false, error: 'User not found. Ask the user to sign up first, then add them here.' };
    }

    // Add to property membership if propertyId given
    if (data.property_id) {
      const { error: memError } = await serverApi.query({
        table: 'property_memberships',
        action: 'upsert',
        values: {
          user_id: existingUser.id,
          property_id: data.property_id,
          organization_id: data.organization_id,
          role: data.role || 'staff',
          is_active: true,
          joined_at: new Date().toISOString(),
        },
        mutationOptions: { onConflict: 'user_id,property_id' },
      });
      if (memError) throw new Error(memError.message);
    }

    // Always add to org membership
    const { error: orgMemError } = await serverApi.query({
      table: 'organization_memberships',
      action: 'upsert',
      values: {
        user_id: existingUser.id,
        organization_id: data.organization_id,
        role: data.role || 'staff',
        is_active: true,
        joined_at: new Date().toISOString(),
      },
      mutationOptions: { onConflict: 'user_id,organization_id' },
    });
    if (orgMemError) throw new Error(orgMemError.message);

    return {
      success: true,
      message: `${existingUser.full_name} added successfully`,
      user: { id: existingUser.id, email: existingUser.email, full_name: existingUser.full_name, role: data.role || 'staff' },
    };
  } catch (err: any) {
    console.error('[createMemberUser] Error:', err);
    return { success: false, error: err.message || 'Failed to add member' };
  }
}

export interface UpdateRoleRequest {
  userId: string;
  newRole: string;
  propertyId?: string;
  organizationId?: string;
  skills?: string[];
  oldRole?: string;
}

export interface UpdateRoleResponse {
  success?: boolean;
  error?: string;
}

/**
 * Update a user's role directly via Supabase.
 * Replaces the Vercel API call.
 */
export async function updateMemberRole(data: UpdateRoleRequest): Promise<UpdateRoleResponse> {
  try {
    if (data.propertyId) {
      const { error } = await serverApi.query({
        table: 'property_memberships',
        action: 'update',
        values: { role: data.newRole },
        filters: [
          { op: 'eq', column: 'user_id', value: data.userId },
          { op: 'eq', column: 'property_id', value: data.propertyId },
        ],
      });
      if (error) throw new Error(error.message);
    }
    if (data.organizationId) {
      const { error } = await serverApi.query({
        table: 'organization_memberships',
        action: 'update',
        values: { role: data.newRole },
        filters: [
          { op: 'eq', column: 'user_id', value: data.userId },
          { op: 'eq', column: 'organization_id', value: data.organizationId },
        ],
      });
      if (error) throw new Error(error.message);
    }
    return { success: true };
  } catch (err: any) {
    console.error('[updateMemberRole] Error:', err);
    return { success: false, error: err.message || 'Failed to update role' };
  }
}

// ---------------------------------------------------------------------
// Meeting Room APIs
// ---------------------------------------------------------------------

export interface MeetingRoom {
  id: string;
  property_id: string;
  name: string;
  photo_url?: string;
  location?: string;
  capacity: number;
  size?: number;
  amenities?: string[];
  status: string;
  created_by?: string;
  created_at: string;
}

export interface MeetingRoomBooking {
  id: string;
  meeting_room_id: string;
  property_id: string;
  user_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  company_id?: string;
  organization_id?: string;
  created_at: string;
  meeting_room?: { name: string; photo_url?: string; location?: string };
  tenant?: { full_name: string; email: string };
}

export interface MeetingRoomCredit {
  id: string;
  property_id: string;
  user_id?: string;
  company_id?: string;
  assigned_by?: string;
  monthly_hours: number;
  remaining_hours: number;
  last_reset_at: string;
  next_reset_at: string;
  created_at: string;
  updated_at: string;
}

export async function getMeetingRooms(propertyId: string, status?: string): Promise<{ rooms?: MeetingRoom[]; error?: string }> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await apiFetch<any>(`/api/meeting-rooms/available?propertyId=${propertyId}&date=${today}${status ? `&status=${status}` : ''}`);
    return { rooms: res.rooms as MeetingRoom[] };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getMeetingRoomBookings(propertyId: string, status?: string): Promise<{ bookings?: MeetingRoomBooking[]; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-room-bookings?propertyId=${propertyId}${status ? `&status=${status}` : ''}`);
    return { bookings: res.bookings as MeetingRoomBooking[] };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getMeetingRoomCredits(propertyId: string): Promise<{ credit?: MeetingRoomCredit | null; company?: { id: string; name: string; logo_url?: string } | null; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-room-credits?propertyId=${propertyId}`);
    return { credit: res.credit as MeetingRoomCredit | null, company: res.company || null };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateMeetingRoomCreditsApi(payload: any) {
  return apiFetch<any>('/api/meeting-room-credits', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateMeetingRoomRefillRequestApi(id: string, payload: any) {
  return apiFetch<any>(`/api/meeting-room-credits/refill-requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export interface CreateBookingInput {
  meetingRoomId: string;
  propertyId: string;
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export async function createMeetingRoomBooking(input: CreateBookingInput): Promise<{ success?: boolean; booking?: MeetingRoomBooking; error?: string }> {
  try {
    const res = await apiFetch<any>('/api/meeting-room-bookings', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return { success: true, booking: res.booking as MeetingRoomBooking };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function cancelMeetingRoomBookingApi(bookingId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-room-bookings/${bookingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' })
    });
    if (res.error) throw new Error(res.error);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export interface CreateCompanyInput {
  name: string;
  property_id: string;
  organization_id: string;
  logo_url?: string;
}

export async function createCompanyApi(input: CreateCompanyInput): Promise<{ success?: boolean; company?: any; error?: string }> {
  try {
    const res = await apiFetch<any>('/api/companies', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return { success: true, company: res.company };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function manageCompanyMemberApi(companyId: string, userId: string, action: 'add' | 'remove'): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, action })
    });
    if (res.error) throw new Error(res.error);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export interface CreateMeetingRoomInput {
  name: string;
  propertyId: string;
  location?: string;
  capacity: number;
  size?: number;
  amenities?: string[];
  photo_url?: string;
  status?: string;
}

export async function createMeetingRoomApi(input: CreateMeetingRoomInput): Promise<{ success?: boolean; room?: MeetingRoom; error?: string }> {
  try {
    const res = await apiFetch<any>('/api/meeting-rooms', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return { success: true, room: res.room as MeetingRoom };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateMeetingRoomApi(id: string, input: Partial<CreateMeetingRoomInput>): Promise<{ success?: boolean; room?: MeetingRoom; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-rooms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return { success: true, room: res.room as MeetingRoom };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteMeetingRoomApi(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-rooms/${id}`, {
      method: 'DELETE',
    });
    if (res.error) throw new Error(res.error);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function uploadMeetingRoomPhoto(photoUri: string): Promise<{ success?: boolean; url?: string; error?: string }> {
  const token = await getSupabaseToken();
  const formData = new FormData();
  const filename = photoUri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const fileType = match ? `image/${match[1]}` : `image/jpeg`;

  formData.append('file', {
    uri: photoUri,
    name: filename,
    type: fileType,
  } as any);

  try {
    const response = await fetch(`${MOBILE_API_BASE}/api/meeting-rooms/photos`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { success: false, error: body || response.statusText };
    }

    const json = await response.json();
    return { success: true, url: json.url };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function getChecklistDataApi(propertyId: string) {
  return apiFetch<any>(`/api/checklist?propertyId=${propertyId}`);
}
export async function getChecklistTemplateCompletionsApi(propertyId: string, templateId: string, limit?: number) {
  return apiFetch<any>(`/api/checklist/template-completions?propertyId=${propertyId}&templateId=${templateId}${limit ? `&limit=${limit}` : ''}`);
}
export async function createChecklistTemplateApi(payload: any) {
  return apiFetch<any>('/api/checklist/templates', { method: 'POST', body: JSON.stringify(payload) });
}
export async function startChecklistCompletionApi(payload: any) {
  return apiFetch<any>('/api/checklist/completions', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateChecklistCompletionApi(id: string, payload: any) {
  return apiFetch<any>(`/api/checklist/completions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function updateChecklistTemplateApi(id: string, payload: any) {
  return apiFetch<any>(`/api/checklist/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function uploadChecklistMediaApi(formData: FormData) {
  return apiFetch<any>('/api/checklist/media', { method: 'POST', body: formData });
}
export async function deleteChecklistMediaApi(type: string, url: string, completionId?: string) {
  return apiFetch<any>('/api/checklist/media', { method: 'DELETE', body: JSON.stringify({ type, url, completionId }) });
}

export async function getPpmDataApi(propertyId: string) {
  return apiFetch<any>(`/api/ppm?propertyId=${propertyId}`);
}
export async function createPpmScheduleApi(payload: any) {
  return apiFetch<any>('/api/ppm', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updatePpmStatusApi(payload: any) {
  return apiFetch<any>('/api/ppm/status', { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function uploadPpmMediaApi(formData: FormData) {
  return apiFetch<any>('/api/ppm/media', { method: 'POST', body: formData });
}
export async function deletePpmMediaApi(payload: any) {
  return apiFetch<any>('/api/ppm/media', { method: 'DELETE', body: JSON.stringify(payload) });
}

export async function getCompaniesWithCreditsApi(propertyId: string) {
  return apiFetch<any>(`/api/companies?propertyId=${propertyId}`);
}
