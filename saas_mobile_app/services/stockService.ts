/**
 * Stock Service - Complete stock/inventory management
 *
 * Features:
 * - CRUD for stock items
 * - Stock movements (add/remove/adjust)
 * - Barcode & QR code support (cross-platform compatible)
 * - Bulk import/export
 */

import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockItem {
  id: string;
  property_id: string;
  organization_id?: string;
  item_code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  min_threshold: number;
  per_unit_cost: number;
  unit_price: number;
  location?: string | null;
  barcode?: string | null;
  barcode_format?: string | null;
  qr_code_data?: QRCodeData | null;
  barcode_generated_at?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface QRCodeData {
  id: string;
  item_code: string;
  name: string;
  category?: string;
}

export interface StockMovement {
  id: string;
  item_id: string;
  property_id: string;
  organization_id?: string;
  action: 'add' | 'remove' | 'adjust' | 'initial';
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  notes?: string | null;
  user_id?: string | null;
  created_at: string;
  stock_items?: { name: string; item_code: string; unit?: string } | null;
  users?: { full_name: string } | null;
}

export interface StockStats {
  totalItems: number;
  lowStock: number;
  outOfStock: number;
  totalValue: number;
}

export interface CreateItemPayload {
  property_id: string;
  name: string;
  category?: string;
  unit?: string;
  quantity?: number;
  min_threshold?: number;
  per_unit_cost?: number;
  location?: string;
  description?: string;
  item_code?: string;
}

export interface MovementPayload {
  property_id: string;
  item_id: string;
  action: 'add' | 'remove' | 'adjust';
  quantity_change: number;
  notes?: string;
}

// Category options (matches web app)
export const CATEGORY_OPTIONS = [
  'HK Material Equipment',
  'HK Chemical',
  'Mineral Water Expenses Sources',
  'Tea and Coffee Expenses',
  'Tissue Paper Expenses',
  'Supplies',
  'Safety',
  'Other',
];

// Unit options (matches web app)
export const UNIT_OPTIONS = [
  'units', 'kg', 'g', 'litre', 'ml',
  'pieces', 'boxes', 'rolls', 'packs',
  'bottles', 'sheets'
];

// ---------------------------------------------------------------------------
// Stock Service
// ---------------------------------------------------------------------------

export const stockService = {
  // ── Fetch all items ──────────────────────────────────────────────────────
  async getItems(propertyId: string, filters?: {
    category?: string;
    lowStockOnly?: boolean;
    search?: string;
  }): Promise<ApiResponse<StockItem[]>> {
    try {
      const filters_list = [
        { op: 'eq' as const, column: 'property_id', value: propertyId },
      ];

      if (filters?.category) {
        filters_list.push({ op: 'eq', column: 'category', value: filters.category });
      }

      if (filters?.search) {
        // Search in name or item_code
        const searchFilter = filters.search.toLowerCase();
        // Note: serverApi doesn't support OR, so we'll filter client-side
      }

      const res = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        select: '*',
        filters: filters_list,
        orders: [{ column: 'name', ascending: true }],
      });

      if (res.error) throw new Error(res.error.message);

      let items = res.data ?? [];

      // Client-side search filter
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        items = items.filter(i =>
          i.name.toLowerCase().includes(q) ||
          (i.item_code || '').toLowerCase().includes(q)
        );
      }

      // Low stock filter
      if (filters?.lowStockOnly) {
        items = items.filter(i => i.quantity < (i.min_threshold || 10));
      }

      return { success: true, data: items, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Fetch single item by barcode/item_code ─────────────────────────────────
  async getItemByBarcode(propertyId: string, barcode: string): Promise<ApiResponse<StockItem>> {
    try {
      const res = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        select: '*',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'or', conditions: [
            { op: 'eq', column: 'barcode', value: barcode },
            { op: 'eq', column: 'item_code', value: barcode },
          ]},
        ],
        limit: 1,
      });

      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length === 0) {
        return { success: false, data: null, error: 'Item not found', status: 404 };
      }

      return { success: true, data: res.data[0], status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Create item ───────────────────────────────────────────────────────────
  async createItem(payload: CreateItemPayload): Promise<ApiResponse<StockItem>> {
    try {
      // Generate item_code if not provided
      const item_code = payload.item_code || `ITEM-${Date.now()}`;

      // Generate barcode (UUID for uniqueness)
      const barcode = `${payload.property_id.slice(0, 8)}-${item_code}`;

      // QR code data (cross-platform compatible)
      const qr_code_data: QRCodeData = {
        id: '', // Will be updated after insert
        item_code,
        name: payload.name,
        category: payload.category,
      };

      const res = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'insert',
        values: {
          property_id: payload.property_id,
          item_code,
          name: payload.name,
          category: payload.category ?? null,
          unit: payload.unit ?? 'units',
          quantity: payload.quantity ?? 0,
          min_threshold: payload.min_threshold ?? 10,
          per_unit_cost: payload.per_unit_cost ?? 0,
          location: payload.location ?? null,
          description: payload.description ?? null,
          barcode,
          barcode_format: 'CODE128',
          qr_code_data,
          barcode_generated_at: new Date().toISOString(),
        },
        select: '*',
        single: true,
      });

      if (res.error) throw new Error(res.error.message);

      // Update qr_code_data with actual ID
      const item = res.data as any;
      if (item?.id) {
        qr_code_data.id = item.id;
        await serverApi.query({
          table: 'stock_items',
          action: 'update',
          values: { qr_code_data },
          filters: [{ op: 'eq', column: 'id', value: item.id }],
        });
      }

      return { success: true, data: item, status: 201 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Update item ───────────────────────────────────────────────────────────
  async updateItem(itemId: string, propertyId: string, payload: Partial<StockItem>): Promise<ApiResponse<StockItem>> {
    try {
      const res = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'update',
        values: {
          ...payload,
          updated_at: new Date().toISOString(),
        },
        filters: [
          { op: 'eq', column: 'id', value: itemId },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
        select: '*',
        single: true,
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Delete item ───────────────────────────────────────────────────────────
  async deleteItem(itemId: string, propertyId: string): Promise<ApiResponse<void>> {
    try {
      const res = await serverApi.query({
        table: 'stock_items',
        action: 'delete',
        filters: [
          { op: 'eq', column: 'id', value: itemId },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
      });

      if (res.error) throw new Error(res.error.message);
      return { success: true, data: undefined, status: 200 };
    } catch (err: any) {
      return { success: false, data: undefined, error: err.message, status: 500 };
    }
  },

  // ── Stock Movement: Add ────────────────────────────────────────────────────
  async addStock(propertyId: string, itemId: string, quantity: number, notes?: string): Promise<ApiResponse<StockItem>> {
    try {
      // Get current item
      const itemRes = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        select: 'id, quantity, name, item_code, unit',
        filters: [
          { op: 'eq', column: 'id', value: itemId },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
        limit: 1,
      });

      if (itemRes.error) throw new Error(itemRes.error.message);
      if (!itemRes.data || itemRes.data.length === 0) {
        return { success: false, data: null, error: 'Item not found', status: 404 };
      }

      const currentItem = itemRes.data[0];
      const newQuantity = currentItem.quantity + quantity;

      // Update quantity
      await serverApi.query({
        table: 'stock_items',
        action: 'update',
        values: { quantity: newQuantity, updated_at: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: itemId }],
      });

      // Record movement
      await serverApi.query({
        table: 'stock_movements',
        action: 'insert',
        values: {
          item_id: itemId,
          property_id: propertyId,
          action: 'add',
          quantity_change: quantity,
          quantity_before: currentItem.quantity,
          quantity_after: newQuantity,
          notes: notes ?? null,
        },
      });

      // Return updated item
      const updatedRes = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        filters: [{ op: 'eq', column: 'id', value: itemId }],
        limit: 1,
      });

      return { success: true, data: updatedRes.data?.[0] ?? null, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Stock Movement: Remove ────────────────────────────────────────────────
  async removeStock(propertyId: string, itemId: string, quantity: number, notes?: string): Promise<ApiResponse<StockItem>> {
    try {
      // Get current item
      const itemRes = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        select: 'id, quantity, name, item_code, unit',
        filters: [
          { op: 'eq', column: 'id', value: itemId },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
        limit: 1,
      });

      if (itemRes.error) throw new Error(itemRes.error.message);
      if (!itemRes.data || itemRes.data.length === 0) {
        return { success: false, data: null, error: 'Item not found', status: 404 };
      }

      const currentItem = itemRes.data[0];
      const newQuantity = Math.max(0, currentItem.quantity - quantity);

      // Update quantity
      await serverApi.query({
        table: 'stock_items',
        action: 'update',
        values: { quantity: newQuantity, updated_at: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: itemId }],
      });

      // Record movement
      await serverApi.query({
        table: 'stock_movements',
        action: 'insert',
        values: {
          item_id: itemId,
          property_id: propertyId,
          action: 'remove',
          quantity_change: quantity,
          quantity_before: currentItem.quantity,
          quantity_after: newQuantity,
          notes: notes ?? null,
        },
      });

      // Return updated item
      const updatedRes = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        filters: [{ op: 'eq', column: 'id', value: itemId }],
        limit: 1,
      });

      return { success: true, data: updatedRes.data?.[0] ?? null, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Stock Movement: Adjust ─────────────────────────────────────────────────
  async adjustStock(propertyId: string, itemId: string, newQuantity: number, notes?: string): Promise<ApiResponse<StockItem>> {
    try {
      // Get current item
      const itemRes = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        select: 'id, quantity, name, item_code, unit',
        filters: [
          { op: 'eq', column: 'id', value: itemId },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
        limit: 1,
      });

      if (itemRes.error) throw new Error(itemRes.error.message);
      if (!itemRes.data || itemRes.data.length === 0) {
        return { success: false, data: null, error: 'Item not found', status: 404 };
      }

      const currentItem = itemRes.data[0];
      const quantityChange = newQuantity - currentItem.quantity;

      // Update quantity
      await serverApi.query({
        table: 'stock_items',
        action: 'update',
        values: { quantity: newQuantity, updated_at: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: itemId }],
      });

      // Record movement
      await serverApi.query({
        table: 'stock_movements',
        action: 'insert',
        values: {
          item_id: itemId,
          property_id: propertyId,
          action: 'adjust',
          quantity_change: quantityChange,
          quantity_before: currentItem.quantity,
          quantity_after: newQuantity,
          notes: notes ?? null,
        },
      });

      // Return updated item
      const updatedRes = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        filters: [{ op: 'eq', column: 'id', value: itemId }],
        limit: 1,
      });

      return { success: true, data: updatedRes.data?.[0] ?? null, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Fetch movements ────────────────────────────────────────────────────────
  async getMovements(propertyId: string, limit = 50): Promise<ApiResponse<StockMovement[]>> {
    try {
      const res = await serverApi.query<StockMovement[]>({
        table: 'stock_movements',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        orders: [{ column: 'created_at', ascending: false }],
        limit,
      });

      if (res.error) throw new Error(res.error.message);

      // Fetch related item names
      const movements = res.data ?? [];
      const itemIds = [...new Set(movements.map(m => m.item_id).filter(Boolean))];

      if (itemIds.length > 0) {
        const itemsRes = await serverApi.query<any[]>({
          table: 'stock_items',
          action: 'select',
          select: 'id, name, item_code, unit',
          filters: [{ op: 'in', column: 'id', value: itemIds }],
        });

        const itemsMap = new Map((itemsRes.data ?? []).map(i => [i.id, i]));

        movements.forEach(m => {
          if (m.item_id && itemsMap.has(m.item_id)) {
            m.stock_items = itemsMap.get(m.item_id);
          }
        });
      }

      return { success: true, data: movements, status: 200 };
    } catch (err: any) {
      return { success: false, data: null, error: err.message, status: 500 };
    }
  },

  // ── Bulk Import ───────────────────────────────────────────────────────────
  async bulkImport(propertyId: string, items: CreateItemPayload[]): Promise<ApiResponse<{ imported: number; failed: number; errors: string[] }>> {
    const errors: string[] = [];
    let imported = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const result = await this.createItem({
          ...item,
          property_id: propertyId,
        });
        if (result.success) {
          imported++;
        } else {
          failed++;
          errors.push(`${item.name}: ${result.error}`);
        }
      } catch (e: any) {
        failed++;
        errors.push(`${item.name}: ${e.message}`);
      }
    }

    return {
      success: true,
      data: { imported, failed, errors },
      status: 200,
    };
  },

  // ── Get QR Code Data ─────────────────────────────────────────────────────
  getQRCodeData(item: StockItem): QRCodeData {
    return {
      id: item.id,
      item_code: item.item_code,
      name: item.name,
      category: item.category ?? undefined,
    };
  },

  // ── Parse scanned QR/Barcode ─────────────────────────────────────────────
  parseScannedCode(scannedValue: string): { type: 'id' | 'item_code' | 'barcode'; value: string } | null {
    if (!scannedValue) return null;

    // Try to parse as JSON (QR code from web app)
    try {
      const data = JSON.parse(scannedValue);
      if (data.id) {
        return { type: 'id', value: data.id };
      }
      if (data.item_code) {
        return { type: 'item_code', value: data.item_code };
      }
    } catch {
      // Not JSON, continue with plain text parsing
    }

    // Check if it's a barcode format (PROPERTYCODE-ITEMCODE)
    if (scannedValue.includes('-')) {
      return { type: 'barcode', value: scannedValue };
    }

    // Treat as item_code
    return { type: 'item_code', value: scannedValue };
  },
};

export default stockService;
