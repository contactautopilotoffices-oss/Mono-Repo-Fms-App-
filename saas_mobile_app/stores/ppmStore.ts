import { create } from 'zustand';
import { PPMSchedule } from '@/services/ppmService';

// ---------------------------------------------------------------------------
// PPM State — shared across PPMProgressCard, PPMActivityTile, and dashboard components
// ---------------------------------------------------------------------------

interface PPMState {
  schedules: Record<string, PPMSchedule[]>; // keyed by propertyId
  hasLoadedInitialData: Record<string, boolean>;
  lastUpdatedAt: Record<string, number>; // keyed by propertyId
  // Actions
  setSchedules: (propertyId: string, schedules: PPMSchedule[]) => void;
  clearCache: (propertyId?: string) => void;
}

const initialState = {
  schedules: {},
  hasLoadedInitialData: {},
  lastUpdatedAt: {},
};

export const usePpmStore = create<PPMState>()((set) => ({
  ...initialState,
  setSchedules: (propertyId, schedules) =>
    set((state) => ({
      schedules: { ...state.schedules, [propertyId]: schedules },
      hasLoadedInitialData: { ...state.hasLoadedInitialData, [propertyId]: true },
      lastUpdatedAt: { ...state.lastUpdatedAt, [propertyId]: Date.now() },
    })),
  clearCache: (propertyId) =>
    set((state) => {
      if (propertyId) {
        const { [propertyId]: _p, ...restSchedules } = state.schedules;
        const { [propertyId]: _h, ...restLoaded } = state.hasLoadedInitialData;
        const { [propertyId]: _t, ...restUpdated } = state.lastUpdatedAt;
        return { schedules: restSchedules, hasLoadedInitialData: restLoaded, lastUpdatedAt: restUpdated };
      }
      return { ...initialState };
    }),
}));
