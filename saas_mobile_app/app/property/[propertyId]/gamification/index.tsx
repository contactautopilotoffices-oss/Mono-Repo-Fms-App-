import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const BADGE_INFO = [
  {
    name: 'First Ticket',
    description: 'Awarded when you resolve your very first ticket in the system.',
    icon: 'checkmark-circle',
    tint: '#34D399',
  },
  {
    name: 'Week Streak',
    description: 'Awarded for being active and resolving requests 7 days in a row.',
    icon: 'flame',
    tint: '#FBBF24',
  },
  {
    name: 'Ticket Master',
    description: 'Awarded after you successfully resolve 100 tickets total.',
    icon: 'trophy',
    tint: '#FBBF24',
  },
  {
    name: 'Night Owl',
    description: 'Awarded when you resolve 10 tickets during night shifts (after 10 PM).',
    icon: 'moon',
    tint: '#A78BFA',
  },
  {
    name: 'Top Resolver',
    description: 'Awarded when you reach the #1 rank on the weekly leaderboard.',
    icon: 'medal',
    tint: '#60A5FA',
  },
  {
    name: 'Power Saver',
    description: 'Awarded for correctly identifying and reducing energy wastage by 10%.',
    icon: 'flash',
    tint: '#F59E0B',
  },
];

export default function GamificationInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <LinearGradient
        colors={['#1E293B', '#0B0B0F']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Ionicons name="star" size={24} color="#FBBF24" />
          <Text style={styles.headerTitle}>Gamification Guide</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        
        {/* Intro */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How it works</Text>
          <Text style={styles.cardText}>
            Our maintenance portal includes a gamification system designed to recognize and reward your hard work. 
            By resolving tickets, maintaining daily streaks, and completing special quests, you earn XP (Experience Points) 
            which helps you level up and climb the weekly leaderboard!
          </Text>
        </View>

        {/* XP & Levels */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="trending-up" size={20} color="#34D399" />
            <Text style={styles.cardTitle}>XP & Leveling</Text>
          </View>
          <Text style={styles.cardText}>
            Every action you take in the app rewards you with XP:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletText}>• Resolving a standard ticket: <Text style={styles.highlight}>+50 XP</Text></Text>
            <Text style={styles.bulletText}>• Resolving a high-priority ticket: <Text style={styles.highlight}>+100 XP</Text></Text>
            <Text style={styles.bulletText}>• Completing a daily checklist: <Text style={styles.highlight}>+25 XP</Text></Text>
            <Text style={styles.bulletText}>• Logging utility readings: <Text style={styles.highlight}>+15 XP</Text></Text>
          </View>
          <Text style={[styles.cardText, { marginTop: 12 }]}>
            As you accumulate XP, you will level up. Your level title (e.g., Rookie, Pro, Master) is displayed on your profile.
          </Text>
        </View>

        {/* Streaks */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="flame" size={20} color="#F87171" />
            <Text style={styles.cardTitle}>Daily Streaks</Text>
          </View>
          <Text style={styles.cardText}>
            Log in and complete at least one task every day to build your streak. Maintaining a high streak gives you an XP multiplier, allowing you to level up even faster. If you miss a day, your streak will reset to zero!
          </Text>
        </View>

        {/* Badges */}
        <Text style={styles.sectionTitle}>Badges & Achievements</Text>
        <Text style={styles.sectionSubtitle}>
          Unlock special badges by reaching specific milestones. These badges are displayed permanently on your profile.
        </Text>

        <View style={styles.badgesGrid}>
          {BADGE_INFO.map((badge, index) => (
            <View key={index} style={styles.badgeCard}>
              <View style={[styles.badgeIconWrapper, { backgroundColor: badge.tint + '20', borderColor: badge.tint + '40' }]}>
                <Ionicons name={badge.icon as any} size={28} color={badge.tint} />
              </View>
              <View style={styles.badgeInfo}>
                <Text style={styles.badgeName}>{badge.name}</Text>
                <Text style={styles.badgeDesc}>{badge.description}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 22,
  },
  bulletList: {
    marginTop: 8,
    paddingLeft: 4,
    gap: 6,
  },
  bulletText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  highlight: {
    color: '#34D399',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 20,
    lineHeight: 20,
  },
  badgesGrid: {
    gap: 12,
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  badgeIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeInfo: {
    flex: 1,
  },
  badgeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  badgeDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },
});
