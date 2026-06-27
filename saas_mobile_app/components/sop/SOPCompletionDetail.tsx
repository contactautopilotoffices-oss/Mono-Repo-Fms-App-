import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Circle, Clock, User, Camera, Video, Calendar, ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/constants/designSystem';
import { useTheme } from '@/context';
import { serverApi } from '@/lib/serverApi';

interface SOPCompletionDetailProps {
  completionId?: string;
  propertyId?: string;
}

export default function SOPCompletionDetail({ completionId, propertyId: propId }: SOPCompletionDetailProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { propertyId: routeId, detailId: routeDetailId } = useLocalSearchParams<{ propertyId: string, detailId: string }>();
  const pid = propId || routeId;
  const cid = completionId || routeDetailId;
  const isDark = theme === 'dark';
  const bgGradient = isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const;

  const [completion, setCompletion] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cid) return;
    
    // We can do a single query to get the completion + user + template + items
    serverApi.query({
      table: 'sop_completions',
      action: 'select',
      select: `
        id, status, completed_at, completion_date,
        user:users!completed_by(full_name),
        template:sop_templates(title, description),
        items:sop_completion_items(
          id, is_checked, value, photo_url, video_url, checked_at,
          checked_by_user:users!checked_by(full_name),
          checklist_item:sop_checklist_items(title, description, type, is_optional, order_index)
        )
      `,
      filters: [{ op: 'eq', column: 'id', value: cid }],
      limit: 1,
    }).then(({ data, error }: any) => {
      if (!error && data && data.length > 0) {
        const comp = data[0];
        // Sort items by order_index
        if (comp.items) {
          comp.items.sort((a: any, b: any) => (a.checklist_item?.order_index || 0) - (b.checklist_item?.order_index || 0));
        }
        setCompletion(comp);
      }
      setLoading(false);
    });
  }, [cid]);

  if (loading) {
    return (
      <LinearGradient colors={bgGradient} style={styles.container}>
        <ActivityIndicator size="large" color="#708F96" style={{ marginTop: 60 }} />
      </LinearGradient>
    );
  }

  if (!completion) {
    return (
      <LinearGradient colors={bgGradient} style={styles.container}>
        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332', textAlign: 'center', marginTop: 60 }]}>
          Report not found
        </Text>
      </LinearGradient>
    );
  }

  const effectiveItems = completion.items || [];
  const checkedCount = effectiveItems.filter((i: any) => i.is_checked || i.value).length;
  const totalCount = effectiveItems.length;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  return (
    <LinearGradient colors={bgGradient} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
            {completion.template?.title || 'Checklist Report'}
          </Text>
          <View style={[styles.badge, completion.status === 'completed' ? styles.badgeSuccess : styles.badgePending]}>
            <Text style={[styles.badgeText, completion.status === 'completed' ? styles.badgeSuccessText : styles.badgePendingText]}>
              {completion.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={14} color="#708F96" />
            <Text style={[styles.metaText, { color: isDark ? 'rgba(230,235,238,0.7)' : 'rgba(26,35,50,0.7)' }]}>
              {completion.completion_date ? new Date(completion.completion_date).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <User size={14} color="#708F96" />
            <Text style={[styles.metaText, { color: isDark ? 'rgba(230,235,238,0.7)' : 'rgba(26,35,50,0.7)' }]}>
              {completion.user?.full_name || 'System User'}
            </Text>
          </View>
        </View>

        {/* Progress */}
        <GlassCard style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>
              AUDIT SCORE
            </Text>
            <Text style={styles.progressValue}>{checkedCount}/{totalCount}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </GlassCard>

        {/* Items */}
        <View style={styles.itemsList}>
          {effectiveItems.map((item: any, idx: number) => {
            const isCompleted = item.is_checked || item.value;
            const tItem = item.checklist_item;

            return (
              <GlassCard key={item.id} style={[styles.itemCard, !isCompleted && { opacity: 0.6 }]}>
                <View style={styles.itemHeader}>
                  {isCompleted ? <CheckCircle2 size={20} color="#10B981" /> : <Circle size={20} color="#94A3B8" />}
                  <Text style={[styles.itemTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
                    {tItem?.title}
                  </Text>
                </View>

                {tItem?.description ? (
                  <Text style={[styles.itemDesc, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>
                    {tItem.description}
                  </Text>
                ) : null}

                {/* Sub-meta */}
                {isCompleted && (
                  <View style={styles.itemMetaRow}>
                    <View style={styles.itemMetaBox}>
                      <User size={12} color="#708F96" />
                      <Text style={styles.itemMetaText}>
                        {item.checked_by_user?.full_name || completion.user?.full_name || 'System User'}
                      </Text>
                    </View>
                    {item.checked_at && (
                      <View style={styles.itemMetaBox}>
                        <Clock size={12} color="#708F96" />
                        <Text style={styles.itemMetaText}>
                          {new Date(item.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Value */}
                {isCompleted && tItem?.type !== 'checkbox' && (
                  <View style={styles.valueBox}>
                    <Text style={styles.valueLabel}>OBSERVATION</Text>
                    <Text style={styles.valueText}>{item.value}</Text>
                  </View>
                )}

                {/* Media */}
                {(item.photo_url || item.video_url) && (
                  <View style={styles.mediaContainer}>
                    <Text style={styles.valueLabel}>VISUAL PROOF</Text>
                    <View style={styles.mediaRow}>
                      {item.photo_url && (
                        <View style={styles.mediaItem}>
                          <Image source={{ uri: item.photo_url }} style={styles.mediaImage} />
                          <View style={styles.mediaBadge}>
                            <Camera size={10} color="#FFF" />
                            <Text style={styles.mediaBadgeText}>Photo</Text>
                          </View>
                        </View>
                      )}
                      {item.video_url && (
                        <View style={styles.mediaItem}>
                          <View style={styles.videoPlaceholder}>
                            <Video size={24} color="#FFF" />
                          </View>
                          <View style={styles.mediaBadge}>
                            <Video size={10} color="#FFF" />
                            <Text style={styles.mediaBadgeText}>Video</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </GlassCard>
            );
          })}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', flex: 1, marginRight: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  badgeSuccess: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  badgePending: { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  badgeSuccessText: { color: '#10B981' },
  badgePendingText: { color: '#F59E0B' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, fontWeight: '600' },
  progressCard: { padding: 16, marginBottom: 24, borderRadius: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  progressLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  progressValue: { fontSize: 16, fontWeight: '800', color: '#708F96' },
  progressBarBg: { height: 8, backgroundColor: 'rgba(112,143,150,0.2)', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#708F96', borderRadius: 4 },
  itemsList: { gap: 12 },
  itemCard: { padding: 16, borderRadius: 16 },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  itemTitle: { fontSize: 16, fontWeight: '700', flex: 1, marginTop: -2 },
  itemDesc: { fontSize: 13, marginLeft: 30, marginBottom: 12 },
  itemMetaRow: { flexDirection: 'row', gap: 12, marginLeft: 30, marginBottom: 12 },
  itemMetaBox: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(112,143,150,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  itemMetaText: { fontSize: 10, fontWeight: '700', color: '#708F96' },
  valueBox: { marginLeft: 30, backgroundColor: 'rgba(112,143,150,0.05)', padding: 10, borderRadius: 8, marginBottom: 12 },
  valueLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 4 },
  valueText: { fontSize: 14, fontWeight: '700', color: '#708F96' },
  mediaContainer: { marginLeft: 30, marginTop: 8 },
  mediaRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  mediaItem: { width: 120, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative', backgroundColor: '#1E293B' },
  mediaImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  videoPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  mediaBadge: { position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  mediaBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
});
