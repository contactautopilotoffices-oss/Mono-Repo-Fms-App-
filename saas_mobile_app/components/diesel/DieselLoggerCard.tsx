import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Trash2, AlertTriangle, Save, Pencil, Clock, ChevronDown } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { Generator, DieselReading, DGTariff } from '@/services/dieselService';
import { CustomDatePicker } from '@/components/shared/CustomDatePicker';

interface DieselLoggerCardProps {
  generator: Generator;
  readings: DieselReading[];
  tariffs: DGTariff[];
  onSaveReading: (payload: any) => Promise<void>;
  onDelete?: (generatorId: string) => void;
  onEdit?: (generator: Generator) => void;
  colors: typeof Colors.light;
  isDark?: boolean;
}

export function DieselLoggerCard({
  generator,
  readings,
  tariffs,
  onSaveReading,
  onDelete,
  onEdit,
  colors,
  isDark
}: DieselLoggerCardProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [readingDateStr, setReadingDateStr] = useState(todayStr);
  const [showDatePickerDropdown, setShowDatePickerDropdown] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inputs
  const [closingHours, setClosingHours] = useState('');
  const [closingKwh, setClosingKwh] = useState('');
  const [closingDiesel, setClosingDiesel] = useState('');
  const [dieselAdded, setDieselAdded] = useState('');

  const activeTariff = useMemo(() => {
    const sorted = [...tariffs].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    return sorted[0] || null;
  }, [tariffs]);

  const { openingHours, openingKwh, openingDiesel } = useMemo(() => {
    const genReadings = readings
      .filter((r) => r.generator_id === generator.id)
      .sort((a, b) => {
        const dateA = a.reading_date || "";
        const dateB = b.reading_date || "";
        if (dateA !== dateB) return dateA < dateB ? 1 : -1;
        return (a.created_at || "") < (b.created_at || "") ? 1 : -1;
      });

    const before = genReadings.find((r) => (r.reading_date || "") < readingDateStr);
    const current = genReadings.find((r) => (r.reading_date || "") === readingDateStr);

    let oHours = 0, oKwh = 0, oDiesel = 0;
    
    if (before) {
      oHours = before.closing_hours;
      oKwh = before.closing_kwh || 0;
      oDiesel = before.closing_diesel_level;
    } else if (current) {
      oHours = current.opening_hours;
      oKwh = current.opening_kwh || 0;
      oDiesel = current.opening_diesel_level;
    } else if (genReadings.length === 0) {
      oHours = generator.initial_run_hours ?? 0;
      oKwh = generator.initial_kwh_reading ?? 0;
      oDiesel = generator.initial_diesel_level ?? 0;
    }
    
    return { openingHours: oHours, openingKwh: oKwh, openingDiesel: oDiesel };
  }, [generator.id, readings, readingDateStr, generator.initial_run_hours, generator.initial_kwh_reading, generator.initial_diesel_level]);

  // Pre-fill if current reading exists
  useEffect(() => {
    const existing = readings.find(r => r.generator_id === generator.id && (r.reading_date || "") === readingDateStr);
    if (existing) {
      setClosingHours(String(existing.closing_hours));
      setClosingKwh(existing.closing_kwh != null ? String(existing.closing_kwh) : '');
      setClosingDiesel(String(existing.closing_diesel_level));
      setDieselAdded(existing.diesel_added_litres ? String(existing.diesel_added_litres) : '0');
    } else {
      setClosingHours('');
      setClosingKwh('');
      setClosingDiesel('');
      setDieselAdded('0');
    }
  }, [readingDateStr, generator.id]); // intentionally omit `readings`

  const nClosingHours = closingHours === '' ? NaN : parseFloat(closingHours);
  const nClosingKwh = closingKwh === '' ? NaN : parseFloat(closingKwh);
  const nClosingDiesel = closingDiesel === '' ? NaN : parseFloat(closingDiesel);
  const nAdded = dieselAdded === '' ? 0 : parseFloat(dieselAdded);

  const hasValidReading = 
    !isNaN(nClosingHours) && nClosingHours >= openingHours &&
    !isNaN(nClosingKwh) && nClosingKwh >= openingKwh &&
    !isNaN(nClosingDiesel);

  const handleSaveEntry = async () => {
    if (!hasValidReading) return;
    setIsSubmitting(true);
    try {
      await onSaveReading({
        generator_id: generator.id,
        property_id: generator.property_id,
        reading_date: readingDateStr,
        opening_hours: openingHours,
        closing_hours: nClosingHours,
        opening_kwh: openingKwh,
        closing_kwh: nClosingKwh,
        opening_diesel_level: openingDiesel,
        closing_diesel_level: nClosingDiesel,
        diesel_added_litres: nAdded,
      });
      setClosingHours('');
      setClosingKwh('');
      setClosingDiesel('');
      setDieselAdded('0');
      
      const nextDate = new Date(readingDateStr + "T00:00:00");
      nextDate.setDate(nextDate.getDate() + 1);
      setReadingDateStr(nextDate.toISOString().split("T")[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dateOptions = [
    { label: "Today", value: todayStr },
    {
      label: "Yesterday",
      value: new Date(Date.now() - 86400000).toISOString().split("T")[0],
    },
    {
      label: "2 days ago",
      value: new Date(Date.now() - 172800000).toISOString().split("T")[0],
    },
    { label: "Custom Date...", value: "__custom__" },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.statusStrip, { backgroundColor: hasValidReading ? colors.primary : colors.border }]} />

        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.generatorName, { color: colors.text }]} numberOfLines={1}>{generator.name}</Text>
              <Text style={[styles.generatorMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                {generator.make || 'DG'} · {generator.capacity_kva || '?'} KVA
              </Text>
            </View>
            <View style={styles.actionButtons}>
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(generator)} style={[styles.iconBtn, { backgroundColor: isDark ? '#21262d' : '#f0f9ff' }]}>
                  <Pencil size={16} color={isDark ? '#cbd5e1' : '#2563eb'} />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={() => onDelete(generator.id)} style={[styles.iconBtn, { backgroundColor: isDark ? '#21262d' : '#fef2f2' }]}>
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Tariff Warning */}
          {!activeTariff && (
            <View style={[styles.warningBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.2)' : '#fde68a' }]}>
              <AlertTriangle size={16} color="#d97706" />
              <Text style={[styles.warningText, { color: '#d97706' }]}>NO ACTIVE TARIFF FOUND FOR THIS DG</Text>
            </View>
          )}

          {/* Reading Date */}
          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Reading Date</Text>
            <TouchableOpacity
              style={[styles.picker, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => setShowDatePickerDropdown(!showDatePickerDropdown)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Clock size={16} color={colors.textSecondary} />
                <Text style={[styles.pickerText, { color: colors.text }]}>
                  {readingDateStr === todayStr
                    ? "Today"
                    : readingDateStr ===
                        new Date(Date.now() - 86400000)
                          .toISOString()
                          .split("T")[0]
                      ? "Yesterday"
                      : readingDateStr ===
                          new Date(Date.now() - 172800000)
                            .toISOString()
                            .split("T")[0]
                        ? "2 days ago"
                        : new Date(readingDateStr + "T00:00:00").toLocaleDateString(
                            "en-GB",
                            { day: "2-digit", month: "short", year: "numeric" }
                          )}
                </Text>
              </View>
              <ChevronDown size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            {showDatePickerDropdown && (
              <View style={[styles.pickerDropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {dateOptions.map((opt) =>
                  opt.value === "__custom__" ? (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.pickerOption, { borderTopWidth: 1, borderTopColor: colors.border }]}
                      onPress={() => {
                        setShowDatePickerDropdown(false);
                        setShowCustomDatePicker(true);
                      }}
                    >
                      <Text style={[styles.pickerOptionText, { color: colors.text }]}>Custom Date...</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.pickerOption,
                        opt.value === readingDateStr && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                      ]}
                      onPress={() => {
                        setReadingDateStr(opt.value);
                        setShowDatePickerDropdown(false);
                      }}
                    >
                      <Text style={[styles.pickerOptionText, { color: colors.text }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            )}
          </View>
          <CustomDatePicker
            visible={showCustomDatePicker}
            selectedDate={readingDateStr}
            onSelect={(date) => {
              setReadingDateStr(date);
              setShowCustomDatePicker(false);
            }}
            onClose={() => setShowCustomDatePicker(false)}
            colors={colors}
          />

          {/* Run Hours */}
          <View style={styles.sectionDivider} />
          <View style={styles.fieldRow}>
             <Text style={[styles.fieldLabel, { color: colors.textSecondary, flex: 1 }]}>RUN HOURS</Text>
             <View style={styles.openingBadge}>
               <Text style={styles.openingBadgeText}>Opening: {openingHours.toFixed(1)}</Text>
             </View>
          </View>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            placeholder="Current Run Hours"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            value={closingHours}
            onChangeText={setClosingHours}
          />

          {/* Energy kWh */}
          <View style={styles.sectionDivider} />
          <View style={styles.fieldRow}>
             <Text style={[styles.fieldLabel, { color: colors.textSecondary, flex: 1 }]}>ENERGY (KWH)</Text>
             <View style={styles.openingBadge}>
               <Text style={styles.openingBadgeText}>Opening: {openingKwh.toFixed(1)}</Text>
             </View>
          </View>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            placeholder="Current Energy (kWh)"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            value={closingKwh}
            onChangeText={setClosingKwh}
          />

          {/* Diesel Level & Added */}
          <View style={styles.sectionDivider} />
          <View style={styles.splitRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CLOSING LEVEL</Text>
                <View style={styles.openingBadge}>
                  <Text style={styles.openingBadgeText}>Op: {openingDiesel.toFixed(1)} L</Text>
                </View>
              </View>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={[styles.textInputSplit, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  placeholder="Level"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={closingDiesel}
                  onChangeText={setClosingDiesel}
                />
                <Text style={[styles.unitLabel, { color: colors.textSecondary }]}>L</Text>
              </View>
            </View>

            <View style={{ flex: 1, marginLeft: 8 }}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ADDED TODAY</Text>
              </View>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={[styles.textInputSplit, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={dieselAdded}
                  onChangeText={setDieselAdded}
                />
                <Text style={[styles.unitLabel, { color: colors.textSecondary }]}>L</Text>
              </View>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: hasValidReading ? colors.primary : colors.border }
            ]}
            disabled={!hasValidReading || isSubmitting}
            onPress={handleSaveEntry}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Save size={18} color={hasValidReading ? '#fff' : colors.textTertiary} style={{ marginRight: 8 }} />
                <Text style={[styles.submitBtnText, { color: hasValidReading ? '#fff' : colors.textTertiary }]}>
                  COMMIT DAILY LOG
                </Text>
              </>
            )}
          </TouchableOpacity>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  statusStrip: {
    width: 6,
    height: '100%',
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitleContainer: {
    flex: 1,
  },
  generatorName: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  generatorMeta: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  fieldSection: {
    marginBottom: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  openingBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
  },
  openingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickerText: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  pickerOption: {
    padding: 12,
    paddingHorizontal: 16,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontWeight: '600',
  },
  splitRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  inputWithUnit: {
    position: 'relative',
    justifyContent: 'center',
  },
  textInputSplit: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    paddingRight: 30,
    fontSize: 16,
    fontWeight: '600',
  },
  unitLabel: {
    position: 'absolute',
    right: 14,
    fontSize: 14,
    fontWeight: '700',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
