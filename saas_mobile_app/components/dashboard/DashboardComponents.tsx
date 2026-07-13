// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Dimensions,
  Image,
  ViewStyle,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming, Easing, interpolateColor, useAnimatedProps, LinearTransition } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Accelerometer } from 'expo-sensors';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  SPACING,
  STATUS_COLORS,
  CARD_SURFACES,
} from '@/constants/designSystem';

const fontSans = Platform.select({ web: 'system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const fontDisplay = Platform.select({ web: '"SF Pro Display", system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });

// ─── Pulse Dot ────────────────────────────────────────────────────────────────
export function PulseDot({ color }: { color: string }) {
  return (
    <View
      style={[
        styles.pulseDot,
        { backgroundColor: color, shadowColor: color, shadowOpacity: 0.8, shadowRadius: 6 },
      ]}
    />
  );
}

// ─── Glass Tile ───────────────────────────────────────────────────────────────
export function GlassTile({
  label,
  icon,
  children,
  delay = 0,
  status,
  onPress,
  onLongPress,
  style,
}: {
  label: string;
  icon: any;
  children: React.ReactNode;
  delay?: number;
  status?: 'optimal' | 'watch' | 'critical';
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
}) {
  const statusColor = status ? STATUS_COLORS[status].bg : null;

  return (
    <Animated.View style={[styles.tileWrapper, style, { flex: 1, minWidth: '45%' }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}>
        <SafeBlurView intensity={45} style={styles.tile} tint="dark">
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.08)',
              'rgba(255,255,255,0.03)',
              'rgba(0,0,0,0.2)'
            ]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.tileContent}>
            <View style={styles.tileHeader}>
              <View style={styles.iconBadge}>
                <Ionicons name={icon} size={14} color="#FFFFFF" />
              </View>
              <Text style={styles.tileLabel}>{label.toUpperCase()}</Text>
              {status && <PulseDot color={statusColor!} />}
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" />
            </View>
            <View style={styles.tileBody}>{children}</View>
          </View>
        </SafeBlurView>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
export function MiniBarChart({ data, highlightColor }: { data: number[]; highlightColor?: string }) {
  const max = Math.max(...data, 1);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <View style={styles.barChart}>
      {data.map((v, i) => (
        <View key={i} style={styles.barContainer}>
          <View style={styles.barTrack}>
            {activeIndex === i && (
              <View style={{ position: 'absolute', top: -20, left: -20, right: -20, alignItems: 'center', zIndex: 10 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{Math.round(v)}</Text>
              </View>
            )}
            <Pressable
              onPressIn={() => setActiveIndex(i)}
              onPressOut={() => setActiveIndex(null)}
              // For web hover
              onHoverIn={() => setActiveIndex(i)}
              onHoverOut={() => setActiveIndex(null)}
              style={[
                styles.barFill,
                {
                  height: `${Math.max((v / max) * 100, 5)}%`,
                  backgroundColor: highlightColor || 'rgba(112,143,150,0.80)',
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <View style={styles.progressBar}>
      <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

// ─── Attention Card ───────────────────────────────────────────────────────────
export function AttentionCard({ item, index, onAction }: { item: any; index: number; onAction: () => void }) {
  const severityColor =
    item.severity === 'critical' ? '#EF4444' :
    item.severity === 'high' ? '#F59E0B' :
    item.severity === 'medium' ? '#3B82F6' : '#6B7280';

  const iconName =
    item.type === 'critical_ticket' ? 'alert-circle-outline' :
    item.type === 'stale_ticket' ? 'time-outline' :
    item.type === 'sop_missed' ? 'checkbox-outline' : 'information-circle-outline';

  // Live SLA countdown
  const [countdown, setCountdown] = useState('');
  const [isBreached, setIsBreached] = useState(false);

  useEffect(() => {
    if (!item.slaDeadline) return;
    const update = () => {
      const remaining = new Date(item.slaDeadline).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown('BREACHED');
        setIsBreached(true);
      } else {
        const hours = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        if (hours > 24) {
          const days = Math.floor(hours / 24);
          setCountdown(`${days}d ${hours % 24}h`);
        } else {
          setCountdown(`${hours}h ${mins}m`);
        }
        setIsBreached(false);
      }
    };
    update();
    const interval = setInterval(update, 60000); // tick every minute
    return () => clearInterval(interval);
  }, [item.slaDeadline]);

  // Ticket age
  const ticketAge = item.createdAt ? (() => {
    const ms = Date.now() - new Date(item.createdAt).getTime();
    const hours = Math.floor(ms / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  })() : null;

  // Pulsing border for critical
  const pulseAnim = useSharedValue(1);
  useEffect(() => {
    if (item.severity === 'critical') {
      pulseAnim.value = withRepeat(withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
    }
  }, [item.severity]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: item.severity === 'critical' ? pulseAnim.value : 1,
  }));

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(350)}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onAction}
        style={[styles.attentionCard, { borderLeftColor: severityColor, borderLeftWidth: 3 }]}
      >
        <SafeBlurView intensity={30} style={StyleSheet.absoluteFillObject} tint="dark" />
        <LinearGradient
          colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.05)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Pulsing glow bar for critical */}
        {item.severity === 'critical' && (
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#EF4444', borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }, pulseStyle]} />
        )}
        <View style={styles.attentionCardInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.attentionIconBadge, { backgroundColor: severityColor + '15' }]}>
              {item.photoBeforeUrl ? (
                <Image source={{ uri: item.photoBeforeUrl }} style={styles.badgeImage} resizeMode="cover" />
              ) : (
                <Ionicons name={iconName} size={14} color={severityColor} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.attentionTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.attentionDesc} numberOfLines={1}>{item.description}</Text>
              {/* Ticket age + SLA countdown row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                {ticketAge && (
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>
                    🕐 {ticketAge}
                  </Text>
                )}
                {countdown !== '' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isBreached ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                    <Ionicons name={isBreached ? 'warning' : 'timer-outline'} size={10} color={isBreached ? '#EF4444' : '#F59E0B'} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: isBreached ? '#EF4444' : '#F59E0B' }}>
                      {countdown}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={[styles.attentionActionBadge, { backgroundColor: severityColor + '15' }]}>
              <Text style={[styles.attentionActionText, { color: severityColor }]}>{item.action_label}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Stat Columns (3-Column Layout) ───────────────────────────────────────────
export function StatColumns({ data }: { data: { label: string; value: number | string; color: string }[] }) {
  return (
    <View style={styles.statColumnsRow}>
      {data.map((item, i) => (
        <View key={i} style={[styles.statCol, i < data.length - 1 && styles.statColDivider]}>
          <Text style={styles.statValue}>{item.value}</Text>
          <View style={styles.statLabelRow}>
            <View style={[styles.statDot, { backgroundColor: item.color }]} />
            <Text style={styles.statLabelText}>{item.label.toUpperCase()}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Compliance Gauge (Semi-circle) ───────────────────────────────────────────
export function ComplianceGauge({ value, total = 100 }: { value: number; total?: number }) {
  const percentage = Math.min((value / total) * 100, 100);
  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.semiCircleContainer}>
        {/* Simplified Semi-circle representation using borders/rotation */}
        <View style={styles.semiCircleTrack} />
        <View style={[styles.semiCircleFill, { transform: [{ rotate: `${(percentage / 100) * 180 - 180}deg` }] }]} />
        <View style={styles.semiCircleInner} />
      </View>
      
      <View style={styles.gaugeTextOverlay}>
        <View style={styles.gaugeTextRow}>
          <Text style={styles.gaugeValueBig}>{value}</Text>
          <Text style={styles.gaugeValueSlash}>/ {total}</Text>
        </View>
        <Text style={styles.gaugePercentLabel}>{percentage}% COMPLETED</Text>
      </View>
      
      <TouchableOpacity style={styles.askCassandraPill}>
        <Text style={styles.askCassandraPillText}>ASK CASSANDRA</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Schedule Item ────────────────────────────────────────────────────────────
export function ScheduleItem({ date, month, title, type, status }: { date: string; month: string; title: string; type: string; status: 'PENDING' | 'SCHEDULED' }) {
  const statusColor = status === 'PENDING' ? '#F5A000' : '#3182CE';
  return (
    <View style={styles.scheduleItem}>
      <SafeBlurView intensity={20} style={styles.scheduleDateBadge} tint="light">
        <Text style={styles.scheduleMonth}>{month.toUpperCase()}</Text>
        <Text style={styles.scheduleDate}>{date}</Text>
      </SafeBlurView>
      <View style={styles.scheduleContent}>
        <Text style={styles.scheduleTitle}>{title}</Text>
        <Text style={styles.scheduleType}>{type.toUpperCase()}</Text>
      </View>
      <Text style={[styles.scheduleStatus, { color: statusColor }]}>{status}</Text>
    </View>
  );
}

export function LiveDieselSphere({ level }: { level: number }) {
  const tiltX = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    let subscription: any = null;
    let isMounted = true;
    const subscribe = async () => {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isMounted) return;
      if (isAvailable) {
        Accelerometer.setUpdateInterval(50);
        subscription = Accelerometer.addListener(({ x }) => {
          if (isMounted) {
            tiltX.value = withSpring(x * 60, { damping: 10, stiffness: 50 });
          }
        });
      }
    };
    subscribe();
    
    // Endless rotation for the wave effect
    rotation.value = withRepeat(withTiming(360, { duration: 3000, easing: Easing.linear }), -1, false);

    return () => {
      isMounted = false;
      if (subscription) subscription.remove();
    };
  }, []);

  const animatedTiltStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateZ: `${-tiltX.value}deg` }
      ]
    };
  });

  const animatedWaveStyle1 = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateZ: `${rotation.value}deg` }
      ]
    };
  });

  const animatedWaveStyle2 = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateZ: `${rotation.value + 45}deg` } // offset the second wave
      ]
    };
  });

  const validLevel = Math.max(0, Math.min(100, level));
  const surfaceY = 60 - (validLevel / 100) * 60;

  return (
    <View style={{ 
      width: 60, height: 60, borderRadius: 30, 
      backgroundColor: 'rgba(255,255,255,0.05)', 
      borderWidth: 2, borderColor: 'rgba(245,158,11,0.4)', 
      overflow: 'hidden', alignItems: 'center', justifyContent: 'center' 
    }}>
      <Animated.View style={[{
        position: 'absolute',
        width: 60,
        height: 60,
        top: 0,
        left: 0,
      }, animatedTiltStyle]}>
        
        {/* Wave 1 */}
        <Animated.View style={[{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: 65, // Squircle for wave 1
          top: surfaceY,
          left: -45, // Center horizontally
          backgroundColor: 'rgba(245,158,11,0.5)',
        }, animatedWaveStyle1]} />
        
        {/* Wave 2 */}
        <Animated.View style={[{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: 60, // Different squircle for wave 2
          top: surfaceY + 5, 
          left: -45, 
          backgroundColor: 'rgba(245,158,11,0.8)',
        }, animatedWaveStyle2]} />

      </Animated.View>
      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '800', zIndex: 10 }}>{validLevel}%</Text>
    </View>
  );
}

export function LiveWaterSphere({ level }: { level: number }) {
  const tiltX = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    let subscription: any = null;
    let isMounted = true;
    const subscribe = async () => {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isMounted) return;
      if (isAvailable) {
        Accelerometer.setUpdateInterval(50);
        subscription = Accelerometer.addListener(({ x }) => {
          if (isMounted) {
            tiltX.value = withSpring(x * 60, { damping: 10, stiffness: 50 });
          }
        });
      }
    };
    subscribe();
    
    // Endless rotation for the water wave effect
    rotation.value = withRepeat(withTiming(360, { duration: 3000, easing: Easing.linear }), -1, false);

    return () => {
      isMounted = false;
      if (subscription) subscription.remove();
    };
  }, []);

  const animatedTiltStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateZ: `${-tiltX.value}deg` }
      ]
    };
  });

  const animatedWaveStyle1 = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateZ: `${rotation.value}deg` }
      ]
    };
  });

  const animatedWaveStyle2 = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateZ: `${rotation.value + 45}deg` } // offset the second wave
      ]
    };
  });

  const validLevel = Math.max(0, Math.min(100, level));
  const surfaceY = 60 - (validLevel / 100) * 60;

  return (
    <View style={{ 
      width: 60, height: 60, borderRadius: 30, 
      backgroundColor: 'rgba(14,165,233,0.1)', 
      borderWidth: 2, borderColor: 'rgba(14,165,233,0.3)', 
      overflow: 'hidden', alignItems: 'center', justifyContent: 'center' 
    }}>
      <Animated.View style={[{
        position: 'absolute',
        width: 60,
        height: 60,
        top: 0,
        left: 0,
      }, animatedTiltStyle]}>
        
        {/* Wave 1 */}
        <Animated.View style={[{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: 65, // Squircle for wave 1
          top: surfaceY,
          left: -45, // Center horizontally
          backgroundColor: 'rgba(14,165,233,0.4)',
        }, animatedWaveStyle1]} />
        
        {/* Wave 2 */}
        <Animated.View style={[{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: 60, // Different squircle for wave 2
          top: surfaceY + 5, 
          left: -45, 
          backgroundColor: 'rgba(14,165,233,0.7)',
        }, animatedWaveStyle2]} />

      </Animated.View>
      <Ionicons name="water" size={24} color="#FFF" style={{ zIndex: 10, opacity: 0.9 }} />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function LiveEnergyRing({ percentage }: { percentage: number }) {
  const progress = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    progress.value = withTiming(percentage, { duration: 1500, easing: Easing.out(Easing.cubic) });
    pulseScale.value = withRepeat(withTiming(1.2, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
    pulseOpacity.value = withRepeat(withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [percentage]);

  const radius = 26;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference - (Math.max(0, Math.min(100, progress.value)) / 100) * circumference;
    return {
      strokeDashoffset,
    };
  });

  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseScale.value }],
      opacity: pulseOpacity.value,
    };
  });

  return (
    <View style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
      
      {/* Pulse Bloom */}
      <Animated.View style={[{
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(16, 185, 129, 0.4)',
      }, pulseStyle]} />

      <Svg width={60} height={60} viewBox="0 0 60 60" style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="grad" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor="#10B981" stopOpacity="1" />
            <Stop offset="100%" stopColor="#F59E0B" stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Circle
          cx="30"
          cy="30"
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx="30"
          cy="30"
          r={radius}
          stroke="url(#grad)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          originX="30"
          originY="30"
          rotation="-90"
        />
      </Svg>
      
      <Ionicons name="flash" size={20} color="#10B981" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    borderRadius: 24,
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  tile: {
    borderRadius: 24,
    marginHorizontal: SPACING.xl,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    overflow: 'hidden',
  },
  tileContent: { padding: 16 },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileLabel: {
    flex: 1,
        fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5,
  },
  tileBody: { minHeight: 40 },
  barChart: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 12,
  },
  barContainer: { flex: 1, height: '100%' },
  barTrack: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { borderRadius: 4 },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    width: 64,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  attentionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    marginHorizontal: SPACING.xl,
    marginBottom: 8,
    overflow: 'hidden',
  },
  attentionCardInner: { padding: 10 },
  attentionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  badgeImage: {
    width: '100%',
    height: '100%',
  },
  attentionTitle: {
        fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attentionDesc: {
        fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
    lineHeight: 16,
  },
  attentionActionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  attentionActionText: {
        fontSize: 10,
    fontWeight: '700',
  },
  // Stat Columns
  statColumnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statColDivider: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
        fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
    letterSpacing: -1,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabelText: {
        fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1,
  },
  // Gauge (Semi-circle simulation)
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 5,
  },
  semiCircleContainer: {
    width: 200,
    height: 100,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  semiCircleTrack: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 14,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'absolute',
    bottom: -100,
  },
  semiCircleFill: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 16,
    borderColor: '#4ADE80',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    position: 'absolute',
    bottom: -100,
  },
  semiCircleInner: {
    width: 172,
    height: 86,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 86,
    borderTopRightRadius: 86,
  },
  gaugeTextOverlay: {
    position: 'absolute',
    top: 50,
    alignItems: 'center',
  },
  gaugeTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  gaugeValueBig: {
        fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gaugeValueSlash: {
        fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
    marginLeft: 4,
  },
  gaugePercentLabel: {
        fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    marginTop: -2,
  },
  askCassandraPill: {
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  askCassandraPillText: {
        fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  // Schedule
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 32,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  scheduleDateBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scheduleMonth: {
        fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
  },
  scheduleDate: {
        fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scheduleContent: {
    flex: 1,
    marginLeft: 16,
  },
  scheduleTitle: {
        fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scheduleType: {
        fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  scheduleStatus: {
        fontSize: 11,
    fontWeight: '700',
    marginRight: 16,
  },
});
