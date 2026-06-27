import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Platform,
  Alert,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import SafeBlurView from '@/components/ui/SafeBlurView';
import Toast from '@/components/ui/Toast';
import {
  getMeetingRooms,
  getMeetingRoomBookings,
  getMeetingRoomCredits,
  createMeetingRoomBooking,
  cancelMeetingRoomBookingApi,
  deleteMeetingRoomApi,
  MeetingRoom,
  MeetingRoomBooking,
  MeetingRoomCredit,
} from '@/services/meetingRoomService';
import { useMeetingRoomStore } from '@/stores/meetingRoomStore';
import {
  ChevronLeft,
  Settings2,
  Users,
  MapPin,
  Clock,
  CalendarDays,
  Armchair,
  CheckCircle2,
  X,
  CreditCard,
  Plus,
  Trash2,
} from 'lucide-react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { format, addDays } from 'date-fns';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { RoomBookingTab } from '@/components/tenant/tabs/RoomBookingTab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomWithBookings extends MeetingRoom {
  todayBookings: MeetingRoomBooking[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  { label: '09:00 AM', start: '09:00', end: '10:00' },
  { label: '10:00 AM', start: '10:00', end: '11:00' },
  { label: '11:00 AM', start: '11:00', end: '12:00' },
  { label: '12:00 PM', start: '12:00', end: '13:00' },
  { label: '01:00 PM', start: '13:00', end: '14:00' },
  { label: '02:00 PM', start: '14:00', end: '15:00' },
  { label: '03:00 PM', start: '15:00', end: '16:00' },
  { label: '04:00 PM', start: '16:00', end: '17:00' },
  { label: '05:00 PM', start: '17:00', end: '18:00' },
  { label: '06:00 PM', start: '18:00', end: '19:00' },
  { label: '07:00 PM', start: '19:00', end: '20:00' },
];

// ─── Amenity helpers ──────────────────────────────────────────────────────────

function getAmenityIcon(amenity: string): string {
  const map: Record<string, string> = {
    tv: '📺',
    video_conference: '🎥',
    wifi: '📶',
    coffee: '☕',
    parking: '🅿️',
    air_conditioning: '❄️',
    wheelchair_access: '♿',
    phone: '📞',
  };
  return map[amenity.toLowerCase()] || '✨';
}

function formatAmenityLabel(amenity: string): string {
  return amenity.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatRemainingHours(hours: number): string {
  const num = typeof hours === 'string' ? parseFloat(hours) : hours;
  const h = Math.floor(num);
  const m = Math.round((num - h) * 60);
  return `${h} hour${h !== 1 ? 's' : ''} ${m} minute${m !== 1 ? 's' : ''}`;
}

// ─── Room Detail Bottom Sheet ─────────────────────────────────────────────────

function RoomDetailSheet({
  room,
  credit,
  isAdmin,
  bottomSheetRef,
  onBook,
}: {
  room: MeetingRoom | null;
  credit: MeetingRoomCredit | null;
  isAdmin: boolean;
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  onBook: (success: boolean, msg?: string) => void;
}) {
  const snapPoints = useMemo(() => ['65%', '85%'], []);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<(typeof TIME_SLOTS)[0] | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  useEffect(() => {
    setSelectedDate(new Date());
    setSelectedSlot(null);
  }, [room?.id]);

  const dateOptions = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      dates.push(addDays(new Date(), i));
    }
    return dates;
  }, []);

  async function handleBook(overrideSlot?: typeof TIME_SLOTS[0]) {
    const targetSlot = overrideSlot?.start ? overrideSlot : selectedSlot;
    if (!room || !targetSlot) return;
    setBookingLoading(true);
    try {
      const response = await createMeetingRoomBooking({
        meetingRoomId: room.id,
        propertyId: room.property_id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: targetSlot.start,
        endTime: targetSlot.end,
      });
      if (response.error) throw new Error(response.error);
      setSelectedSlot(null);
      bottomSheetRef.current?.dismiss();
      onBook(true, `Room booked for ${targetSlot.label}`);
    } catch (err: any) {
      onBook(false, err.message || 'Could not book this room.');
    } finally {
      setBookingLoading(false);
    }
  }

  if (!room) return null;

  return (
    <BottomSheetModal ref={bottomSheetRef} snapPoints={snapPoints} backgroundStyle={{ backgroundColor: '#1E293B' }} handleIndicatorStyle={{ backgroundColor: '#94A3B8' }}>
      <BottomSheetScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Room Info */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }}>{room.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <MapPin size={14} color="#94A3B8" />
              <Text style={{ color: '#94A3B8', fontFamily: 'Urbanist-Medium', fontSize: 14 }}>{room.location || 'General Area'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Users size={14} color="#94A3B8" />
              <Text style={{ color: '#94A3B8', fontFamily: 'Urbanist-Medium', fontSize: 14 }}>{room.capacity} people</Text>
            </View>
          </View>
        </View>

        {/* Amenities */}
        {room.amenities && room.amenities.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#94A3B8', fontFamily: 'Urbanist-SemiBold', fontSize: 13, marginBottom: 8 }}>AMENITIES</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {room.amenities.map((a) => (
                <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
                  <Text>{getAmenityIcon(a)}</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 12, fontFamily: 'Urbanist-SemiBold' }}>{formatAmenityLabel(a)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Credits (non-admin) */}
        {!isAdmin && credit && (
          <View style={{ backgroundColor: 'rgba(255,159,10,0.1)', borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} color="#FF9F0A" />
            <Text style={{ color: '#FF9F0A', fontFamily: 'Urbanist-SemiBold', fontSize: 14 }}>
              {formatRemainingHours(credit.remaining_hours)} remaining · resets {format(new Date(credit.next_reset_at), 'MMM d')}
            </Text>
          </View>
        )}

        {/* Date Selection */}
        <Text style={{ color: '#94A3B8', fontFamily: 'Urbanist-SemiBold', fontSize: 13, marginBottom: 8 }}>SELECT DATE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {dateOptions.map((d) => {
            const isSelected = format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
            return (
              <TouchableOpacity
                key={d.toISOString()}
                onPress={() => setSelectedDate(d)}
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginRight: 8, backgroundColor: isSelected ? '#708F96' : 'rgba(255,255,255,0.08)' }}
              >
                <Text style={{ color: '#FFFFFF', fontFamily: 'Urbanist-SemiBold', fontSize: 13 }}>{format(d, 'EEE')}</Text>
                <Text style={{ color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 16 }}>{format(d, 'd')}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Time Slots */}
        <Text style={{ color: '#94A3B8', fontFamily: 'Urbanist-SemiBold', fontSize: 13, marginBottom: 8 }}>SELECT TIME</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIME_SLOTS.map((slot) => {
            const isSelected = selectedSlot?.start === slot.start;
            return (
              <TouchableOpacity
                key={slot.start}
                onPress={() => setSelectedSlot(isSelected ? null : slot)}
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: isSelected ? '#10B981' : 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: isSelected ? '#10B981' : 'rgba(255,255,255,0.12)' }}
              >
                <Text style={{ color: '#FFFFFF', fontFamily: 'Urbanist-SemiBold', fontSize: 13 }}>{slot.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Book Button */}
        <TouchableOpacity
          onPress={handleBook}
          disabled={!selectedSlot || bookingLoading}
          style={{ backgroundColor: selectedSlot ? '#10B981' : '#4B5563', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 }}
        >
          {bookingLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 16 }}>
              {selectedSlot ? `Book ${selectedSlot.label}` : 'Select a time slot'}
            </Text>
          )}
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RoomsScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const { membership, user } = useAuth();

  const { setRooms, setBookings, setCredit, setHasLoadedInitialData } = useMeetingRoomStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [activeTab, setActiveTab] = useState<'rooms' | 'bookings' | 'all-bookings'>('rooms');
  const [toastConfig, setToastConfig] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const roomSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (!membership || !propertyId) return;
    const role = membership.properties?.find((p: any) => p.id === propertyId)?.role;
    setIsAdmin(role === 'property_admin' || role === 'staff' || role === 'org_super_admin');
  }, [membership, propertyId]);

  const fetchData = useCallback(async () => {
    if (!propertyId) return { rooms: [] as MeetingRoom[], bookings: [] as MeetingRoomBooking[], credit: null as MeetingRoomCredit | null };
    try {
      const [roomsRes, bookingsRes, creditsRes] = await Promise.all([
        getMeetingRooms(propertyId),
        getMeetingRoomBookings(propertyId),
        isAdmin ? Promise.resolve({ credit: null }) : getMeetingRoomCredits(propertyId),
      ]);
      const rooms = roomsRes.rooms || [];
      const bookings = bookingsRes.bookings || [];
      const credit = !isAdmin && creditsRes.credit !== undefined ? creditsRes.credit : null;
      setRooms(rooms);
      setBookings(bookings);
      setCredit(credit);
      setHasLoadedInitialData(true);
      return { rooms, bookings, credit };
    } catch (e) {
      console.error('[Rooms] fetch error:', e);
      return { rooms: [] as MeetingRoom[], bookings: [] as MeetingRoomBooking[], credit: null as MeetingRoomCredit | null };
    }
  }, [propertyId, isAdmin, setRooms, setBookings, setCredit, setHasLoadedInitialData]);

  const { data, isLoading, refetch } = useServerQuery(
    queryKeys.property.rooms(propertyId),
    fetchData,
    { staleTime: 1000 * 30 }
  );

  const rooms = data?.rooms ?? [];
  const bookings = data?.bookings ?? [];
  const credit = data?.credit ?? null;

  async function handleCancelBooking(bookingId: string) {
    try {
      const res = await cancelMeetingRoomBookingApi(bookingId);
      if (res.error) throw new Error(res.error);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not cancel booking.');
    }
  }

  function handleBook(success: boolean, msg?: string) {
    if (success) {
      setToastConfig({ message: msg || 'Booked!', type: 'success' });
      refetch();
    } else {
      setToastConfig({ message: msg || 'Booking failed', type: 'error' });
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <SafeBlurView intensity={80} tint="dark" style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Meeting Rooms</Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'rooms' ? `${rooms.length} room${rooms.length !== 1 ? 's' : ''} available` : `${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          {isAdmin ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.adminBtn} onPress={() => router.push(`/property/${propertyId}/rooms/add-room`)}>
                <Plus size={20} color="#708F96" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.adminBtn} onPress={() => router.push(`/property/${propertyId}/rooms/admin-credits`)}>
                <Settings2 size={20} color="#708F96" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
      </SafeBlurView>

      {/* Credit Banner (non-admin) */}
      {!isAdmin && credit && (
        <View style={styles.creditBanner}>
          <SafeBlurView intensity={60} tint="dark" style={styles.creditBannerInner}>
            <LinearGradient colors={['rgba(255,159,10,0.12)', 'rgba(255,159,10,0.04)']} style={StyleSheet.absoluteFillObject} />
            <CreditCard size={18} color="#FF9F0A" />
            <Text style={styles.creditBannerText}>Monthly Quota: <Text style={{ fontFamily: 'Poppins-Bold' }}>{credit.monthly_hours}h</Text> · <Text style={styles.creditBannerHighlight}>{formatRemainingHours(credit.remaining_hours)}</Text> remaining</Text>
          </SafeBlurView>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, activeTab === 'rooms' && styles.tabActive]} onPress={() => setActiveTab('rooms')}>
          <Text style={[styles.tabText, activeTab === 'rooms' && styles.tabTextActive]}>Rooms</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'bookings' && styles.tabActive]} onPress={() => setActiveTab('bookings')}>
          <Text style={[styles.tabText, activeTab === 'bookings' && styles.tabTextActive]}>My Bookings</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={[styles.tab, activeTab === 'all-bookings' && styles.tabActive]} onPress={() => setActiveTab('all-bookings')}>
            <Text style={[styles.tabText, activeTab === 'all-bookings' && styles.tabTextActive]}>All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {isLoading && activeTab !== 'rooms' ? (
        <View style={{ flex: 1, padding: 16 }}>
          <SkeletonLoader type="list" count={4} />
        </View>
      ) : activeTab === 'rooms' ? (
        <View style={{ flex: 1, paddingTop: 8 }}>
          <RoomBookingTab propertyId={propertyId} userId={user?.id || ''} />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 12) + 160 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <SafeBlurView intensity={40} style={styles.bookingCard} tint="dark">
              <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.15)']} style={StyleSheet.absoluteFillObject} />
              <View style={styles.cardContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.meeting_room?.name || 'Room'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <CalendarDays size={12} color="#708F96" />
                      <Text style={styles.cardMetaText}>
                        {item.booking_date} · {item.start_time} - {item.end_time}
                        {item.start_time && item.end_time ? ` (${(new Date(`1970-01-01T${item.end_time}`).getTime() - new Date(`1970-01-01T${item.start_time}`).getTime()) / (1000 * 60 * 60)} hrs)` : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Users size={12} color="#708F96" />
                      <Text style={styles.cardMetaText}>{item.tenant?.full_name || 'Tenant'}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.amenityChip, {
                      backgroundColor: item.status === 'confirmed' ? 'rgba(16,185,129,0.15)' : item.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(255,159,10,0.15)',
                      borderColor: item.status === 'confirmed' ? 'rgba(16,185,129,0.3)' : item.status === 'cancelled' ? 'rgba(239,68,68,0.3)' : 'rgba(255,159,10,0.3)',
                      margin: 0,
                    }]}>
                      <Text style={[styles.amenityText, { color: item.status === 'confirmed' ? '#10B981' : item.status === 'cancelled' ? '#EF4444' : '#FF9F0A' }]}>
                        {item.status || 'Confirmed'}
                      </Text>
                    </View>
                    {(isAdmin || item.user_id === user?.id) && item.status === 'confirmed' && (
                      <TouchableOpacity onPress={() => Alert.alert('Cancel Booking', 'Are you sure?', [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes', style: 'destructive', onPress: () => handleCancelBooking(item.id) },
                      ])} style={{ padding: 8 }}>
                        <Trash2 size={16} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </SafeBlurView>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Armchair size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyTitle}>No Bookings</Text>
              <Text style={styles.emptySubtitle}>No bookings found.</Text>
            </View>
          }
        />
      )}

      {/* Room Detail Sheet */}
      <RoomDetailSheet room={selectedRoom} credit={credit} isAdmin={isAdmin} bottomSheetRef={roomSheetRef} onBook={handleBook} />

      {/* Toast */}
      {toastConfig && (
        <Toast message={toastConfig.message} type={toastConfig.type} />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.12)', zIndex: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 2 },
  adminBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  creditBanner: { paddingHorizontal: 16, paddingTop: 12 },
  creditBannerInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,159,10,0.25)', overflow: 'hidden' },
  creditBannerText: { fontSize: 13, fontFamily: 'Urbanist-SemiBold', color: '#E2E8F0' },
  creditBannerHighlight: { color: '#FF9F0A', fontFamily: 'Poppins-Bold' },
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  tabText: { fontSize: 14, fontFamily: 'Urbanist-SemiBold', color: '#94A3B8' },
  tabTextActive: { color: '#FFFFFF' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 16 },
  listContent: { padding: 16 },
  bookingCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  cardContent: { padding: 14 },
  cardName: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  cardMetaText: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  amenityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  amenityText: { fontSize: 10, fontFamily: 'Urbanist-SemiBold', color: '#94A3B8' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins-Bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontFamily: 'Urbanist-Medium', color: '#94A3B8', textAlign: 'center' },
});
