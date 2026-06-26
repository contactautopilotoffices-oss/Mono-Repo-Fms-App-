import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

export function CustomDatePicker({
  visible,
  selectedDate,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  selectedDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const [viewYear, setViewYear] = useState(() =>
    new Date(selectedDate + "T00:00:00").getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(() =>
    new Date(selectedDate + "T00:00:00").getMonth(),
  );

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const today = new Date().toISOString().split("T")[0];

  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfWeek = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  if (!visible) return null;

  return (
    <View
      style={[
        styles.customDatePickerContainer,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {/* Header */}
      <View style={styles.customDateHeader}>
        <TouchableOpacity onPress={prevMonth} style={styles.customDateNavBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.customDateTitle, { color: colors.text }]}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.customDateNavBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      {/* Day headers */}
      <View style={styles.customDateGrid}>
        {DAYS.map((d) => (
          <View key={d} style={styles.customDateCell}>
            <Text
              style={[
                styles.customDateDayLabel,
                { color: colors.textTertiary },
              ]}
            >
              {d}
            </Text>
          </View>
        ))}
        {cells.map((date, idx) => {
          const isSelected = date === selectedDate;
          const isToday = date === today;
          return (
            <View key={idx} style={styles.customDateCell}>
              {date ? (
                <TouchableOpacity
                  style={[
                    styles.customDateDayBtn,
                    isSelected && { backgroundColor: colors.primary },
                    isToday &&
                      !isSelected && {
                        borderWidth: 1,
                        borderColor: colors.primary,
                      },
                  ]}
                  onPress={() => {
                    onSelect(date);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      styles.customDateDayText,
                      { color: isSelected ? "#FFF" : colors.text },
                    ]}
                  >
                    {parseInt(date.split("-")[2])}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
      {/* Cancel */}
      <TouchableOpacity
        style={{ alignItems: "center", paddingVertical: 10 }}
        onPress={onClose}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: "Urbanist-Medium",
            fontSize: 13,
          }}
        >
          Cancel
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  customDatePickerContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  customDateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  customDateNavBtn: {
    padding: 6,
  },
  customDateTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
  },
  customDateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  customDateCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  customDateDayLabel: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
  },
  customDateDayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  customDateDayText: {
    fontSize: 14,
    fontFamily: "Urbanist-Bold",
  },
});
