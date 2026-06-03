/**
 * Escalation Service
 *
 * Handles escalation_hierarchies and escalation_levels CRUD.
 * DB schema (saas_one):
 *   escalation_hierarchies: id, organization_id, property_id, name, description, is_active, created_by
 *   escalation_levels: id, hierarchy_id, level_number, employee_id, escalation_time_minutes, notification_channels
 */

import { serverApi } from '@/lib/serverApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalationLevel {
  id?: string;
  hierarchy_id?: string;
  level_number?: number;
  level?: number;
  employee_id?: string | null;
  escalation_time_minutes: number;
  response_time_minutes?: number;
  notification_channels?: string[];
  role?: string;
  user_id?: string;
  user_name?: string;
  employee?: { id: string; full_name: string; email: string; role?: string };
}

export interface EscalationHierarchy {
  id: string;
  organization_id?: string | null;
  property_id?: string | null;
  name: string;
  description?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  levels?: EscalationLevel[];
}

// ---------------------------------------------------------------------------
// Fetch all hierarchies for a property (with levels)
// ---------------------------------------------------------------------------

export async function fetchEscalationHierarchies(
  propertyId: string,
  organizationId?: string | null
): Promise<{ hierarchies?: EscalationHierarchy[]; error?: string }> {
  try {
    const { data, error } = await serverApi.query<EscalationHierarchy[]>({
      table: 'escalation_hierarchies',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      orders: [{ column: 'created_at', ascending: false }],
    });

    if (error) throw new Error(error.message);

    const hierarchies = (data ?? []) as EscalationHierarchy[];

    // Fetch levels for each hierarchy
    if (hierarchies.length > 0) {
      const hierarchyIds = hierarchies.map((h) => h.id);
      const { data: levelsData, error: levelsError } = await serverApi.query<EscalationLevel[]>({
        table: 'escalation_levels',
        action: 'select',
        select: '*',
        filters: [{ op: 'in', column: 'hierarchy_id', value: hierarchyIds }],
        orders: [{ column: 'level_number', ascending: true }],
      });

      if (levelsError) console.warn('[escalationService] levels fetch warning:', levelsError);

      const levelsMap: Record<string, EscalationLevel[]> = {};
      (levelsData ?? []).forEach((level: any) => {
        const hid = level.hierarchy_id;
        if (!levelsMap[hid]) levelsMap[hid] = [];
        levelsMap[hid].push(level);
      });

      hierarchies.forEach((h) => {
        h.levels = levelsMap[h.id] ?? [];
      });
    }

    return { hierarchies };
  } catch (err: any) {
    console.error('[escalationService] fetchEscalationHierarchies:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Create hierarchy + levels
// ---------------------------------------------------------------------------

export async function createEscalationHierarchy(payload: {
  propertyId: string;
  organizationId: string;
  name: string;
  description?: string | null;
  levels: Array<{
    employee_id?: string | null;
    escalation_time_minutes: number;
    notification_channels?: string[];
  }>;
}): Promise<{ hierarchy?: EscalationHierarchy; error?: string }> {
  try {
    // 1. Create hierarchy
    const { data: hData, error: hErr } = await serverApi.query<EscalationHierarchy>({
      table: 'escalation_hierarchies',
      action: 'insert',
      select: '*',
      values: {
        property_id: payload.propertyId,
        organization_id: payload.organizationId,
        name: payload.name,
        description: payload.description ?? null,
        is_active: true,
      },
      single: true,
    });

    if (hErr) throw new Error(hErr.message);
    const hierarchy = hData as EscalationHierarchy;

    // 2. Insert levels
    if (payload.levels.length > 0) {
      const levelRows = payload.levels.map((l, idx) => ({
        hierarchy_id: hierarchy.id,
        level_number: idx + 1,
        employee_id: l.employee_id ?? null,
        escalation_time_minutes: l.escalation_time_minutes,
        notification_channels: l.notification_channels ?? ['push', 'email'],
      }));

      const { error: lErr } = await serverApi.query({
        table: 'escalation_levels',
        action: 'insert',
        values: levelRows,
      });

      if (lErr) console.warn('[escalationService] level insert warning:', lErr);
    }

    return { hierarchy: { ...hierarchy, levels: payload.levels.map((l, idx) => ({ level_number: idx + 1, ...l })) };
  } catch (err: any) {
    console.error('[escalationService] createEscalationHierarchy:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Update hierarchy + levels
// ---------------------------------------------------------------------------

export async function updateEscalationHierarchy(payload: {
  hierarchyId: string;
  propertyId: string;
  name: string;
  description?: string | null;
  levels: Array<{
    employee_id?: string | null;
    escalation_time_minutes: number;
    notification_channels?: string[];
  }>;
}): Promise<{ error?: string }> {
  try {
    // 1. Update hierarchy metadata
    const { error: hErr } = await serverApi.query({
      table: 'escalation_hierarchies',
      action: 'update',
      values: {
        name: payload.name,
        description: payload.description ?? null,
        updated_at: new Date().toISOString(),
      },
      filters: [{ op: 'eq', column: 'id', value: payload.hierarchyId }],
    });

    if (hErr) throw new Error(hErr.message);

    // 2. Delete existing levels
    const { error: delErr } = await serverApi.query({
      table: 'escalation_levels',
      action: 'delete',
      filters: [{ op: 'eq', column: 'hierarchy_id', value: payload.hierarchyId }],
    });

    if (delErr) console.warn('[escalationService] level delete warning:', delErr);

    // 3. Insert new levels
    if (payload.levels.length > 0) {
      const levelRows = payload.levels.map((l, idx) => ({
        hierarchy_id: payload.hierarchyId,
        level_number: idx + 1,
        employee_id: l.employee_id ?? null,
        escalation_time_minutes: l.escalation_time_minutes,
        notification_channels: l.notification_channels ?? ['push', 'email'],
      }));

      const { error: lErr } = await serverApi.query({
        table: 'escalation_levels',
        action: 'insert',
        values: levelRows,
      });

      if (lErr) console.warn('[escalationService] level insert warning:', lErr);
    }

    return {};
  } catch (err: any) {
    console.error('[escalationService] updateEscalationHierarchy:', err);
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Delete hierarchy (cascades to levels)
// ---------------------------------------------------------------------------

export async function deleteEscalationHierarchy(
  hierarchyId: string,
  propertyId: string
): Promise<{ error?: string }> {
  try {
    const { error } = await serverApi.query({
      table: 'escalation_hierarchies',
      action: 'delete',
      filters: [
        { op: 'eq', column: 'id', value: hierarchyId },
        { op: 'eq', column: 'property_id', value: propertyId },
      ],
    });

    if (error) throw new Error(error.message);
    return {};
  } catch (err: any) {
    console.error('[escalationService] deleteEscalationHierarchy:', err);
    return { error: err.message };
  }
}
