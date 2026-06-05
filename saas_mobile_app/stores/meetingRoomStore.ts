import { create } from 'zustand';
import { 
  MeetingRoom, 
  MeetingRoomBooking, 
  MeetingRoomCredit, 
  MeetingRoomSlot,
  getMeetingRoomSlotsApi,
  getMeetingRooms,
  getMeetingRoomBookingsByDate
} from '@/services/meetingRoomService';

interface CachedAvailability {
  rooms: MeetingRoom[];
  bookings: MeetingRoomBooking[];
  timestamp: number;
}

interface MeetingRoomState {
  rooms: MeetingRoom[];
  bookings: MeetingRoomBooking[];
  slots: MeetingRoomSlot[];
  slotsTimestamp: number | null;
  cachedAvailability: Record<string, CachedAvailability>;

  // Standard fields
  credit: MeetingRoomCredit | null;
  hasLoadedInitialData: boolean;

  // Actions
  setRooms: (rooms: MeetingRoom[]) => void;
  setBookings: (bookings: MeetingRoomBooking[]) => void;
  fetchSlots: () => Promise<void>;
  fetchAvailability: (propertyId: string, dateStr: string) => Promise<{ rooms: MeetingRoom[], bookings: MeetingRoomBooking[] }>;
  invalidateDateCache: (propertyId: string, dateStr: string) => void;

  setCredit: (credit: MeetingRoomCredit | null) => void;
  setHasLoadedInitialData: (loaded: boolean) => void;
  clearCache: () => void;
}

const CACHE_TTL_MS = 30000; // 30 seconds

export const useMeetingRoomStore = create<MeetingRoomState>((set, get) => ({
  rooms: [],
  bookings: [],
  slots: [],
  slotsTimestamp: null,
  cachedAvailability: {},

  credit: null,
  hasLoadedInitialData: false,

  setRooms: (rooms) => set({ rooms }),
  setBookings: (bookings) => set({ bookings }),

  fetchSlots: async () => {
    const { slotsTimestamp, slots } = get();
    // Cache slots for 5 minutes since they rarely change
    if (slotsTimestamp && Date.now() - slotsTimestamp < 5 * 60 * 1000 && slots.length > 0) {
      return;
    }
    
    const res = await getMeetingRoomSlotsApi();
    if (!res.error && res.slots) {
      set({ slots: res.slots, slotsTimestamp: Date.now() });
    }
  },

  fetchAvailability: async (propertyId: string, dateStr: string) => {
    const cacheKey = `${propertyId}_${dateStr}`;
    const cached = get().cachedAvailability[cacheKey];
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { rooms: cached.rooms, bookings: cached.bookings };
    }

    // Fetch rooms and bookings in parallel
    const [roomsRes, bookingsRes] = await Promise.all([
      getMeetingRooms(propertyId, 'active'),
      getMeetingRoomBookingsByDate(propertyId, dateStr)
    ]);

    const rooms = roomsRes.rooms || [];
    const bookings = bookingsRes.bookings || [];

    set((state) => ({
      cachedAvailability: {
        ...state.cachedAvailability,
        [cacheKey]: { rooms, bookings, timestamp: Date.now() }
      }
    }));

    return { rooms, bookings };
  },

  invalidateDateCache: (propertyId: string, dateStr: string) => {
    const cacheKey = `${propertyId}_${dateStr}`;
    set((state) => {
      const newCache = { ...state.cachedAvailability };
      delete newCache[cacheKey];
      return { cachedAvailability: newCache };
    });
  },

  setCredit: (credit) => set({ credit }),
  setHasLoadedInitialData: (loaded) => set({ hasLoadedInitialData: loaded }),
  clearCache: () => set({
    rooms: [], bookings: [], slots: [], slotsTimestamp: null, cachedAvailability: {}, credit: null, hasLoadedInitialData: false,
  }),
}));
