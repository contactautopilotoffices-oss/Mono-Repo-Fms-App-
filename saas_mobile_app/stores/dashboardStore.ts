import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '@/utils/storage';
import type { Ticket } from '@/types';

// ---------------------------------------------------------------------------
// Dashboard State Types — Module 1.3: Property & Status Handshake
// ---------------------------------------------------------------------------

interface DashboardState {
  // Ticket data
  tickets: Ticket[];
  ticketCounts: {
    all: { total: number; open: number; closed: number };
    month: { total: number; open: number; closed: number };
    today: { total: number; open: number; closed: number };
  };
  // SOP data
  sopCount: number;
  sopTotal: number;
  // Energy data
  energyKwh: number;
  energyTrend: number;
  // Property context (org_id scoping is critical)
  propertyName: string;
  loadedPropertyId: string | null;
  // Visitor stats
  vmsStats: { total: number; in: number; out: number };
  // Vendor stats
  vendorStats: { revenue: number; commission: number };
  // Diesel stats
  dieselStats: { level: number; consumption: number };
  // Health score
  healthScore: number | null;
  // Attention items (tickets needing action)
  attentionItems: Ticket[];
  // Kanban funnel
  ticketFunnel: { status: string; count: number }[];
  // Tenant cache
  tenantUserIds: string[];
  // Cache state
  hasLoadedInitialData: boolean;
  lastUpdatedAt: number | null;
  backgroundImage: string;
  
  // Per-property cache
  propertyCache: Record<string, Partial<DashboardState>>;

  // Actions
  setBackgroundImage: (url: string) => void;
  setDashboardData: (data: Partial<DashboardState>) => void;
  switchProperty: (newPropertyId: string) => void;
  clearCache: () => void;
}

const initialState = {
  tickets: [],
  ticketCounts: {
    all: { total: 0, open: 0, closed: 0 },
    month: { total: 0, open: 0, closed: 0 },
    today: { total: 0, open: 0, closed: 0 }
  },
  sopCount: 0,
  sopTotal: 0,
  energyKwh: 0,
  energyTrend: 12,
  propertyName: 'Property',
  vmsStats: { total: 0, in: 0, out: 0 },
  vendorStats: { revenue: 0, commission: 0 },
  dieselStats: { level: 0, consumption: 0 },
  healthScore: null,
  attentionItems: [],
  ticketFunnel: [],
  tenantUserIds: [],
  hasLoadedInitialData: false,
  loadedPropertyId: null,
  lastUpdatedAt: null,
  backgroundImage: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1200&auto=format&fit=crop', // Night sky default
  propertyCache: {},
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setBackgroundImage: (url) => set((state) => ({ ...state, backgroundImage: url })),
      setDashboardData: (data) => set((state) => {
        const nextState = { ...state, ...data };
        // If we have a loaded property, update its cache entry
        if (nextState.loadedPropertyId) {
          nextState.propertyCache = {
            ...nextState.propertyCache,
            [nextState.loadedPropertyId]: { ...nextState }
          };
        }
        return nextState;
      }),
      switchProperty: (newPropertyId: string) => set((state) => {
        // If we are already on this property, do nothing
        if (state.loadedPropertyId === newPropertyId) return state;

        // Ensure current state is saved to cache before switching
        const newCache = { ...state.propertyCache };
        if (state.loadedPropertyId) {
          newCache[state.loadedPropertyId] = { ...state };
        }

        // Try to load from cache
        const cachedState = newCache[newPropertyId];
        
        if (cachedState) {
          return {
            ...state,
            ...cachedState,
            propertyCache: newCache,
            loadedPropertyId: newPropertyId,
            hasLoadedInitialData: true,
          };
        }

        // No cache found, reset to initial state for new property
        return {
          ...state,
          ...initialState,
          backgroundImage: state.backgroundImage, // preserve background
          propertyCache: newCache,
          loadedPropertyId: newPropertyId,
          hasLoadedInitialData: false,
        };
      }),
      clearCache: () => set((state) => ({
        ...initialState,
        backgroundImage: state.backgroundImage, // preserve background
        propertyCache: {},
      })),
    }),
    {
      name: 'autopilot-dashboard-store',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        backgroundImage: state.backgroundImage,
        loadedPropertyId: state.loadedPropertyId,
        // Also persist active state for the current session
        tickets: state.tickets,
        ticketCounts: state.ticketCounts,
        sopCount: state.sopCount,
        sopTotal: state.sopTotal,
        energyKwh: state.energyKwh,
        energyTrend: state.energyTrend,
        propertyName: state.propertyName,
        vmsStats: state.vmsStats,
        vendorStats: state.vendorStats,
        dieselStats: state.dieselStats,
        healthScore: state.healthScore,
        attentionItems: state.attentionItems,
        ticketFunnel: state.ticketFunnel,
        tenantUserIds: state.tenantUserIds,
        hasLoadedInitialData: state.hasLoadedInitialData,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Atomic selectors — prevent full-tree re-renders
// ---------------------------------------------------------------------------

export const useDashboardTickets = () => useDashboardStore((state) => state.tickets);
export const useDashboardTicketCounts = () => useDashboardStore((state) => state.ticketCounts);
export const useDashboardSopCount = () => useDashboardStore((state) => state.sopCount);
export const useDashboardSopTotal = () => useDashboardStore((state) => state.sopTotal);
export const useDashboardEnergyKwh = () => useDashboardStore((state) => state.energyKwh);
export const useDashboardEnergyTrend = () => useDashboardStore((state) => state.energyTrend);
export const useDashboardPropertyName = () => useDashboardStore((state) => state.propertyName);
export const useDashboardLoadedPropertyId = () => useDashboardStore((state) => state.loadedPropertyId);
export const useDashboardVmsStats = () => useDashboardStore((state) => state.vmsStats);
export const useDashboardVendorStats = () => useDashboardStore((state) => state.vendorStats);
export const useDashboardDieselStats = () => useDashboardStore((state) => state.dieselStats);
export const useDashboardHealthScore = () => useDashboardStore((state) => state.healthScore);
export const useDashboardAttentionItems = () => useDashboardStore((state) => state.attentionItems);
export const useDashboardTicketFunnel = () => useDashboardStore((state) => state.ticketFunnel);
export const useDashboardTenantUserIds = () => useDashboardStore((state) => state.tenantUserIds);
export const useDashboardHasLoadedInitialData = () => useDashboardStore((state) => state.hasLoadedInitialData);
export const useDashboardLastUpdatedAt = () => useDashboardStore((state) => state.lastUpdatedAt);
export const useDashboardBackgroundImage = () => useDashboardStore((state) => state.backgroundImage);

