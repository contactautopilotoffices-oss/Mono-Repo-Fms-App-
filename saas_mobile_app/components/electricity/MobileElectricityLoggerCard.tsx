import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, interpolate, interpolateColor } from 'react-native-reanimated';
import { Settings2, RotateCcw, Save, Trash2, Pencil } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { ElectricityMeter, MeterMultiplier, ElectricityReading } from '@/services/electricityService';
import { CustomDatePicker } from '@/components/shared/CustomDatePicker';

interface MobileElectricityLoggerCardProps {
  meter: ElectricityMeter;
  readings: ElectricityReading[];
  multipliers: MeterMultiplier[];
  onSaveReading: (payload: any) => Promise<void>;
  onMultiplierSave?: (meterId: string, payload: any) => Promise<void>;
  onDelete?: (meterId: string) => void;
  onEdit?: (meter: ElectricityMeter) => void;
  colors: typeof Colors.light;
  isDark?: boolean;
}

export function MobileElectricityLoggerCard({
  meter,
  readings,
  multipliers,
  onSaveReading,
  onMultiplierSave,
  onDelete,
  onEdit,
  colors,
  isDark
}: MobileElectricityLoggerCardProps) {
  const [closingReading, setClosingReading] = useState('');
  const [readingDate, setReadingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multiplier State
  const [isSavingMultiplier, setIsSavingMultiplier] = useState(false);
  const [editCtPrimary, setEditCtPrimary] = useState('');
  const [editCtSecondary, setEditCtSecondary] = useState('');
  const [editPtPrimary, setEditPtPrimary] = useState('');
  const [editPtSecondary, setEditPtSecondary] = useState('');
  const [editMeterConstant, setEditMeterConstant] = useState('');

  const flipValue = useSharedValue(0);

  const toggleFlip = () => {
    flipValue.value = withTiming(flipValue.value === 0 ? 1 : 0, { duration: 400 });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipValue.value, [0, 1], [0, 180]);
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotateY}deg` }
      ],
      opacity: flipValue.value >= 0.5 ? 0 : 1,
      zIndex: flipValue.value >= 0.5 ? 0 : 1,
      position: flipValue.value >= 0.5 ? 'absolute' : 'relative',
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipValue.value, [0, 1], [-180, 0]);
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotateY}deg` }
      ],
      opacity: flipValue.value >= 0.5 ? 1 : 0,
      zIndex: flipValue.value >= 0.5 ? 1 : 0,
      position: flipValue.value < 0.5 ? 'absolute' : 'relative',
    };
  });

  const activeMultiplier = multipliers.length > 0 ? multipliers[0] : null;

  useEffect(() => {
    if (activeMultiplier) {
      setEditCtPrimary(activeMultiplier.ct_ratio_primary != null ? String(activeMultiplier.ct_ratio_primary) : '');
      setEditCtSecondary(activeMultiplier.ct_ratio_secondary != null ? String(activeMultiplier.ct_ratio_secondary) : '');
      setEditPtPrimary(activeMultiplier.pt_ratio_primary != null ? String(activeMultiplier.pt_ratio_primary) : '');
      setEditPtSecondary(activeMultiplier.pt_ratio_secondary != null ? String(activeMultiplier.pt_ratio_secondary) : '');
      setEditMeterConstant(activeMultiplier.meter_constant != null ? String(activeMultiplier.meter_constant) : '');
    }
  }, [activeMultiplier]);

  const getLocalDateStr = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const { opening } = useMemo(() => {
    const meterReadings = readings
      .filter((r) => r.meter_id === meter.id)
      .sort((a, b) => {
        const dateA = a.reading_date || "";
        const dateB = b.reading_date || "";
        if (dateA !== dateB) return dateA < dateB ? 1 : -1;
        return (a.created_at || "") < (b.created_at || "") ? 1 : -1;
      });

    const readingDateStr = getLocalDateStr(readingDate);
    const before = meterReadings.find((r) => (r.reading_date || "") < readingDateStr);
    const current = meterReadings.find((r) => (r.reading_date || "") === readingDateStr);

    let openVal = 0;
    if (before) {
      openVal = before.closing_reading;
    } else if (current && current.opening_reading != null) {
      // Editing an existing reading that has no prior reading
      openVal = current.opening_reading;
    } else if (meterReadings.length === 0) {
      // Absolutely no readings exist, safe to use last_reading (which acts as initial reading)
      openVal = meter.last_reading ?? 0;
    } else {
      // Backdating before any existing readings
      openVal = 0;
    }
    
    return { opening: openVal };
  }, [meter.id, meter.last_reading, readings, readingDate]);

  // Pre-fill closing reading if selecting a date that already has a reading
  useEffect(() => {
    const readingDateStr = getLocalDateStr(readingDate);
    const existing = readings.find(r => r.meter_id === meter.id && (r.reading_date || "") === readingDateStr);
    if (existing) {
      setClosingReading(String(existing.closing_reading));
    } else {
      setClosingReading('');
    }
  }, [readingDate, meter.id]); // intentionally omitting `readings` to avoid overwriting active typing during background refetches

  const numericClosing = closingReading === '' ? 0 : parseFloat(closingReading);
  const hasValidReading = !isNaN(numericClosing) && closingReading !== '' && numericClosing > opening;

  const handleSaveEntry = async () => {
    if (!hasValidReading) return;
    setIsSubmitting(true);
    try {
      await onSaveReading({
        meter_id: meter.id,
        reading_date: getLocalDateStr(readingDate),
        opening_reading: opening,
        closing_reading: numericClosing,
      });
      setClosingReading('');
      
      // Auto-advance date by 1 day for consecutive logging
      const nextDate = new Date(readingDate);
      nextDate.setDate(nextDate.getDate() + 1);
      setReadingDate(nextDate);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveMultiplier = async () => {
    if (!onMultiplierSave) return;
    setIsSavingMultiplier(true);
    try {
      const cP = editCtPrimary ? parseFloat(editCtPrimary) : null;
      const cS = editCtSecondary ? parseFloat(editCtSecondary) : null;
      const pP = editPtPrimary ? parseFloat(editPtPrimary) : null;
      const pS = editPtSecondary ? parseFloat(editPtSecondary) : null;
      const mC = editMeterConstant ? parseFloat(editMeterConstant) : null;

      await onMultiplierSave(meter.id, {
        meter_id: meter.id,
        ct_ratio_primary: cP,
        ct_ratio_secondary: cS,
        pt_ratio_primary: pP,
        pt_ratio_secondary: pS,
        meter_constant: mC,
        effective_from: readingDate.toISOString().split('T')[0],
        updateExistingId: activeMultiplier?.id,
        retroactivelyUpdate: true,
      });
      toggleFlip();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingMultiplier(false);
    }
  };

  const currentMultVal = activeMultiplier?.multiplier_value ?? 1;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, frontAnimatedStyle]}>
        {/* Left Side Status Strip */}
        <View style={[styles.statusStrip, { backgroundColor: hasValidReading ? colors.primary : colors.border }]} />

        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.meterName, { color: colors.text }]} numberOfLines={1}>{meter.name}</Text>
              <Text style={[styles.meterMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                {meter.meter_type === 'main' ? 'Main Grid' : meter.meter_type || 'Meter'} · {meter.meter_number || 'No #'}
              </Text>
            </View>
            <View style={styles.actionButtons}>
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(meter)} style={[styles.iconBtn, { backgroundColor: isDark ? '#21262d' : '#f0f9ff' }]}>
                  <Pencil size={16} color={isDark ? '#cbd5e1' : '#2563eb'} />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={() => onDelete(meter.id)} style={[styles.iconBtn, { backgroundColor: isDark ? '#21262d' : '#fef2f2' }]}>
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={toggleFlip} style={[styles.iconBtn, { backgroundColor: isDark ? '#21262d' : '#f1f5f9' }]}>
                <Settings2 size={16} color={isDark ? '#cbd5e1' : '#64748b'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Reading Date */}
          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Reading Date</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.dateInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.dateText, { color: colors.text }]}>
                {readingDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
          </View>
          <CustomDatePicker
            visible={showDatePicker}
            selectedDate={readingDate.toISOString().split('T')[0]}
            onSelect={(date) => {
              setReadingDate(new Date(date + "T00:00:00"));
              setShowDatePicker(false);
            }}
            onClose={() => setShowDatePicker(false)}
            colors={colors}
          />

          {/* Opening Reading */}
          <View style={[styles.openingBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Opening Reading (Auto)</Text>
            <Text style={[styles.openingVal, { color: colors.textSecondary }]}>
              {opening.toFixed(2)} <Text style={styles.unitText}>kWh</Text>
            </Text>
          </View>

          {/* Closing Reading */}
          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Closing Reading</Text>
            <View style={styles.closingInputContainer}>
              <TextInput
                value={closingReading}
                onChangeText={setClosingReading}
                keyboardType="decimal-pad"
                placeholder="Reading"
                placeholderTextColor={colors.textTertiary}
                style={[styles.closingInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              />
              <View style={styles.closingRight}>
                <Text style={[styles.unitText, { color: colors.textSecondary }]}>kWh</Text>
              </View>
            </View>
          </View>

          {/* Multiplied Preview */}
          {hasValidReading && (
            <View style={[styles.previewBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <View style={styles.previewHeaderRow}>
                <Text style={styles.previewTitle}>Multiplied Consumption</Text>
                <Text style={[styles.previewMult, { color: colors.textSecondary }]}>×{currentMultVal.toFixed(2)}</Text>
              </View>
              <Text style={[styles.previewVal, { color: colors.primary }]}>
                {((numericClosing - opening) * currentMultVal).toFixed(1)} <Text style={styles.previewValUnit}>kWh</Text>
              </Text>
              <Text style={[styles.previewRaw, { color: colors.textTertiary }]}>Raw: {(numericClosing - opening).toFixed(1)} kWh</Text>
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: hasValidReading ? colors.primary : colors.background }]}
            disabled={!hasValidReading || isSubmitting}
            onPress={handleSaveEntry}
          >
            {isSubmitting ? (
              <ActivityIndicator color={hasValidReading ? '#fff' : colors.textSecondary} />
            ) : (
              <>
                <Save size={18} color={hasValidReading ? '#fff' : colors.textSecondary} />
                <Text style={[styles.saveButtonText, { color: hasValidReading ? '#fff' : colors.textSecondary }]}>Save Entry</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Back side: Meter Constant Configuration */}
      <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, backAnimatedStyle]}>
        <View style={styles.cardContent}>
          <View style={styles.backHeader}>
            <View>
              <Text style={[styles.meterName, { color: colors.text }]}>Meter Constant</Text>
              <Text style={[styles.meterMeta, { color: colors.textTertiary }]}>Configuration</Text>
            </View>
            <TouchableOpacity onPress={toggleFlip} style={[styles.iconBtn, { backgroundColor: colors.background }]}>
              <RotateCcw size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.configGrid}>
            <View style={styles.configCol}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CT Primary (A)</Text>
              <TextInput value={editCtPrimary} onChangeText={setEditCtPrimary} keyboardType="decimal-pad" style={[styles.configInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
            </View>
            <View style={styles.configCol}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CT Secondary (A)</Text>
              <TextInput value={editCtSecondary} onChangeText={setEditCtSecondary} keyboardType="decimal-pad" style={[styles.configInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
            </View>
          </View>
          <View style={styles.configGrid}>
            <View style={styles.configCol}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>PT Primary (V)</Text>
              <TextInput value={editPtPrimary} onChangeText={setEditPtPrimary} keyboardType="decimal-pad" style={[styles.configInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
            </View>
            <View style={styles.configCol}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>PT Secondary (V)</Text>
              <TextInput value={editPtSecondary} onChangeText={setEditPtSecondary} keyboardType="decimal-pad" style={[styles.configInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
            </View>
          </View>

          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Meter Constant</Text>
            <TextInput value={editMeterConstant} onChangeText={setEditMeterConstant} keyboardType="decimal-pad" style={[styles.configInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
          </View>

          <View style={styles.totalFactorBox}>
            <Text style={[styles.fieldLabel, { color: colors.primary, textAlign: 'center' }]}>TOTAL FACTOR</Text>
            <Text style={[styles.totalFactorVal, { color: colors.primary }]}>
              ×{((parseFloat(editCtPrimary) || 0) / (parseFloat(editCtSecondary) || 1) * (parseFloat(editPtPrimary) || 0) / (parseFloat(editPtSecondary) || 1) * (parseFloat(editMeterConstant) || 0)).toFixed(2)}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary, marginTop: 'auto' }]}
            disabled={isSavingMultiplier}
            onPress={handleSaveMultiplier}
          >
            {isSavingMultiplier ? <ActivityIndicator color="#fff" /> : <Text style={[styles.saveButtonText, { color: '#fff' }]}>Save Settings</Text>}
          </TouchableOpacity>
        </View>
      </Animated.View>
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
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  statusStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    zIndex: 10,
  },
  cardContent: {
    padding: 20,
    paddingLeft: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitleContainer: {
    flex: 1,
    paddingRight: 8,
  },
  meterName: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    lineHeight: 22,
  },
  meterMeta: {
    fontSize: 13,
    fontFamily: 'Urbanist-SemiBold',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 10,
  },
  fieldSection: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Urbanist-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  dateInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  dateText: {
    fontSize: 15,
    fontFamily: 'Urbanist-Bold',
  },
  openingBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  openingVal: {
    fontSize: 18,
    fontFamily: 'Roboto-Bold',
  },
  unitText: {
    fontSize: 11,
    fontFamily: 'Urbanist-Bold',
    textTransform: 'uppercase',
  },
  closingInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closingInput: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontFamily: 'Roboto-Bold',
  },
  closingRight: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 11,
    fontFamily: 'Urbanist-Bold',
    textTransform: 'uppercase',
    color: '#3b82f6', // primary typically
  },
  previewMult: {
    fontSize: 11,
    fontFamily: 'Roboto-Medium',
  },
  previewVal: {
    fontSize: 24,
    fontFamily: 'Poppins-Black',
  },
  previewValUnit: {
    fontSize: 12,
    fontFamily: 'Urbanist-Bold',
    opacity: 0.6,
  },
  previewRaw: {
    fontSize: 11,
    fontFamily: 'Urbanist-Medium',
    marginTop: 2,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
  },
  backHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  configGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  configCol: {
    flex: 1,
  },
  configInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    fontFamily: 'Roboto-Medium',
  },
  totalFactorBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  totalFactorVal: {
    fontSize: 20,
    fontFamily: 'Poppins-Black',
    marginTop: 4,
  }
});
