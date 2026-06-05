'use client';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ScrollView, Platform, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { useMeetingRoomStore } from '@/stores/meetingRoomStore';
import { MeetingRoomCard, Room } from './MeetingRoomCard';
import { createMeetingRoomBooking } from '@/services/meetingRoomService';

interface RoomBookingTabProps {
  propertyId: string;
  userId: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}

const CAPACITY_OPTIONS = [
  { label: 'Any', value: null },
  { label: '2+', value: 2 },
  { label: '4+', value: 4 },
  { label: '6+', value: 6 },
  { label: '8+', value: 8 },
];

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function RoomBookingTab({ propertyId, userId, refreshing, onRefresh }: RoomBookingTabProps) {
  const { slots, cachedAvailability, fetchSlots, fetchAvailability, invalidateDateCache } = useMeetingRoomStore();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCapacity, setSelectedCapacity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Generate next 14 days
  const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d;
  });

  const dateStr = formatLocalDate(selectedDate);
  const currentData = cachedAvailability[`${propertyId}_${dateStr}`];

  useEffect(() => {
    fetchSlots();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await fetchAvailability(propertyId, dateStr);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [propertyId, dateStr]);

  const handleRefresh = async () => {
    invalidateDateCache(propertyId, dateStr);
    await loadData();
    onRefresh?.();
  };

  const handleBookRoom = async (room: Room, startTime: string, endTime: string) => {
    const res = await createMeetingRoomBooking({
        meetingRoomId: room.id,
        propertyId,
        date: dateStr,
        startTime,
        endTime
    });

    if (res.error) {
        Alert.alert('Booking Failed', res.error);
    } else {
        // Invalidate cache for this date so it refetches immediately
        invalidateDateCache(propertyId, dateStr);
        await fetchAvailability(propertyId, dateStr);
        Alert.alert('Success', `Successfully booked ${room.name}`);
    }
  };

  // Filter rooms
  let displayRooms = currentData?.rooms || [];
  if (selectedCapacity) {
      displayRooms = displayRooms.filter(r => r.capacity >= selectedCapacity);
  }

  // Inject bookings into room objects for the card to calculate overlaps
  const roomsWithBookings = displayRooms.map(room => ({
      ...room,
      bookings: currentData?.bookings?.filter((b: any) => b.meeting_room_id === room.id) || []
  }));

  return (
    <View style={styles.container}>
      {/* Date Selector */}
      <View style={styles.dateSelectorWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
              {days.map((d, i) => {
                  const isSelected = d.toDateString() === selectedDate.toDateString();
                  return (
                      <TouchableOpacity
                          key={i}
                          onPress={() => setSelectedDate(d)}
                          style={[styles.dateItem, isSelected && styles.dateItemActive]}
                      >
                          <Text style={[styles.dateDayName, isSelected && styles.dateTextActive]}>
                              {d.toLocaleDateString('en-US', { weekday: 'short' })}
                          </Text>
                          <Text style={[styles.dateDayNum, isSelected && styles.dateTextActive]}>
                              {d.getDate()}
                          </Text>
                          <Text style={[styles.dateMonthName, isSelected && styles.dateTextActive]}>
                              {d.toLocaleDateString('en-US', { month: 'short' })}
                          </Text>
                      </TouchableOpacity>
                  );
              })}
          </ScrollView>
      </View>

      {/* Capacity filter */}
      <View style={styles.capacityRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CAPACITY_OPTIONS.map((opt) => (
            <TouchableOpacity
                key={opt.label}
                onPress={() => setSelectedCapacity(opt.value)}
                style={[styles.capChip, selectedCapacity === opt.value && styles.capChipActive]}
                activeOpacity={0.7}
            >
                <Text style={[styles.capChipText, selectedCapacity === opt.value && styles.capChipTextActive]}>
                {opt.label}
                </Text>
            </TouchableOpacity>
            ))}
        </ScrollView>
      </View>

      {/* Rooms list */}
      <FlatList
        data={roomsWithBookings}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
            <MeetingRoomCard 
                room={item} 
                slots={slots} 
                selectedDate={selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} 
                onBook={handleBookRoom} 
            />
          </Animated.View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing ?? loading}
            onRefresh={handleRefresh}
            tintColor="#708F96"
            colors={['#708F96']}
          />
        }
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(100)} style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#708F96" strokeWidth="1.5" strokeLinecap="round">
                <Rect x="3" y="3" width="18" height="18" rx="2" />
                <Path d="M3 9h18M9 21V9" />
              </Svg>
            </View>
            <Text style={styles.emptyText}>
              {loading ? 'Finding available rooms...' : 'No rooms available'}
            </Text>
            <Text style={styles.emptySubtext}>
              {loading ? '' : 'Try adjusting your capacity filter or selecting a different date.'}
            </Text>
          </Animated.View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    fontWeight: '500',
  },
  dateSelectorWrap: {
    paddingVertical: 12,
  },
  dateScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dateItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    width: 64,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateItemActive: {
    backgroundColor: 'rgba(112,143,150,0.15)',
    borderColor: '#708F96',
  },
  dateDayName: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 2,
  },
  dateDayNum: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  dateMonthName: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
  },
  dateTextActive: {
    color: '#708F96',
  },
  capacityRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  capChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  capChipActive: {
    backgroundColor: '#708F96',
    borderColor: '#708F96',
    shadowColor: '#708F96',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  capChipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  capChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 200,
  },
  empty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(112,143,150,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
});
