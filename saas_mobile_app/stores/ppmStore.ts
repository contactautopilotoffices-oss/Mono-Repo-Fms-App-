import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export const usePpmStore = create<PPMState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'autopilot-ppm-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        schedules: state.schedules,
        hasLoadedInitialData: state.hasLoadedInitialData,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    }
  )
);
