import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Trash2, AlertTriangle, Save, Pencil, Clock, ChevronDown, Droplets } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { WaterSource, WaterReading, WaterTariff } from '@/services/waterService';
import { CustomDatePicker } from '@/components/shared/CustomDatePicker';

interface WaterLoggerCardProps {
  source: WaterSource;
  readings: WaterReading[];
  tariffs: WaterTariff[];
  onSaveReading: (payload: { source_id: string; reading_date: string; quantity: number }) => Promise<void>;
  onDelete?: (sourceId: string) => void;
  onEdit?: (source: WaterSource) => void;
  colors: typeof Colors.light;
  isDark?: boolean;
}

export function WaterLoggerCard({
  source,
  readings,
  tariffs,
  onSaveReading,
  onDelete,
  onEdit,
  colors,
  isDark
}: WaterLoggerCardProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [readingDateStr, setReadingDateStr] = useState(todayStr);
  const [showDatePickerDropdown, setShowDatePickerDropdown] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantity, setQuantity] = useState('');

  const sourceTariffs = useMemo(() => tariffs.filter(t => t.source_id === source.id), [tariffs, source.id]);

  const activeTariff = useMemo(() => {
    const sorted = [...sourceTariffs].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    return sorted[0] || null;
  }, [sourceTariffs]);

  const unitLabel = source.source_type === 'jar' ? 'Jars' : 'Loads';
  const typeLabel = source.source_type === 'jar' ? 'Drinking Water' : 'Tanker Water';

  const mtdReadings = useMemo(() =>
    readings.filter(r => r.source_id === source.id),
    [readings, source.id]
  );

  const mtdUnits = useMemo(() =>
    mtdReadings.reduce((sum, r) => sum + (r.quantity || 0), 0),
    [mtdReadings]
  );

  const mtdCost = useMemo(() =>
    mtdReadings.reduce((sum, r) => sum + (r.computed_cost || 0), 0),
    [mtdReadings]
  );

  // Pre-fill if current reading exists
  useEffect(() => {
    const existing = readings.find(r => r.source_id === source.id && r.reading_date === readingDateStr);
    if (existing) {
      setQuantity(String(existing.quantity));
    } else {
      setQuantity('');
    }
  }, [readingDateStr, source.id]); // intentionally omit `readings`

  const nQuantity = quantity === '' ? NaN : parseFloat(quantity);
  const computedPreview = !isNaN(nQuantity) && nQuantity >= 0 && activeTariff
    ? nQuantity * activeTariff.rate_per_unit
    : 0;

  const hasValidReading = !isNaN(nQuantity) && nQuantity >= 0;

  const handleSaveEntry = async () => {
    if (!hasValidReading) return;
    setIsSubmitting(true);
    try {
      await onSaveReading({
        source_id: source.id,
        reading_date: readingDateStr,
        quantity: nQuantity,
      });
      setQuantity('');
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
        <View style={[styles.statusStrip, { backgroundColor: hasValidReading ? '#0EA5E9' : colors.border }]} />

        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Droplets size={18} color="#0EA5E9" />
                <Text style={[styles.sourceName, { color: colors.text }]} numberOfLines={1}>{source.name}</Text>
              </View>
              <Text style={[styles.sourceMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                {typeLabel} · {source.capacity_litres ? `${source.capacity_litres} L` : 'No capacity'}
              </Text>
            </View>
            <View style={styles.actionButtons}>
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(source)} style={[styles.iconBtn, { backgroundColor: isDark ? '#21262d' : '#f0f9ff' }]}>
                  <Pencil size={16} color={isDark ? '#cbd5e1' : '#2563eb'} />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={() => onDelete(source.id)} style={[styles.iconBtn, { backgroundColor: isDark ? '#21262d' : '#fef2f2' }]}>
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Tariff Warning / Info */}
          {!activeTariff ? (
            <View style={[styles.warningBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.2)' : '#fde68a' }]}>
              <AlertTriangle size={16} color="#d97706" />
              <Text style={[styles.warningText, { color: '#d97706' }]}>NO ACTIVE TARIFF FOUND</Text>
            </View>
          ) : (
            <View style={[styles.tariffInfo, { backgroundColor: isDark ? 'rgba(14,165,233,0.08)' : '#f0f9ff' }]}>
              <Text style={[styles.tariffLabel, { color: colors.textSecondary }]}>RATE</Text>
              <Text style={[styles.tariffValue, { color: '#0EA5E9' }]}>
                ₹{activeTariff.rate_per_unit.toLocaleString()} / {unitLabel.slice(0, -1)}
              </Text>
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

          {/* Quantity */}
          <View style={styles.sectionDivider} />
          <View style={styles.fieldRow}>
             <Text style={[styles.fieldLabel, { color: colors.textSecondary, flex: 1 }]}>QUANTITY ({unitLabel.toUpperCase()})</Text>
             <View style={styles.mtdBadge}>
               <Text style={styles.mtdBadgeText}>MTD: {mtdUnits.toLocaleString()}</Text>
             </View>
          </View>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              placeholder={`Enter ${unitLabel.toLowerCase()}`}
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              value={quantity}
              onChangeText={setQuantity}
            />
            <Text style={[styles.unitLabel, { color: colors.textSecondary }]}>{unitLabel}</Text>
          </View>

          {/* Cost Preview */}
          {hasValidReading && activeTariff && (
            <View style={[styles.previewBox, { backgroundColor: isDark ? 'rgba(16,185,129,0.08)' : '#ecfdf5' }]}>
              <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>PREVIEW COST</Text>
              <Text style={[styles.previewValue, { color: '#10B981' }]}>₹{computedPreview.toLocaleString()}</Text>
            </View>
          )}

          {/* MTD Cost */}
          <View style={[styles.mtdRow, { marginTop: 12 }]}>
            <Text style={[styles.mtdLabel, { color: colors.textSecondary }]}>MTD EXPENSE</Text>
            <Text style={[styles.mtdValue, { color: colors.text }]}>₹{mtdCost.toLocaleString()}</Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: hasValidReading ? '#0EA5E9' : colors.border }
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
                  LOG WATER ENTRY
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
  sourceName: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  sourceMeta: {
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
  tariffInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  tariffLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tariffValue: {
    fontSize: 15,
    fontWeight: '800',
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
  mtdBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
  },
  mtdBadgeText: {
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
  inputWithUnit: {
    position: 'relative',
    justifyContent: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    paddingRight: 60,
    fontSize: 16,
    fontWeight: '600',
  },
  unitLabel: {
    position: 'absolute',
    right: 14,
    fontSize: 14,
    fontWeight: '700',
  },
  previewBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  mtdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  mtdLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  mtdValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
