import { queryClient } from '@/utils/queryClient';

/**
 * Centralized query invalidation helpers.
 * Every mutation MUST invalidate related queries via these helpers.
 */
export const invalidate = {
  /** Invalidate dashboard queries for a property */
  dashboard: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['mst-dashboard', propertyId] }),

  /** Invalidate staff dashboard for a property */
  staffDashboard: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['staff-dashboard', propertyId] }),

  /** Invalidate property admin dashboard */
  propertyDashboard: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['property-dashboard', propertyId] }),

  /** Invalidate tickets list for a property */
  tickets: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['tickets', propertyId] }),

  /** Invalidate a single ticket detail */
  ticketDetail: (ticketId: string) =>
    queryClient.invalidateQueries({ queryKey: ['ticket-detail', ticketId] }),

  /** Invalidate visitors for a property */
  visitors: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['visitors', propertyId] }),

  /** Invalidate stock for a property */
  stock: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['stock', propertyId] }),

  /** Invalidate rooms for a property */
  rooms: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] }),

  /** Invalidate procurement for a property */
  procurement: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['procurement', propertyId] }),

  /** Invalidate security logs for a property */
  security: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['security', propertyId] }),

  /** Invalidate PPM for a property */
  ppm: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['ppm', propertyId] }),

  /** Invalidate checklist for a property */
  checklist: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['checklist', propertyId] }),

  /** Invalidate diesel for a property */
  diesel: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['diesel', propertyId] }),

  /** Invalidate electricity for a property */
  electricity: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['electricity', propertyId] }),

  /** Invalidate all data for a specific property */
  allForProperty: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['property', propertyId] }),

  /** Clear entire query cache (use on sign-out only) */
  everything: () => queryClient.clear(),
};
