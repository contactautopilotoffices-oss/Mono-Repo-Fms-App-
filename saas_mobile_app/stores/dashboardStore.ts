/**
 * Dashboard UI Store
 *
 * SOURCE OF TRUTH: React Query (server data)
 * ZUSTAND: UI state only (ephemeral)
 *
 * This store now holds ONLY ephemeral UI state:
 * - Background image preference
 * - Selected filters (time range, tabs)
 * - Modal states
 * - Drawer states
 *
 * Server data lives in React Query via useDashboardQuery.
 * No server data should be stored in Zustand.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '@/utils/storage';

// ────────────────────────────────────────────────────────────────
// Types — UI State Only
// ────────────────────────────────────────────────────────────────

interface DashboardUIState {
  // Background image preference
  backgroundImage: string;

  // Time filter for tickets (ephemeral UI state)
  ticketTimeFilter: 'today' | 'month' | 'all';

  // Active tab (ephemeral UI state)
  activeTab: 'overview' | 'tickets';

  // Modal/Drawer states (ephemeral)
  showDrawer: boolean;
  showNotifications: boolean;
  showPropertySwitcher: boolean;

  // Selected property context (for non-dashboard screens)
  selectedPropertyId: string | null;
}

interface DashboardActions {
  setBackgroundImage: (url: string) => void;
  setTicketTimeFilter: (filter: 'today' | 'month' | 'all') => void;
  setActiveTab: (tab: 'overview' | 'tickets') => void;
  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  toggleNotifications: () => void;
  togglePropertySwitcher: () => void;
  setSelectedPropertyId: (id: string | null) => void;
  clearUIState: () => void;
}

type DashboardStore = DashboardUIState & DashboardActions;

// ────────────────────────────────────────────────────────────────
// Initial State
// ────────────────────────────────────────────────────────────────

const initialState: DashboardUIState = {
  backgroundImage: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1200&auto=format&fit=crop',
  ticketTimeFilter: 'all',
  activeTab: 'overview',
  showDrawer: false,
  showNotifications: false,
  showPropertySwitcher: false,
  selectedPropertyId: null,
};

// ────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      ...initialState,

      setBackgroundImage: (url) => set({ backgroundImage: url }),

      setTicketTimeFilter: (filter) => set({ ticketTimeFilter: filter }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      toggleDrawer: () => set((state) => ({ showDrawer: !state.showDrawer })),

      setDrawerOpen: (open) => set({ showDrawer: open }),

      toggleNotifications: () => set((state) => ({ showNotifications: !state.showNotifications })),

      togglePropertySwitcher: () => set((state) => ({ showPropertySwitcher: !state.showPropertySwitcher })),

      setSelectedPropertyId: (id) => set({ selectedPropertyId: id }),

      clearUIState: () => set({
        ticketTimeFilter: 'all',
        activeTab: 'overview',
        showDrawer: false,
        showNotifications: false,
        showPropertySwitcher: false,
      }),
    }),
    {
      name: 'autopilot-dashboard-ui-store',
      storage: createJSONStorage(() => zustandStorage),
      // Only persist user preferences, NOT server data
      partialize: (state) => ({
        backgroundImage: state.backgroundImage,
        selectedPropertyId: state.selectedPropertyId,
      }),
    }
  )
);

// ────────────────────────────────────────────────────────────────
// Selectors (for convenience)
// ────────────────────────────────────────────────────────────────

export const useDashboardBackgroundImage = () => useDashboardStore((state) => state.backgroundImage);
export const useTicketTimeFilter = () => useDashboardStore((state) => state.ticketTimeFilter);
export const useDashboardActiveTab = () => useDashboardStore((state) => state.activeTab);
export const useShowDrawer = () => useDashboardStore((state) => state.showDrawer);
export const useShowNotifications = () => useDashboardStore((state) => state.showNotifications);
export const useShowPropertySwitcher = () => useDashboardStore((state) => state.showPropertySwitcher);
export const useSelectedPropertyId = () => useDashboardStore((state) => state.selectedPropertyId);

// ────────────────────────────────────────────────────────────────
// DEPRECATED — kept for backward compatibility during migration
// ────────────────────────────────────────────────────────────────

/**
 * @deprecated Use useDashboardQuery from '@/hooks/useDashboardQuery' instead.
 * Server data should NOT be in Zustand.
 */
export function useDashboardStore__DEPRECATED() {
  console.warn('[dashboardStore] Using deprecated store. Migrate to useDashboardQuery for server data.');
  return useDashboardStore();
}
