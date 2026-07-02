import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Platform, ActivityIndicator, Image, Dimensions, TextInput } from 'react-native';
import Svg, { Path, Circle, Rect, G, Defs, Pattern, Line } from 'react-native-svg';
import { Camera, ChevronDown } from 'lucide-react-native';


export interface Room {
  id: string;
  name: string;
  capacity: number;
  location?: string | null;
  status: string;
  photo_url?: string | null;
  amenities?: string[];
  bookings?: any[]; // Local bookings array passed from parent
}

interface Slot {
  start_time: string;
  end_time: string;
}

interface MeetingRoomCardProps {
  room: Room;
  slots: Slot[];
  selectedDate: string;
  onBook: (room: Room, startTime: string, endTime: string, comment?: string) => Promise<void>;
}

function RoomIcon({ color }: { color: string }) {
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="3" width="18" height="18" rx="2" />
      <Path d="M3 9h18M9 21V9" />
    </Svg>
  );
}

function ClockIcon({ color, size = 12 }: { color: string, size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 6v6l4 2" />
    </Svg>
  );
}

function StripedBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stripes)" />
      </Svg>
    </View>
  );
}

const timeToMins = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const minsToTime = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
};

const formatTimeForDisplay = (timeString: string) => {
  if (!timeString) return '';
  const [h, m] = timeString.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
};

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function MeetingRoomCard({ room, slots: apiSlots, selectedDate, onBook }: MeetingRoomCardProps) {
  const dynamicTimelineSlots = React.useMemo(() => {
    if (!apiSlots || apiSlots.length === 0) {
      const defaultSlots = [];
      for (let h = 9; h <= 18; h++) {
        for (let m = 0; m < 60; m += 15) {
          defaultSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
      }
      defaultSlots.push('19:00');
      return defaultSlots;
    }

    let minHour = 24;
    let maxHour = 0;

    apiSlots.forEach(slot => {
      const startH = parseInt(slot.start_time.split(':')[0], 10);
      const endH = parseInt(slot.end_time.split(':')[0], 10);
      const endM = parseInt(slot.end_time.split(':')[1], 10);
      
      if (startH < minHour) minHour = startH;
      if (endH > maxHour) maxHour = endH;
      if (endM > 0 && endH >= maxHour) {
         maxHour = endH + 1;
      }
    });

    if (minHour < 0 || minHour > 23) minHour = 9;
    if (maxHour < 0 || maxHour > 24) maxHour = 18;

    const computedSlots = [];
    for (let h = minHour; h < maxHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        computedSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    computedSlots.push(`${String(maxHour).padStart(2, '0')}:00`);
    return computedSlots;
  }, [apiSlots]);

  const [isCustomTime, setIsCustomTime] = useState(false);
  const [customStart, setCustomStart] = useState('09:00');
  const [customEnd, setCustomEnd] = useState('10:00');
  const [customComment, setCustomComment] = useState('');
  const [customError, setCustomError] = useState('');
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);
  
  const [showStartDropdown, setShowStartDropdown] = useState(false);
  const [showEndDropdown, setShowEndDropdown] = useState(false);
  
  const [pendingBooking, setPendingBooking] = useState<{ start: string; end: string; comment: string } | null>(null);
  const [partialConfirm, setPartialConfirm] = useState<{ start: string; end: string; comment: string } | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Determine availability for a specific time range
  const getSlotAvailability = (start: string, end: string) => {
    const sMins = timeToMins(start);
    const eMins = timeToMins(end);
    let freeSegments = [{ start: sMins, end: eMins }];

    if (room.bookings) {
      const overlaps = room.bookings.map((b: any) => ({
        start: timeToMins(b.start_time),
        end: timeToMins(b.end_time)
      })).filter((b: any) => b.start < eMins && b.end > sMins);

      for (const b of overlaps) {
        let newFree: {start: number, end: number}[] = [];
        for (const seg of freeSegments) {
          if (b.end <= seg.start || b.start >= seg.end) {
            newFree.push(seg);
          } else {
            if (b.start > seg.start) newFree.push({ start: seg.start, end: b.start });
            if (b.end < seg.end) newFree.push({ start: b.end, end: seg.end });
          }
        }
        freeSegments = newFree;
      }
    }

    freeSegments = freeSegments.filter(seg => (seg.end - seg.start) >= 30);

    if (freeSegments.length === 0) return { type: 'BOOKED' };
    
    if (freeSegments.length === 1 && freeSegments[0].start === sMins && freeSegments[0].end === eMins) {
      return { type: 'AVAILABLE', availableTime: { start, end } };
    }

    freeSegments.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    const bestSeg = freeSegments[0];
    
    return {
      type: 'PARTIAL',
      position: bestSeg.start > sMins ? 'right' : 'left',
      availableTime: { start: minsToTime(bestSeg.start), end: minsToTime(bestSeg.end) }
    };
  };

  const handleCustomBook = () => {
    setCustomError('');

    const startMins = timeToMins(customStart);
    const endMins = timeToMins(customEnd);

    if (endMins <= startMins) {
      setCustomError('End time must be after start time.');
      return;
    }
    if (endMins - startMins < 30) {
      setCustomError('Minimum booking is 30 mins.');
      return;
    }

    const formattedStart = `${customStart}:00`;
    const formattedEnd = `${customEnd}:00`;

    const avail = getSlotAvailability(formattedStart, formattedEnd);
    if (avail.type === 'BOOKED' || avail.type === 'PARTIAL') {
      setCustomError('Time overlaps with an existing booking.');
      return;
    }

    setPendingBooking({ start: formattedStart, end: formattedEnd, comment: customComment.trim() });
  };

  const confirmBooking = async (start: string, end: string, comment?: string) => {
    setIsBooking(true);
    await onBook(room, start, end, comment);
    setIsBooking(false);
    setPendingBooking(null);
    setPartialConfirm(null);
    setCustomComment('');
  };

  return (
    <View style={styles.card}>
      {/* Photo + Header Info */}
      <View style={styles.headerRow}>
        {/* Photo */}
        {room.photo_url ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setEnlargedPhoto(room.photo_url!)} style={styles.photoWrap}>
            <Image source={{ uri: room.photo_url }} style={styles.photoThumb} />
            <View style={styles.photoBadge}>
              <Camera size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.photoWrap}>
            <View style={[styles.photoThumb, styles.photoPlaceholder]}>
              <RoomIcon color="rgba(255,255,255,0.3)" />
            </View>
          </View>
        )}
        {/* Info */}
        <View style={styles.infoCol}>
          <Text style={styles.roomName}>{room.name}</Text>
          <View style={styles.metaRow}>
             <Text style={styles.metaText}>{room.capacity} People</Text>
             <Text style={styles.metaDot}>•</Text>
             <Text style={[styles.metaText, { flexShrink: 1 }]} numberOfLines={2}>{room.location || 'General'}</Text>
          </View>
        </View>
      </View>

      {/* Fullscreen Photo Modal */}
      <Modal visible={!!enlargedPhoto} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setEnlargedPhoto(null)}
        >
          <Image
            source={{ uri: enlargedPhoto || '' }}
            style={{ width: Dimensions.get('window').width * 0.95, height: Dimensions.get('window').height * 0.7, borderRadius: 16 }}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20 }}
            onPress={() => setEnlargedPhoto(null)}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 28 }}>×</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Bookings Section */}
      <View style={styles.bookingSection}>
        <View style={styles.bookingHeader}>
            <Text style={styles.sectionTitle}>Select Time</Text>
            <TouchableOpacity onPress={() => setIsCustomTime(!isCustomTime)} style={styles.toggleBtn}>
                <ClockIcon color="#708F96" />
                <Text style={styles.toggleText}>{isCustomTime ? 'Quick Picks' : 'Custom Time'}</Text>
            </TouchableOpacity>
        </View>

        {isCustomTime ? (
            <View style={styles.customTimeBox}>
                <View style={[styles.customTimeRow, { zIndex: 10 }]}>
                    {/* Start Time */}
                    {/* Start Time */}
                    <View style={styles.dropdownContainer}>
                        <Text style={styles.timeLabel}>Start Time</Text>
                        <TouchableOpacity 
                            style={styles.dropdownBtn}
                            onPress={() => { setShowStartDropdown(true); setShowEndDropdown(false); }}
                        >
                            <Text style={styles.dropdownBtnText}>{formatTimeForDisplay(customStart)}</Text>
                            <ChevronDown color="rgba(255,255,255,0.5)" size={16} />
                        </TouchableOpacity>
                    </View>
                    
                    {/* End Time */}
                    <View style={styles.dropdownContainer}>
                        <Text style={styles.timeLabel}>End Time</Text>
                        <TouchableOpacity 
                            style={styles.dropdownBtn}
                            onPress={() => { setShowEndDropdown(true); setShowStartDropdown(false); }}
                        >
                            <Text style={styles.dropdownBtnText}>{formatTimeForDisplay(customEnd)}</Text>
                            <ChevronDown color="rgba(255,255,255,0.5)" size={16} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Dropdown Modal */}
                <Modal visible={showStartDropdown || showEndDropdown} transparent animationType="fade">
                  <TouchableOpacity 
                    style={styles.modalOverlay} 
                    activeOpacity={1} 
                    onPress={() => { setShowStartDropdown(false); setShowEndDropdown(false); }}
                  >
                    <View style={styles.modalDropdownContainer}>
                      <Text style={styles.modalTitle}>{showStartDropdown ? 'Select Start Time' : 'Select End Time'}</Text>
                      <ScrollView style={{ maxHeight: 300, width: '100%' }} showsVerticalScrollIndicator={true}>
                        {(showStartDropdown ? dynamicTimelineSlots.slice(0, -1) : dynamicTimelineSlots.filter(s => s > customStart)).map(slot => (
                           <TouchableOpacity
                             key={slot}
                             style={[styles.dropdownItem, slot === (showStartDropdown ? customStart : customEnd) && styles.dropdownItemSelected]}
                             onPress={() => {
                                if (showStartDropdown) {
                                   setCustomStart(slot);
                                   if (slot >= customEnd) setCustomEnd(addMinutes(slot, 60));
                                   setShowStartDropdown(false);
                                } else {
                                   setCustomEnd(slot);
                                   setShowEndDropdown(false);
                                }
                             }}
                           >
                             <Text style={[styles.dropdownItemText, slot === (showStartDropdown ? customStart : customEnd) && styles.dropdownItemTextSelected]}>
                               {formatTimeForDisplay(slot)}
                             </Text>
                           </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <TouchableOpacity style={styles.modalCloseBtn} onPress={() => { setShowStartDropdown(false); setShowEndDropdown(false); }}>
                          <Text style={styles.modalCloseBtnText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </Modal>

                <Text style={styles.inputLabel}>Comment (optional)</Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="e.g. Project review with design team"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={customComment}
                  onChangeText={setCustomComment}
                  multiline
                  numberOfLines={2}
                  maxLength={200}
                />

                {!!customError && <Text style={styles.errorText}>{customError}</Text>}
                <TouchableOpacity onPress={handleCustomBook} style={styles.customBookBtn}>
                    <Text style={styles.customBookBtnText}>Book Custom Time</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotsScroll}>
                {apiSlots.length === 0 ? (
                    <Text style={styles.noSlotsText}>No predefined slots. Use Custom Time.</Text>
                ) : apiSlots.map((slot, i) => {
                    const avail = getSlotAvailability(slot.start_time, slot.end_time);
                    const isBooked = avail.type === 'BOOKED';
                    const isPartial = avail.type === 'PARTIAL';
                    const timeDisplay = formatTimeForDisplay(slot.start_time);
                    const [time, ampm] = timeDisplay.split(' ');

                    return (
                        <TouchableOpacity
                            key={i}
                            disabled={isBooked}
                            onPress={() => {
                                if (!isBooked && avail.availableTime) {
                                    if (isPartial) {
                                        setPartialConfirm({ ...avail.availableTime, comment: '' });
                                    } else {
                                        setPendingBooking({ ...avail.availableTime, comment: '' });
                                    }
                                }
                            }}
                            style={[
                                styles.slotBtn,
                                { overflow: 'hidden' }, // Ensure absolute children are clipped
                                isBooked && styles.slotBtnBooked,
                                (!isBooked && !isPartial) && styles.slotBtnAvailable,
                                isPartial && { borderColor: 'rgba(212,160,23,0.3)' }
                            ]}
                        >
                            {isPartial && (
                                <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
                                    <View style={{ 
                                        flex: 1, 
                                        backgroundColor: avail.position === 'left' ? 'transparent' : 'rgba(212,160,23,0.1)',
                                        borderRightWidth: avail.position === 'left' ? 0 : 1,
                                        borderColor: 'rgba(212,160,23,0.3)',
                                        overflow: 'hidden'
                                    }}>
                                        {avail.position === 'left' && <StripedBackground />}
                                    </View>
                                    <View style={{ 
                                        flex: 1, 
                                        backgroundColor: avail.position === 'right' ? 'transparent' : 'rgba(212,160,23,0.1)',
                                        overflow: 'hidden'
                                    }}>
                                        {avail.position === 'right' && <StripedBackground />}
                                    </View>
                                </View>
                            )}
                            <View style={{ zIndex: 1, alignItems: 'center' }}>
                                <Text style={[
                                    styles.slotTime,
                                    isBooked ? styles.slotTimeBooked : styles.slotTimeAvailable
                                ]}>{time}</Text>
                                <Text style={[
                                    styles.slotAmPm,
                                    isBooked ? styles.slotTimeBooked : (isPartial ? styles.slotAmPmPartial : styles.slotAmPmAvailable)
                                ]}>{ampm}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        )}
      </View>

      {/* Confirmation Modal */}
      <Modal visible={!!pendingBooking || !!partialConfirm} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Confirm Booking</Text>
                  {partialConfirm ? (
                      <>
                        <Text style={styles.modalDesc}>Only part of this slot is available.</Text>
                        <Text style={styles.modalTime}>{formatTimeForDisplay(partialConfirm.start)} - {formatTimeForDisplay(partialConfirm.end)}</Text>
                      </>
                  ) : pendingBooking ? (
                      <>
                        <Text style={styles.modalDesc}>{room.name} on {selectedDate}</Text>
                        <Text style={styles.modalTime}>{formatTimeForDisplay(pendingBooking.start)} - {formatTimeForDisplay(pendingBooking.end)}</Text>
                        {pendingBooking.comment ? (
                          <Text style={styles.modalComment} numberOfLines={2}>Comment: {pendingBooking.comment}</Text>
                        ) : null}
                      </>
                  ) : null}

                  <View style={styles.modalActions}>
                      <TouchableOpacity 
                          style={styles.modalCancel} 
                          onPress={() => { setPendingBooking(null); setPartialConfirm(null); }}
                          disabled={isBooking}
                      >
                          <Text style={styles.modalCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                          style={styles.modalConfirm} 
                          onPress={() => {
                              const b = pendingBooking || partialConfirm;
                              if (b) confirmBooking(b.start, b.end, b.comment);
                          }}
                          disabled={isBooking}
                      >
                          {isBooking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Confirm</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoWrap: {
    marginRight: 14,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  photoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 3,
  },
  photoPlaceholder: {
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoCol: {
    flex: 1,
  },
  roomName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  metaDot: {
    color: 'rgba(255,255,255,0.3)',
    marginHorizontal: 6,
    fontSize: 12,
    marginTop: -2,
  },
  bookingSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggleText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#708F96',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customTimeBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 12,
  },
  customTimeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  timeInputCol: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  timeInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 12,
  },
  commentInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 56,
  },
  customBookBtn: {
    backgroundColor: '#708F96',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  customBookBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customTimeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  dropdownContainer: {
    flex: 1,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dropdownBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalDropdownContainer: {
    backgroundColor: '#1E2330',
    borderRadius: 16,
    width: '80%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    maxHeight: '80%',
  },
  modalCloseBtn: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  modalCloseBtnText: {
    color: '#708F96',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(112,143,150,0.15)',
  },
  dropdownItemText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  dropdownItemTextSelected: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  timeLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  slotsScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  noSlotsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  slotBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  slotBtnAvailable: {
    borderColor: 'rgba(112,143,150,0.3)',
    backgroundColor: 'rgba(112,143,150,0.1)',
  },
  slotBtnBooked: {
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  slotBtnPartial: {
    borderColor: 'rgba(212,160,23,0.3)',
    backgroundColor: 'rgba(212,160,23,0.1)',
  },
  slotTime: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  slotAmPm: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  slotTimeAvailable: {
    color: '#fff',
  },
  slotTimeBooked: {
    color: 'rgba(255,255,255,0.3)',
  },
  slotAmPmAvailable: {
    color: '#708F96',
  },
  slotAmPmPartial: {
    color: '#D4A017',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E2330',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalTime: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#708F96',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalComment: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  modalCancelText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 'bold',
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#708F96',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
