import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList } from 'react-native';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { X, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react-native';
import { StockMovement } from '@/services/stockService';

const formatDate = (dateString: string) => {
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + 
           ' ' + 
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return dateString;
  }
};

interface StockHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  movements: StockMovement[];
}

export function StockHistoryModal({ visible, onClose, movements }: StockHistoryModalProps) {
  
  const renderItem = ({ item: movement, index }: { item: StockMovement; index: number }) => {
    const isAdd = movement.action === 'add' || movement.action === 'initial';
    const isAdjust = movement.action === 'adjust';
    const Icon = isAdjust ? RefreshCw : (isAdd ? TrendingUp : TrendingDown);
    const iconColor = isAdjust ? '#60A5FA' : (isAdd ? '#10B981' : '#EF4444');
    const sign = isAdd ? '+' : (isAdjust ? '' : '-');

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.leftInfo}>
            <View style={[styles.iconWrap, { backgroundColor: iconColor + '20' }]}>
              <Icon size={16} color={iconColor} />
            </View>
            <View>
              <Text style={styles.itemName}>
                {movement.stock_items?.name || 'Unknown Item'}
              </Text>
              <Text style={styles.itemDate}>
                {formatDate(movement.created_at)}
              </Text>
            </View>
          </View>
          <View style={styles.rightInfo}>
            <Text style={[styles.quantityChange, { color: iconColor }]}>
              {sign}{Math.abs(movement.quantity_change)}
            </Text>
            <Text style={styles.quantityAfter}>
              Total: {movement.quantity_after}
            </Text>
          </View>
        </View>
        {movement.notes && (
          <View style={styles.notesWrap}>
            <Text style={styles.notesText}>{movement.notes}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeBlurView intensity={80} tint="dark" style={styles.header}>
          <View>
            <Text style={styles.title}>Stock History</Text>
            <Text style={styles.subtitle}>
              {movements?.length || 0} movement{(movements?.length || 0) !== 1 ? 's' : ''} recorded
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </SafeBlurView>

        <View style={styles.listContainer}>
          {(movements?.length || 0) === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No stock movements found.</Text>
            </View>
          ) : (
            <FlatList
              data={movements}
              renderItem={renderItem}
              keyExtractor={(item, index) => item.id || index.toString()}
              contentContainerStyle={styles.list}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  listContainer: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: { fontSize: 20, fontFamily: 'Poppins-Bold', color: '#FFF' },
  subtitle: { fontSize: 13, fontFamily: 'Urbanist-Medium', color: '#9CA3AF', marginTop: 2 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
  },
  list: { padding: 20, gap: 12, paddingBottom: 60 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftInfo: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  itemName: { fontSize: 15, fontFamily: 'Urbanist-Bold', color: '#FFF' },
  itemDate: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#9CA3AF', marginTop: 2 },
  rightInfo: { alignItems: 'flex-end' },
  quantityChange: { fontSize: 16, fontFamily: 'Urbanist-Bold' },
  quantityAfter: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#9CA3AF', marginTop: 2 },
  notesWrap: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  notesText: { fontSize: 13, fontFamily: 'Urbanist-Regular', color: '#D1D5DB' },
  emptyWrap: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontFamily: 'Urbanist-Medium' },
});
