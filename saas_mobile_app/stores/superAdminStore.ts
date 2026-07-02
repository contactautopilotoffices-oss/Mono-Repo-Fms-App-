import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '@/utils/storage';

// ---------------------------------------------------------------------------
// Super Admin Dashboard State — cached for instant load
// ---------------------------------------------------------------------------

export interface SuperAdminProperty {
  id: string;
  name: string;
  code: string;
  address?: string;
  image_url?: string;
  openTickets: number;
  resolvedTickets: number;
  totalTickets: number;
  healthScore: number;
  healthStatus: 'optimal' | 'warning' | 'critical';
  checklist: { completed: number; total: number; percent: number };
  energy: { diesel: number; electricity: number; trend: number };
  water: { quantity: number; cost: number };
  tickets: { day: string; count: number }[];
  status: 'optimal' | 'warning' | 'critical';
}

export interface SuperAdminOrg {
  id: string;
  name: string;
  code: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  available_modules: string[] | null;
  status: string | null;
  properties?: { count: number }[];
}

export interface SystemUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

interface SuperAdminState {
  // Cached data
  properties: SuperAdminProperty[];
  organizations: SuperAdminOrg[];
  users: SystemUser[];
  // Meta
  hasLoadedInitialData: boolean;
  loadedOrgId: string | null;
  lastUpdatedAt: number | null;
  // Actions
  setSuperAdminData: (data: Partial<Omit<SuperAdminState, 'actions'>>) => void;
  clearCache: () => void;
}

const initialState = {
  properties: [],
  organizations: [],
  users: [],
  hasLoadedInitialData: false,
  loadedOrgId: null,
  lastUpdatedAt: null,
};

export const useSuperAdminStore = create<SuperAdminState>()(
  persist(
    (set) => ({
      ...initialState,
      setSuperAdminData: (data) => set((state) => ({ ...state, ...data })),
      clearCache: () => set({ ...initialState }),
    }),
    {
      name: 'autopilot-super-admin-store',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        properties: state.properties,
        organizations: state.organizations,
        users: state.users,
        hasLoadedInitialData: state.hasLoadedInitialData,
        loadedOrgId: state.loadedOrgId,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    }
  )
);
