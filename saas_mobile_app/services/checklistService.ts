import { serverApi } from '@/lib/serverApi';
import { apiFetch } from '@/utils/api/mobileApi';
import { ApiResponse } from '@/types';
import { File as FSFile } from 'expo-file-system';

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
    // We can use apiFetch to POST to /api/checklist/templates
    // Note: The backend expects propertyId or property_id.
    const response = await apiFetch<any>('/api/checklist/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (response.error) throw new Error(response.error);
    return { template: response.template };
  },

  // ── Update template ───────────────────────────────────────────────────────
  async updateTemplate(templateId: string, payload: any) {
    const response = await apiFetch<any>(`/api/checklist/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (response.error) throw new Error(response.error);
    return { template: response.template ?? payload };
  },

  // ── Soft-delete template ──────────────────────────────────────────────────
  async deleteTemplate(templateId: string) {
    const response = await apiFetch<any>(`/api/checklist/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    if (response.error) throw new Error(response.error);
    return { template: response.template ?? { id: templateId, is_active: false } };
  },

  // ── Start completion ──────────────────────────────────────────────────────
  async startCompletion(payload: any) {
    const response = await apiFetch<any>('/api/checklist/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (response.error) throw new Error(response.error);
    return { completion: response.completion };
  },

  // ── Update completion ─────────────────────────────────────────────────────
  async updateCompletion(completionId: string, payload: any) {
    const response = await apiFetch<any>(`/api/checklist/completions/${completionId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (response.error) throw new Error(response.error);
    return { completion: response.completion ?? payload };
  },

  // ── Upload media ──────────────────────────────────────────────────────────
  async uploadMedia(formData: FormData) {
    // Extract fields from FormData (React Native FormData has _parts)
    const file = (formData as any).get?.('file') ?? (formData as any)._parts?.[0]?.[1];
    const propertyId = (formData as any).get?.('propertyId') ?? (formData as any)._parts?.find((p: any) => p[0] === 'propertyId')?.[1] ?? '';
    const completionId = (formData as any).get?.('completionId') ?? (formData as any)._parts?.find((p: any) => p[0] === 'completionId')?.[1] ?? '';
    const itemId = (formData as any).get?.('itemId') ?? (formData as any)._parts?.find((p: any) => p[0] === 'itemId')?.[1] ?? '';
    const type = (formData as any).get?.('type') ?? (formData as any)._parts?.find((p: any) => p[0] === 'type')?.[1] ?? 'photo';

    if (!file) throw new Error('No file in FormData');

    // Convert file to base64 for JSON upload
    let fileBase64 = '';
    if (file.uri) {
      // React Native file object with uri
      const fsFile = new FSFile(file.uri);
      fileBase64 = await fsFile.base64();
    } else if (file instanceof Blob) {
      const reader = new FileReader();
      fileBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // Call the dedicated checklist media endpoint on the mobile server
    const res = await apiFetch<any>('/api/checklist/media', {
      method: 'POST',
      body: JSON.stringify({
        fileBase64,
        propertyId,
        completionId,
        itemId,
        type,
        fileName: file.name,
        contentType: file.type,
      }),
    });

    if (res.error) throw new Error(res.error);
    return { url: res.url || '' };
  },

  // ── Delete media ──────────────────────────────────────────────────────────
  async deleteMedia(type: string, url: string, _completionId?: string) {
    const res = await apiFetch<any>(`/api/checklist/media?url=${encodeURIComponent(url)}&type=${type}`, {
      method: 'DELETE',
    });
    if (res.error) throw new Error(res.error);
    return { success: true };
  },
};
