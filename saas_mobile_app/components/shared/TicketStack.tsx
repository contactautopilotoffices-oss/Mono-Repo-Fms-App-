/**
 * TicketStack - Swipeable ticket card stack
 * Used in MST, Staff, and PropertyAdmin dashboards
 */
import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W } = Dimensions.get('window');

export interface Ticket {
  id: string;
  ticket_number?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  raised_by?: string | null;
  assignee?: {
    full_name?: string;
    email?: string;
    user_photo_url?: string | null;
  } | null;
  creator?: { full_name?: string } | null;
  photo_before_url?: string;
  sla_due_at?: string;
  score?: number;
  gamification_points?: number;
}

interface TicketStackProps {
  tickets: Ticket[];
  onTicketPress?: (ticket: Ticket) => void;
  maxVisible?: number;
  height?: number;
  emptyMessage?: string;
}

const STACK_HEIGHT = 380;

export const TicketStack: React.FC<TicketStackProps> = ({
  tickets,
  onTicketPress,
  maxVisible = 5,
  height = STACK_HEIGHT,
  emptyMessage = 'No tickets',
}) => {
  const [order, setOrder] = useState(tickets);
  const translateX = useSharedValue(0);

  useEffect(() => {
    setOrder(tickets);
    translateX.value = 0;
  }, [tickets]);

  const sendToBack = useCallback(() => {
    setOrder((prev) => {
      if (prev.length < 2) return prev;
      const [first, ...rest] = prev;
      return [...rest, first];
    });
    translateX.value = 0;
  }, []);

  const pan = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 80 || Math.abs(e.velocityX) > 500) {
        const dest = e.translationX > 0 ? SCREEN_W : -SCREEN_W;
        translateX.value = withTiming(dest, { duration: 150 }, () => {
          runOnJS(sendToBack)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
      }
    });

  if (order.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Ionicons name="ticket-outline" size={40} color="rgba(255,255,255,0.2)" />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={{ height }}>
      {order.slice(0, maxVisible).map((t, i) => {
        const isTop = i === 0;
        const offset = i * 10;
        const scale = 1 - i * 0.04;
        const opacity = i > 3 ? 0 : 1 - i * 0.15;

        return (
          <View
            key={t.id}
            style={[
              styles.cardWrapper,
              {
                transform: [{ translateY: offset }, { scale }],
                opacity,
                zIndex: maxVisible - i,
                pointerEvents: isTop ? 'auto' : 'none',
              },
            ]}
          >
            {isTop ? (
              <GestureDetector gesture={pan}>
                <Animated.View style={StyleSheet.absoluteFill}>
                  <TicketCard ticket={t} onPress={() => onTicketPress?.(t)} />
                </Animated.View>
              </GestureDetector>
            ) : (
              <TicketCard ticket={t} onPress={() => onTicketPress?.(t)} />
            )}
          </View>
        );
      })}
    </View>
  );
};

// ────────────────────────────────────────────────────────────────
// Ticket Card
// ────────────────────────────────────────────────────────────────

const TicketCard = memo(function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress?: () => void }) {
  const getPriorityColor = () => {
    switch (ticket.priority?.toLowerCase()) {
      case 'urgent':
      case 'critical':
        return { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', border: 'rgba(239,68,68,0.25)' };
      case 'high':
        return { bg: 'rgba(249,115,22,0.15)', text: '#F97316', border: 'rgba(249,115,22,0.25)' };
      case 'medium':
        return { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6', border: 'rgba(59,130,246,0.25)' };
      default:
        return { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', border: 'rgba(100,116,139,0.25)' };
    }
  };

  const priorityColors = getPriorityColor();

  const slaTime = ticket.sla_due_at
    ? new Date(ticket.sla_due_at).getTime() - Date.now()
    : null;
  const slaHours = slaTime ? Math.floor(slaTime / (1000 * 60 * 60)) : 0;
  const slaMinutes = slaTime ? Math.floor((slaTime % (1000 * 60 * 60)) / (1000 * 60)) : 0;
  const isOverdue = slaTime !== null && slaTime < 0;

  const score = ticket.gamification_points || ticket.score || 5;

  return (
    <TouchableOpacity
      style={styles.ticketCard}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {ticket.title}
        </Text>
      </View>

      {/* Priority & Status */}
      <View style={styles.badgesRow}>
        <View style={[styles.badge, { backgroundColor: priorityColors.bg, borderColor: priorityColors.border }]}>
          <Text style={[styles.badgeText, { color: priorityColors.text }]}>
            {ticket.priority?.toUpperCase() || 'MEDIUM'}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.25)' }]}>
          <Text style={[styles.badgeText, { color: '#8B5CF6' }]}>
            {ticket.status?.replace(/_/g, ' ').toUpperCase() || 'OPEN'}
          </Text>
        </View>
      </View>

      {/* Assignee */}
      {ticket.assignee && (
        <View style={styles.assigneeRow}>
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarText}>
              {ticket.assignee.full_name?.[0] || 'U'}
            </Text>
          </View>
          <Text style={styles.assigneeName}>
            {ticket.assignee.full_name || 'Unassigned'}
          </Text>
        </View>
      )}

      {/* SLA Timer */}
      {slaTime !== null && (
        <View style={[styles.slaRow, isOverdue && styles.slaRowOverdue]}>
          <Ionicons
            name="time-outline"
            size={14}
            color={isOverdue ? '#EF4444' : '#F59E0B'}
          />
          <Text style={[styles.slaText, isOverdue && styles.slaTextOverdue]}>
            {isOverdue ? 'Overdue: ' : 'Due: '}
            {Math.abs(slaHours)}h {Math.abs(slaMinutes)}m
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <View style={styles.scoreBadge}>
          <Ionicons name="star" size={12} color="#EAB308" />
          <Text style={styles.scoreText}>{score} pts</Text>
        </View>
        {ticket.ticket_number && (
          <Text style={styles.ticketNumber}>#{ticket.ticket_number}</Text>
        )}
      </View>

      {/* Swipe Hint */}
      <View style={styles.swipeHint}>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
        <Text style={styles.swipeHintText}>Swipe to next</Text>
      </View>
    </TouchableOpacity>
  );
});

// ────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    marginTop: 12,
  },
  cardWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  ticketCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    margin: 4,
    overflow: 'hidden',
  },
  cardHeader: {
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  avatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  assigneeName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  slaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  slaRowOverdue: {
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  slaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
  },
  slaTextOverdue: {
    color: '#EF4444',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(234,179,8,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EAB308',
  },
  ticketNumber: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  swipeHint: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    opacity: 0.4,
  },
  swipeHintText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
  },
});

export default TicketStack;