import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Save, Store, Clock, ChevronDown } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { CafeteriaVendor, CafeteriaRevenue } from '@/services/cafeteriaService';
import { CustomDatePicker } from '@/components/shared/CustomDatePicker';

interface CafeteriaRevenueCardProps {
  vendor: CafeteriaVendor;
  revenues: CafeteriaRevenue[];
  onSaveRevenue: (payload: { vendor_id: string; revenue_date: string; revenue_amount: number }) => Promise<void>;
  colors: typeof Colors.light;
  isDark?: boolean;
}

export function CafeteriaRevenueCard({
  vendor,
  revenues,
  onSaveRevenue,
  colors,
  isDark
}: CafeteriaRevenueCardProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [revenueDateStr, setRevenueDateStr] = useState(todayStr);
  const [showDatePickerDropdown, setShowDatePickerDropdown] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState('');

  const commissionRate = vendor.commission_rate || 0;

  const vendorRevenues = useMemo(() =>
    revenues.filter(r => r.vendor_id === vendor.id),
    [revenues, vendor.id]
  );

  const mtdRevenue = useMemo(() =>
    vendorRevenues.reduce((sum, r) => sum + (r.revenue_amount || 0), 0),
    [vendorRevenues]
  );

  const mtdCommission = useMemo(() =>
    Math.round(mtdRevenue * (commissionRate / 100) * 100) / 100,
    [mtdRevenue, commissionRate]
  );

  // Pre-fill if current date already has revenue
  useEffect(() => {
    const existing = revenues.find(r => r.vendor_id === vendor.id && r.revenue_date === revenueDateStr);
    if (existing) {
      setAmount(String(existing.revenue_amount));
    } else {
      setAmount('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueDateStr, vendor.id]);

  const nAmount = amount === '' ? NaN : parseFloat(amount);
  const commissionPreview = !isNaN(nAmount) && nAmount >= 0
    ? Math.round(nAmount * (commissionRate / 100) * 100) / 100
    : 0;

  const hasValidAmount = !isNaN(nAmount) && nAmount >= 0;

  const handleSaveEntry = async () => {
    if (!hasValidAmount) return;
    setIsSubmitting(true);
    try {
      await onSaveRevenue({
        vendor_id: vendor.id,
        revenue_date: revenueDateStr,
        revenue_amount: nAmount,
      });
      setAmount('');
      const nextDate = new Date(revenueDateStr + "T00:00:00");
      nextDate.setDate(nextDate.getDate() + 1);
      setRevenueDateStr(nextDate.toISOString().split("T")[0]);
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
        <View style={[styles.statusStrip, { backgroundColor: hasValidAmount ? '#F59E0B' : colors.border }]} />

        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Store size={18} color="#F59E0B" />
                <Text style={[styles.vendorName, { color: colors.text }]} numberOfLines={1}>{vendor.shop_name}</Text>
              </View>
              <Text style={[styles.vendorMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                {vendor.service_type || 'Food Vendor'} · Commission {commissionRate}%
              </Text>
            </View>
          </View>

          {/* Commission Info */}
          <View style={[styles.infoBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb' }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>COMMISSION RATE</Text>
            <Text style={[styles.infoValue, { color: '#F59E0B' }]}>{commissionRate}%</Text>
          </View>

          {/* Revenue Date */}
          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Revenue Date</Text>
            <TouchableOpacity
              style={[styles.picker, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => setShowDatePickerDropdown(!showDatePickerDropdown)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Clock size={16} color={colors.textSecondary} />
                <Text style={[styles.pickerText, { color: colors.text }]}>
                  {revenueDateStr === todayStr
                    ? "Today"
                    : revenueDateStr ===
                        new Date(Date.now() - 86400000)
                          .toISOString()
                          .split("T")[0]
                      ? "Yesterday"
                      : revenueDateStr ===
                          new Date(Date.now() - 172800000)
                            .toISOString()
                            .split("T")[0]
                        ? "2 days ago"
                        : new Date(revenueDateStr + "T00:00:00").toLocaleDateString(
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
                        opt.value === revenueDateStr && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                      ]}
                      onPress={() => {
                        setRevenueDateStr(opt.value);
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
            selectedDate={revenueDateStr}
            onSelect={(date) => {
              setRevenueDateStr(date);
              setShowCustomDatePicker(false);
            }}
            onClose={() => setShowCustomDatePicker(false)}
            colors={colors}
          />

          {/* Revenue Amount */}
          <View style={styles.sectionDivider} />
          <View style={styles.fieldRow}>
             <Text style={[styles.fieldLabel, { color: colors.textSecondary, flex: 1 }]}>DAILY REVENUE (₹)</Text>
             <View style={styles.mtdBadge}>
               <Text style={styles.mtdBadgeText}>MTD: ₹{Math.round(mtdRevenue).toLocaleString()}</Text>
             </View>
          </View>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              placeholder="Enter revenue amount"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <Text style={[styles.unitLabel, { color: colors.textSecondary }]}>₹</Text>
          </View>

          {/* Commission Preview */}
          {hasValidAmount && (
            <View style={[styles.previewBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb' }]}>
              <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>COMMISSION PREVIEW ({commissionRate}%)</Text>
              <Text style={[styles.previewValue, { color: '#F59E0B' }]}>₹{commissionPreview.toLocaleString()}</Text>
            </View>
          )}

          {/* MTD Commission */}
          <View style={[styles.mtdRow, { marginTop: 12 }]}>
            <Text style={[styles.mtdLabel, { color: colors.textSecondary }]}>MTD COMMISSION</Text>
            <Text style={[styles.mtdValue, { color: colors.text }]}>₹{mtdCommission.toLocaleString()}</Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: hasValidAmount ? '#F59E0B' : colors.border }
            ]}
            disabled={!hasValidAmount || isSubmitting}
            onPress={handleSaveEntry}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Save size={18} color={hasValidAmount ? '#fff' : colors.textTertiary} style={{ marginRight: 8 }} />
                <Text style={[styles.submitBtnText, { color: hasValidAmount ? '#fff' : colors.textTertiary }]}>
                  LOG REVENUE ENTRY
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
  vendorName: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  vendorMeta: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoValue: {
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
