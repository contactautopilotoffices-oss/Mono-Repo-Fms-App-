import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types (aligned with saas_one schema)
// ---------------------------------------------------------------------------

export interface SOPTemplate {
  id: string;
  property_id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'on_demand' | string;
  assigned_to?: string[] | null;
  is_active: boolean;
  is_running?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: SOPChecklistItem[];
}

export interface SOPChecklistItem {
  id: string;
  template_id: string;
  title: string;
  description?: string | null;
  order_index: number;
  requires_photo?: boolean;
  requires_comment?: boolean;
  is_mandatory?: boolean;
  type?: 'checkbox' | 'text' | 'number' | 'yes_no';
  is_optional?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string;
}

export interface SOPCompletion {
  id: string;
  template_id: string;
  property_id: string;
  organization_id: string;
  completed_by?: string | null;
  completion_date?: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'partial' | 'missed';
  notes?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  due_at?: string | null;
  is_late?: boolean;
  slot_time?: string | null;
  started_at?: string | null;
  template?: SOPTemplate;
  items?: SOPCompletionItem[];
  completed_by_user?: { full_name: string; email: string } | null;
}

export interface SOPCompletionItem {
  id: string;
  completion_id: string;
  checklist_item_id: string;
  is_checked?: boolean;
  photo_url?: string | null;
  video_url?: string | null;
  comment?: string | null;
  checked_at?: string | null;
  value?: string | null;
  checked_by?: string | null;
  updated_at?: string | null;
}

export interface ChecklistFilters {
  propertyId: string;
  templateId?: string;
  completionDate?: string;
  userId?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Checklist Service — uses serverApi
// ---------------------------------------------------------------------------

export const checklistService = {
  // ── Fetch all checklist data for a property ───────────────────────────────
  async fetchChecklistData(propertyId: string) {
    try {
      // Use the dedicated /api/checklist endpoint which queries the correct
      // sop_templates / sop_completions tables with proper joins.
      const { data, error } = await serverApi.get<{
        templates: any[];
        propertyMembers: { id: string; full_name: string; role: string }[];
        organizationId: string | null;
      }>('/api/checklist', { propertyId });

      if (error) {
        return { templates: [], propertyMembers: [], organizationId: null, error: error.message };
      }

      return {
        templates: (data as any)?.templates ?? [],
        propertyMembers: (data as any)?.propertyMembers ?? [],
        organizationId: (data as any)?.organizationId ?? null,
        error: null,
      };
    } catch (err: any) {
      console.error('[checklistService] fetchChecklistData error:', err);
      return { templates: [], propertyMembers: [], organizationId: null, error: err.message };
    }
  },

  // ── Fetch template completions ────────────────────────────────────────────
  async fetchTemplateCompletions(propertyId: string, templateId: string, limit = 50) {
    const { data, error } = await serverApi.get<{ completions: any[] }>('/api/checklist/template-completions', {
      propertyId,
      templateId,
      limit: limit.toString(),
    });
    if (error) throw new Error(error.message);
    return { completions: (data as any)?.completions ?? [] };
  },

  // ── Create template ───────────────────────────────────────────────────────
  async createTemplate(payload: any) {
    // Strip client-side propertyId; use property_id from payload
    const { propertyId, items, ...templatePayload } = payload;

    const { data: template, error: tErr } = await serverApi.query({
      table: 'sop_templates',
      action: 'insert',
      select: '*',
      values: templatePayload,
      single: true,
    });

    if (tErr) throw new Error(tErr.message);

    const createdTemplate = template as SOPTemplate;

    if (items?.length) {
      const itemRows = items.map((item: any, idx: number) => ({
        ...item,
        template_id: createdTemplate.id,
        order_index: item.order_index ?? idx,
        requires_comment: item.requires_comment ?? false,
      }));
      const { error: iErr } = await serverApi.query({
        table: 'sop_checklist_items',
        action: 'insert',
        values: itemRows,
      });
      if (iErr) throw new Error(iErr.message);
    }

    return { template: createdTemplate };
  },

  // ── Update template ───────────────────────────────────────────────────────
  async updateTemplate(templateId: string, payload: any) {
    // Strip client-side keys that shouldn't go to the API
    const { propertyId, items, ...rest } = payload;
    const { data, error } = await serverApi.query({
      table: 'sop_templates',
      action: 'update',
      select: '*',
      filters: [{ op: 'eq', column: 'id', value: templateId }],
      values: rest,
      single: true,
    });

    if (error) throw new Error(error.message);
    return { template: data };
  },

  // ── Soft-delete template ──────────────────────────────────────────────────
  async deleteTemplate(templateId: string) {
    const { data, error } = await serverApi.query({
      table: 'sop_templates',
      action: 'update',
      select: '*',
      filters: [{ op: 'eq', column: 'id', value: templateId }],
      values: { is_active: false },
      single: true,
    });

    if (error) throw new Error(error.message);
    return { template: data };
  },

  // ── Start completion ──────────────────────────────────────────────────────
  async startCompletion(payload: any) {
    const { data, error } = await serverApi.query({
      table: 'sop_completions',
      action: 'insert',
      select: '*, template:template_id(*), items:sop_completion_items(*)',
      values: payload,
      single: true,
    });

    if (error) throw new Error(error.message);
    return { completion: data };
  },

  // ── Update completion ─────────────────────────────────────────────────────
  async updateCompletion(completionId: string, payload: any) {
    const { data, error } = await serverApi.query({
      table: 'sop_completions',
      action: 'update',
      select: '*',
      filters: [{ op: 'eq', column: 'id', value: completionId }],
      values: payload,
      single: true,
    });

    if (error) throw new Error(error.message);
    return { completion: data };
  },

  // ── Upload media ──────────────────────────────────────────────────────────
  async uploadMedia(formData: FormData) {
    // Extract file from FormData
    const file = (formData as any).get?.('file') ?? (formData as any)._parts?.[0]?.[1];
    if (!file) throw new Error('No file in FormData');

    const typeStr = (file.type as string) ?? 'image/jpeg';
    const isVideo = typeStr.startsWith('video/');
    const bucket = isVideo ? 'sop-videos' : 'sop-photos';
    const ext = typeStr.split('/')[1] || (isVideo ? 'mp4' : 'jpg');
    const path = `${Date.now()}.${ext}`;

    let blob: Blob;
    if (file instanceof Blob) {
      blob = file;
    } else {
      const fetched = await fetch(file.uri);
      blob = await fetched.blob();
    }

    const { error: uploadError } = await serverApi.upload(bucket, path, blob, typeStr);

    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = await serverApi.getPublicUrl(bucket, path);
    return { url: urlData?.publicUrl ?? '' };
  },

  // ── Delete media ──────────────────────────────────────────────────────────
  async deleteMedia(type: string, url: string, _completionId?: string) {
    const bucket = type === 'video' ? 'sop-videos' : 'sop-photos';

    // Extract path from public URL
    const parts = url.split(`/${bucket}/`);
    const path = parts[1];
    if (!path) throw new Error('Could not determine storage path from URL');

    const { error } = await serverApi.removeFile(bucket, path);
    if (error) throw new Error(error.message);
    return { success: true };
  },
};
