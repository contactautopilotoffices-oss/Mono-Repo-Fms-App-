import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

interface ScrollableTimePickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  minHour?: number;
  maxHour?: number;
  minuteStep?: number;
}

export function ScrollableTimePicker({
  value,
  onChange,
  minHour = 8,
  maxHour = 21,
  minuteStep = 15,
}: ScrollableTimePickerProps) {
  const [selectedHour, selectedMinute] = useMemo(() => {
    const [h, m] = value.split(':').map((v) => parseInt(v, 10));
    const hour = Number.isNaN(h) ? minHour : Math.max(minHour, Math.min(maxHour, h));
    let minute = Number.isNaN(m) ? 0 : m;
    const steps = Math.round(minute / minuteStep) * minuteStep;
    minute = Math.max(0, Math.min(59, steps));
    return [hour, minute];
  }, [value, minHour, maxHour, minuteStep]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = minHour; h <= maxHour; h++) list.push(h);
    return list;
  }, [minHour, maxHour]);

  const minutes = useMemo(() => {
    const list: number[] = [];
    for (let m = 0; m < 60; m += minuteStep) list.push(m);
    return list;
  }, [minuteStep]);

  const handleHourChange = (hour: number) => {
    onChange(`${String(hour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`);
  };

  const handleMinuteChange = (minute: number) => {
    onChange(`${String(selectedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };

  const renderItem = (
    label: string,
    isSelected: boolean,
    onPress: () => void,
    disabled = false
  ) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={disabled ? 1 : 0.7}
      style={[styles.item, isSelected && styles.itemSelected, disabled && styles.itemDisabled]}
    >
      <Text style={[styles.itemText, isSelected && styles.itemTextSelected, disabled && styles.itemTextDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.column}>
        <Text style={styles.columnLabel}>Hour</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {hours.map((h) => renderItem(String(h).padStart(2, '0'), h === selectedHour, () => handleHourChange(h)))}
        </ScrollView>
      </View>

      <Text style={styles.separator}>:</Text>

      <View style={styles.column}>
        <Text style={styles.columnLabel}>Min</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {minutes.map((m) => renderItem(String(m).padStart(2, '0'), m === selectedMinute, () => handleMinuteChange(m)))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  columnLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  separator: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    alignSelf: 'center',
    marginTop: 18,
  },
  scroll: {
    maxHeight: 160,
    width: '100%',
  },
  scrollContent: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  item: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginVertical: 2,
    borderRadius: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  itemSelected: {
    backgroundColor: '#708F96',
  },
  itemDisabled: {
    opacity: 0.3,
  },
  itemText: {
    fontSize: 15,
    color: '#fff',
  },
  itemTextSelected: {
    fontWeight: 'bold',
    color: '#fff',
  },
  itemTextDisabled: {
    color: 'rgba(255,255,255,0.4)',
  },
});
