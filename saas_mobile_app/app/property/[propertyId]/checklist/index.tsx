// @ts-nocheck
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useGlobalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { requestCameraPermissionWithSettings, requestMediaLibraryPermissionWithSettings } from '@/utils/permissions';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";

import { LoggersMenu } from "@/components/shared/LoggersMenu";
import { checklistService } from "@/services/checklistService";
import { isDue, getCompletionSlot, computeSlotTime, getNextHourlySlotStart, parseHourlyInterval as getHourlyInterval, isWithinTimeWindow, fmt12h, fmtRemaining, getISTDateParts } from "@/utils/checklistTime";
import { processAndStampImage } from "@/utils/mediaProcessor";

import {
  CheckSquare,
  Check,
  Plus,
  ClipboardList,
  Play,
  Clock,
  User,
  ChevronRight,
  X,
  Camera,
  CheckCircle2,
  Circle,
  ArrowLeft,
  AlertCircle,
  FileText,
  ListChecks,
  Trash2,
  Edit3,
  Pause,
  PlayCircle,
  History,
  MessageSquare,
  ChevronDown,
  RotateCcw,
  Calendar,
  Repeat,
  Lock,
  Eye,
  Film,
  Download,
  LayoutGrid,
  Square,
  Loader2,
  Paperclip,
  Maximize2,
  Star,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import Svg, { Circle as SvgCircle } from "react-native-svg";
import * as ExpoAV from "expo-av";
import MediaViewerModal from "@/components/shared/MediaViewerModal";
import { useServerQuery } from "@/hooks/useServerQuery";
import { queryKeys } from "@/utils/queryKeys";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Types ─────────────────────────────────────────────────────────────────────

type Frequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "on_demand"
  | "every_1_hour"
  | "every_2_hours"
  | "every_3_hours"
  | "every_4_hours"
  | "every_6_hours"
  | "every_8_hours"
  | "every_12_hours";

type ItemType = "checkbox" | "text" | "number" | "yes_no";

interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  type: ItemType;
  order_index: number;
  section_title?: string;
  requires_photo: boolean;
  requires_comment: boolean;
  is_optional: boolean;
  start_time?: string;
  end_time?: string;
}

interface SOPCompletionItem {
  id: string;
  is_checked: boolean;
  photo_url?: string;
  video_url?: string;
  comment?: string;
  value?: string;
  checked_at?: string;
  checked_by?: string;
  checklist_item_id: string;
  checked_by_user?: { full_name: string } | { full_name: string }[];
  admin_rating?: number | null;
}

interface SOPCompletion {
  id: string;
  template_id: string;
  status: "in_progress" | "completed" | "partial" | "missed";
  completion_date?: string;
  slot_time?: string;
  completed_at?: string;
  completed_by?: string;
  notes?: string;
  is_late?: boolean;
  created_at: string;
  items: SOPCompletionItem[];
  user?: { id: string; full_name: string };
  admin_rating?: number | null;
}

interface SOPTemplate {
  id: string;
  title: string;
  description?: string;
  category?: string;
  frequency: Frequency;
  is_running: boolean;
  is_active: boolean;
  start_time?: string;
  end_time?: string;
  assigned_to?: string[];
  property_id: string;
  organization_id?: string;
  created_by?: string;
  created_at: string;
  items: ChecklistItem[];
  completions: SOPCompletion[];
}

interface PropertyMember {
  id: string;
  full_name: string;
  role: string;
}

interface MissedOccurrence {
  template: SOPTemplate;
  date: string;
  slotTime: string | null;
  label: string;
}

// ─── Utility Functions ──────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "on_demand", label: "On Demand" },
  { value: "every_1_hour", label: "Every 1 Hour" },
  { value: "every_2_hours", label: "Every 2 Hours" },
  { value: "every_3_hours", label: "Every 3 Hours" },
  { value: "every_4_hours", label: "Every 4 Hours" },
  { value: "every_6_hours", label: "Every 6 Hours" },
  { value: "every_8_hours", label: "Every 8 Hours" },
  { value: "every_12_hours", label: "Every 12 Hours" },
];

function getFrequencyLabel(freq: Frequency | undefined | null): string {
  return (
    FREQUENCY_OPTIONS.find((f) => f.value === freq)?.label ?? freq ?? "Daily"
  );
}

function parseHourlyInterval(freq: string): number | null {
  if (!freq || typeof freq !== 'string') return null;
  const match = freq.match(/^every_(\d+)_hours?$/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return isNaN(val) ? null : val;
}

function isHourlyFreq(freq: Frequency | undefined | null): boolean {
  return parseHourlyInterval(freq || "") !== null;
}

type DueStatus = "due" | "missed" | "completed" | "upcoming" | "paused" | "";

function computeDueStatus(
  frequency: Frequency | undefined | null,
  lastCompletionDate: string | null | undefined,
  startTime: string | undefined,
  endTime: string | undefined,
  lastCompletedAt: string | null | undefined,
  template: SOPTemplate,
  completions: SOPCompletion[],
  refDate: Date,
): { due: boolean; label: string; status: DueStatus } {
  const result = isDue(
    frequency || "",
    lastCompletionDate || null,
    startTime || null,
    endTime || null,
    lastCompletedAt || null,
    completions.find((c) => c.status === "in_progress")?.created_at,
    refDate
  );
  return result as { due: boolean; label: string; status: DueStatus };
}

function getTemplateGaps(
  template: SOPTemplate,
  completions: SOPCompletion[],
  refDate: Date,
  daysLimit = 7,
): MissedOccurrence[] {
  if (template.frequency === "on_demand") return [];
  const gaps: MissedOccurrence[] = [];
  const nowMins = refDate.getHours() * 60 + refDate.getMinutes();

  for (let i = 0; i < daysLimit; i++) {
    const d = new Date(refDate.getTime() - i * 24 * 60 * 60 * 1000);
    const dIst = getISTDateParts(d);
    const dateStr = dIst.isoDate;
    const isToday = i === 0;

    // Do not generate missed gaps for dates prior to template creation
    const createdDateIst = getISTDateParts(new Date(template.created_at));
    const createdDateStr = createdDateIst.isoDate;
    if (dateStr < createdDateStr) continue;

    if (template.frequency === "daily" || isHourlyFreq(template.frequency)) {
      if (!template.start_time || !template.end_time) {
        // Simple daily
        const exists = completions.some(
          (c) => c.completion_date === dateStr && c.status === "completed",
        );
        if (!exists && !isToday) {
          gaps.push({
            template,
            date: dateStr,
            slotTime: null,
            label: `Missed: ${formatRelative(dateStr)}`,
          });
        }
      } else {
        // Hourly or Timed Daily
        const [sh, sm] = template.start_time.slice(0, 5).split(":").map(Number);
        const [eh, em] = template.end_time.slice(0, 5).split(":").map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        const isOvernight = endMins <= startMins;
        const intervalH = getHourlyInterval(template.frequency);

        const baselineDate =
          isOvernight && nowMins < endMins && isToday
            ? new Date(d.getTime() - 24 * 60 * 60 * 1000)
            : d;
        const baselineIst = getISTDateParts(baselineDate);
        const baselineStr = baselineIst.isoDate;
        const windowDuration = isOvernight
          ? 1440 - startMins + endMins
          : endMins - startMins;

        const slots: { date: string; time: string; startTs: number }[] = [];
        if (intervalH) {
          for (
            let t = 0;
            t + intervalH * 60 <= windowDuration;
            t += intervalH * 60
          ) {
            const slotMins = startMins + t;
            const h = Math.floor(slotMins / 60) % 24;
            const mn = slotMins % 60;
            const timeStr = `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
            slots.push({
              date: baselineStr,
              time: timeStr,
              startTs: baselineDate.getTime() + t * 60 * 1000,
            });
          }
        } else {
          // Timed Daily (1 slot)
          slots.push({
            date: baselineStr,
            time: template.start_time,
            startTs: baselineDate.getTime() + startMins * 60 * 1000,
          });
        }

        for (const slot of slots) {
          const slotTime = slot.startTs;
          if (slotTime > refDate.getTime()) continue; // Future

          // CRITICAL: Only count as missed if the slot started AFTER the template was created
          const createdTime = new Date(template.created_at).getTime();
          if (slotTime < createdTime - 5 * 60000) continue; // 5 min grace

          // Is it currently active? (If so, it's 'Due' not 'Missed' in the gaps list)
          const currentlyActive =
            isWithinTimeWindow(
              nowMins,
              template.start_time,
              template.end_time,
            ) &&
            isToday &&
            slot.startTs <= refDate.getTime() &&
            slot.startTs + (intervalH ? intervalH * 3600000 : 3600000) >
              refDate.getTime();

          if (currentlyActive) continue;

          const exists = completions.some(
            (c) =>
              c.completion_date === slot.date &&
              (slot.time === null || c.slot_time === slot.time) &&
              c.status === "completed",
          );

          if (!exists) {
            const logicalSlotStr = intervalH
              ? ` slot at ${fmt12h(slot.time)}`
              : "";
            gaps.push({
              template,
              date: slot.date,
              slotTime: slot.time,
              label: `${formatRelative(slot.date)}${logicalSlotStr}`,
            });
          }
        }
      }
    }
  }
  return gaps;
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(
    dateStr.endsWith("Z") || dateStr.includes("T")
      ? dateStr
      : dateStr + "T00:00:00",
  );
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const diffDays = Math.floor(diff / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSlotWindow(
  slotTime: string | null | undefined,
  frequency: string | undefined | null,
): string | null {
  const intervalH = parseHourlyInterval(frequency || "");
  if (!intervalH || !slotTime || typeof slotTime !== 'string') return null;
  const timeParts = slotTime.slice(0, 5).split(":").map(Number);
  if (timeParts.some(isNaN)) return null;
  const [sH, sM] = timeParts;
  if (isNaN(sH) || isNaN(sM)) return null;
  const endH = (sH + intervalH) % 24;
  const endSlot = `${String(endH).padStart(2, "0")}:${String(sM).padStart(2, "0")}:00`;
  return `${fmt12h(slotTime)} – ${fmt12h(endSlot)}`;
}

// ─── Circular Progress Component ───────────────────────────────────────────────

function CircularProgress({
  progress,
  size = 40,
  strokeWidth = 4,
  color = "#718f96",
  bgColor = "#f1f5f9",
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference * (1 - clampedProgress);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {/* Background circle */}
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: Math.max(8, size * 0.22),
            fontWeight: "900",
            color: "#1A2332",
          }}
        >
          {Math.round(clampedProgress * 100)}%
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

type SubView = "history" | "templates" | "runner" | "detail";
type HistoryFilter = "all" | "due" | "missed" | "completed";
type DueStatusEntry = { due: boolean; label: string; status: DueStatus };
type HistoryItem =
  | { type: "date_header"; date: string }
  | { type: "template"; data: SOPTemplate }
  | { type: "completion"; data: SOPCompletion }
  | { type: "missed_occurrence"; data: MissedOccurrence };

// ─── Status Badge Component ────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: DueStatus; label: string }) {
  const { theme } = useTheme();
  const sysColors = Colors[theme];
  const badgeColors: Record<string, { bg: string; text: string }> = {
    due: { bg: "#F59E0B20", text: "#F59E0B" },
    missed: { bg: "#EF444420", text: sysColors.error || sysColors.warning },
    completed: { bg: "#10B98120", text: sysColors.success },
    upcoming: { bg: "#3B82F620", text: "#3B82F6" },
    paused: { bg: "#6B728020", text: "#6B7280" },
  };
  const c = badgeColors[status] || badgeColors.upcoming;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: c.bg,
        marginTop: 6,
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontFamily: "Urbanist-ExtraBold",
          letterSpacing: 0.5,
          color: c.text,
          textTransform: "uppercase",
        }}
      >
        {(status || "UPCOMING").toUpperCase()}
      </Text>
    </View>
  );
}

const TemplateCard = ({
  template,
  ds,
  lastDone,
  inProgress,
  liveNow,
  onPress,
  onStart,
}: {
  template: SOPTemplate;
  ds: DueStatusEntry;
  lastDone?: SOPCompletion;
  inProgress?: SOPCompletion;
  liveNow: Date;
  onPress: () => void;
  onStart: () => void;
}) => {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isPaused = !template.is_running;
  const displayStatus: DueStatus = isPaused ? "paused" : (ds.status || (inProgress ? "due" : "upcoming"));
  const intervalH = getHourlyInterval(template.frequency);
  const showCountdown =
    displayStatus === "upcoming" &&
    intervalH !== null &&
    !!template.start_time &&
    !!template.end_time;
  const nextSlot = showCountdown
    ? getNextHourlySlotStart(template.frequency, template.start_time, template.end_time, liveNow)
    : null;
  const countdownMs = nextSlot ? nextSlot.getTime() - liveNow.getTime() : 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.historyCard, { marginBottom: 12, backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.historyCardRow}>
          <View style={styles.historyCardContent}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>{template.title}</Text>
            <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
              {getFrequencyLabel(template.frequency)}
              {template.start_time ? ` · ${fmt12h(template.start_time)}` : ""}
            </Text>
            {!!template.description && (
              <Text style={[styles.historyMeta, { marginTop: 4, color: colors.textSecondary }]} numberOfLines={2}>
                {template.description}
              </Text>
            )}

            <StatusBadge status={displayStatus} label={ds.label} />

            {!!lastDone?.completion_date && (
              <Text style={[styles.historyMeta, { marginTop: 6, color: colors.textSecondary }]}>
                Last done {formatRelative(lastDone.completion_date)}
              </Text>
            )}
            {!!ds.label && !isPaused && !showCountdown && (
              <Text style={[styles.historyMeta, { marginTop: 2, color: colors.textSecondary }]}>
                {ds.label}
              </Text>
            )}
            {showCountdown && countdownMs > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                <Clock size={12} color={colors.primary} />
                <Text style={{ fontSize: 12, fontFamily: "Urbanist-Bold", color: colors.primary }}>
                  Starts in {fmtRemaining(countdownMs)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.historyCardRight}>
            <TouchableOpacity style={[styles.startBtn, { backgroundColor: colors.primary }]} onPress={onStart}>
              <Play size={14} color="#FFFFFF" />
              <Text style={styles.startBtnText}>{inProgress ? "Resume" : isPaused ? "Start" : "Start"}</Text>
            </TouchableOpacity>
            <ChevronRight size={18} color={colors.textSecondary} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const HistoryListCard = ({
  item,
  templates,
  dueStatusMap,
  liveNow,
  onStart,
  onView,
}: {
  item: HistoryItem;
  templates: SOPTemplate[];
  dueStatusMap: Record<string, DueStatusEntry>;
  liveNow: Date;
  onStart: (
    template: SOPTemplate,
    inProgress?: SOPCompletion,
    backfillDate?: string,
    backfillSlot?: string,
  ) => void;
  onView: (comp: SOPCompletion) => void;
}) => {
  const { theme } = useTheme();
  const colors = Colors[theme];
  if (item.type === "template") {
    const template = item.data;
    const inProgress = template.completions.find((comp: SOPCompletion) => comp.status === "in_progress");
    return (
      <TemplateCard
        template={template}
        ds={dueStatusMap[template.id] ?? { due: false, label: "", status: "" }}
        lastDone={template.completions
          .filter((comp: SOPCompletion) => comp.status === "completed")
          .sort(
            (a: SOPCompletion, b: SOPCompletion) =>
              new Date(b.completed_at || b.completion_date || 0).getTime() -
              new Date(a.completed_at || a.completion_date || 0).getTime()
          )[0]}
        inProgress={inProgress}
        liveNow={liveNow}
        onPress={() => {
          if (inProgress) onView(inProgress);
        }}
        onStart={() => onStart(template, inProgress)}
      />
    );
  }

  if (item.type === "completion") {
    const completion = item.data;
    const template = templates.find((entry) => entry.id === completion.template_id);
    const isLate = completion.is_late === true;
    const statusColor = isLate ? "#F59E0B" : "#10B981";
    const iconBg = isLate ? "#FEF3C7" : "#D1FAE5";
    const completedTime = completion.completed_at
      ? new Date(completion.completed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      : completion.slot_time
      ? getSlotWindow(completion.slot_time, template?.frequency) || fmt12h(completion.slot_time)
      : "N/A";
    const userName =
      completion.user?.full_name ||
      (completion as any).completed_by_user?.full_name ||
      "Unknown";

    return (
      <TouchableOpacity onPress={() => onView(completion)} activeOpacity={0.85}>
        <View style={[styles.historyCard, { marginBottom: 12, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.historyCardRow}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iconBg, justifyContent: "center", alignItems: "center" }}>
              <Check size={22} color={statusColor} strokeWidth={2.5} />
            </View>
            <View style={styles.historyCardContent}>
              <Text style={[styles.historyTitle, { color: colors.text }]}>{template?.title || "Checklist Completion"}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Clock size={12} color={isLate ? statusColor : colors.textSecondary} />
                  <Text style={{ fontSize: 12, color: isLate ? statusColor : colors.textSecondary, fontFamily: "Urbanist-Medium" }}>
                    {completedTime}
                  </Text>
                </View>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textTertiary }} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <User size={12} color={statusColor} />
                  <Text style={{ fontSize: 12, color: statusColor, fontFamily: "Urbanist-Bold", textTransform: "uppercase" }}>
                    {userName}
                  </Text>
                </View>
              </View>
              {isLate && (
                <View style={{ alignSelf: "flex-start", marginTop: 6, backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ fontSize: 9, fontFamily: "Urbanist-ExtraBold", color: "#F59E0B", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    LATE
                  </Text>
                </View>
              )}
              {completion.admin_rating ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 2 }}>
                  {[1, 2, 3].map((star) => (
                    <Star
                      key={star}
                      size={10}
                      color={star <= completion.admin_rating! ? "#FBBF24" : colors.textTertiary}
                      fill={star <= completion.admin_rating! ? "#FBBF24" : "none"}
                    />
                  ))}
                  <Text style={{ fontSize: 9, color: colors.textSecondary, marginLeft: 4 }}>
                    {completion.admin_rating === 1 ? "Needs Work" : completion.admin_rating === 2 ? "Acceptable" : "Excellent"}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.historyCardRight}>
              <ChevronRight size={18} color={colors.textSecondary} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const missed = item.data;
  return (
    <View style={[styles.historyCard, { marginBottom: 12, backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.historyCardRow}>
        <View style={styles.historyCardContent}>
          <Text style={[styles.historyTitle, { color: colors.text }]}>{missed.template.title}</Text>
          <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>Missed on {formatRelative(missed.date)}</Text>
          <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>{missed.label}</Text>
        </View>
        <View style={styles.historyCardRight}>
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: colors.primary }]}
            onPress={() =>
              onStart(
                missed.template,
                undefined,
                missed.date,
                missed.slotTime || undefined,
              )
            }
          >
            <RotateCcw size={14} color="#FFFFFF" />
            <Text style={styles.startBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ChecklistScreen() {
  const { propertyId, startTemplateId } = useGlobalSearchParams<{
    propertyId: string;
    startTemplateId?: string;
  }>();
  const { theme } = useTheme();
  const { user, membership } = useAuth();
  const router = useRouter();
  const colors = Colors[theme];
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();

  // ── State ────────────────────────────────────────────────────────────────────
  const [view, setView] = useState<SubView>("history");

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SOPTemplate | null>(
    null,
  );

  // Runner state
  const [activeTemplate, setActiveTemplate] = useState<SOPTemplate | null>(
    null,
  );
  const [activeCompletion, setActiveCompletion] =
    useState<SOPCompletion | null>(null);
  const [itemStates, setItemStates] = useState<
    Record<
      string,
      {
        checked: boolean;
        photo?: string;
        video?: string;
        value?: string;
        comment?: string;
        photoUploading?: boolean;
        videoUploading?: boolean;
        fileUploading?: boolean;
      }
    >
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  // History detail
  const [historyCompletion, setHistoryCompletion] =
    useState<SOPCompletion | null>(null);
  const [mediaViewer, setMediaViewer] = useState<
    { uri: string; type: "photo" | "video" } | null
  >(null);

  const handleDownloadMedia = async (uri: string, type: "photo" | "video") => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Media library permission is needed to save files."
        );
        return;
      }
      const ext = type === "video" ? "mp4" : "jpg";
      const mimeType = type === "video" ? "video/mp4" : "image/jpeg";
      const fileName = `autopilot_${type}_${Date.now()}.${ext}`;
      const destFile = Paths.cache.createFile(fileName, mimeType);
      await File.downloadFileAsync(uri, destFile, { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(destFile.uri);
      Alert.alert(
        "Saved",
        `${type === "video" ? "Video" : "Photo"} saved to gallery.`
      );
    } catch (err: any) {
      console.error("[checklist] download media error:", err);
      Alert.alert("Download Failed", err.message || "Could not save the file.");
    }
  };

  // Template form state
  const [tplTitle, setTplTitle] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplCategory, setTplCategory] = useState("general");
  const [tplFrequency, setTplFrequency] = useState<Frequency>("daily");
  const [tplStartTime, setTplStartTime] = useState("");
  const [tplEndTime, setTplEndTime] = useState("");
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [tplAssignedTo, setTplAssignedTo] = useState<string[]>([]);
  const [tplItems, setTplItems] = useState<
    {
      title: string;
      description: string;
      type: ItemType;
      requires_photo: boolean;
      requires_comment: boolean;
      is_optional: boolean;
      section_title: string;
      start_time: string;
      end_time: string;
    }[]
  >([]);

  // UI state
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(
    null,
  );
  const [expandedCompletions, setExpandedCompletions] = useState<
    Record<string, SOPCompletion[]>
  >({});
  const [showLoggersMenu] = useState(false);
  const realtimeChannel = useRef<any>(null);

  // ── Derived time picker values ──────────────────────────────────────────────
  const startTimeDate = useMemo(() => {
    if (!tplStartTime) return new Date();
    const [h, m] = tplStartTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }, [tplStartTime]);

  const endTimeDate = useMemo(() => {
    if (!tplEndTime) return new Date();
    const [h, m] = tplEndTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 23, m || 59, 0, 0);
    return d;
  }, [tplEndTime]);

  // ── Permissions ──────────────────────────────────────────────────────────────
  const isAdmin = useMemo(() => {
    if (!membership || !propertyId) return false;
    const prop = membership.properties.find((p) => p.id === propertyId);
    if (!prop) return false;
    return [
      "property_admin",
      "org_admin",
      "org_super_admin",
      "master_admin",
    ].includes(prop.role.toLowerCase());
  }, [membership, propertyId]);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!propertyId) return { templates: [] as SOPTemplate[], propertyMembers: [] as PropertyMember[], orgId: null as string | null, completions: [] as SOPCompletion[] };
    const res = await checklistService.fetchChecklistData(propertyId);
    if (res.error) throw new Error(res.error);

    const typed = (res.templates || []) as SOPTemplate[];

    // Build flat completions list
    const allComps: SOPCompletion[] = [];
    typed.forEach((t) => {
      if (t.completions) allComps.push(...t.completions);
    });
    allComps.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    
    return {
      templates: typed,
      propertyMembers: res.propertyMembers || [],
      orgId: res.organizationId || null,
      completions: allComps,
    };
  }, [propertyId]);

  const { data, isLoading, refetch } = useServerQuery(
    queryKeys.property.checklist(propertyId),
    fetchData,
    { staleTime: 1000 * 60 * 5, refetchOnMount: 'always' }
  );

  const templates = data?.templates ?? [];
  const propertyMembers = data?.propertyMembers ?? [];
  const orgId = data?.orgId ?? null;
  const completions = data?.completions ?? [];

  // ── Computed ────────────────────────────────────────────────────────────────
  const filteredTemplates = useMemo(() => {
    if (!templates.length) return [];
    if (isAdmin) return templates;
    return templates.filter(
      (t) => 
        !t.assigned_to ||
        t.assigned_to.length === 0 ||
        (Array.isArray(t.assigned_to) ? t.assigned_to.includes(user?.id ?? "") : false),
    );
  }, [templates, isAdmin, user]);

  const filteredCompletions = useMemo(() => {
    if (isAdmin) return completions;
    return completions.filter((c) => c.completed_by === user?.id);
  }, [completions, isAdmin, user]);

  const dueStatusMap = useMemo(() => {
    const map: Record<
      string,
      { due: boolean; label: string; status: DueStatus }
    > = {};
    for (const t of filteredTemplates) {
      if (!t.is_running) {
        map[t.id] = { due: false, label: "Paused", status: "paused" };
        continue;
      }
      const lastDone = t.completions
        .filter((c) => c.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.completed_at || b.completion_date || 0).getTime() -
            new Date(a.completed_at || a.completion_date || 0).getTime(),
        )[0];
      map[t.id] = computeDueStatus(
        t.frequency,
        lastDone?.completion_date ?? null,
        t.start_time,
        t.end_time,
        lastDone?.completed_at ?? null,
        t,
        t.completions,
        liveNow,
      );
    }
    return map;
  }, [filteredTemplates, liveNow]);

  const historyStats = useMemo(() => {
    const {
      dueTemplates,
      upcomingTemplates,
      pausedTemplates,
      missedOccurrences,
      todayCompletedCompletions,
    } = getHistoryGroups();
    return {
      total: filteredCompletions.length,
      completed: todayCompletedCompletions.length,
      due: dueTemplates.length,
      missed: missedOccurrences.length,
      upcoming: upcomingTemplates.length,
      paused: pausedTemplates.length,
    };
  }, [filteredCompletions, liveNow, filteredTemplates]);

  function getHistoryGroups() {
    const dueTemplates: SOPTemplate[] = [];
    const upcomingTemplates: SOPTemplate[] = [];
    const pausedTemplates: SOPTemplate[] = [];
    const missedOccurrences: MissedOccurrence[] = [];
    const todayCompletedCompletions: SOPCompletion[] = [];
    const allCompletedCompletions: SOPCompletion[] = [];

    for (const t of filteredTemplates) {
      if (!t.is_running) {
        pausedTemplates.push(t);
        continue;
      }
      const lastDone = t.completions
        .filter((c) => c.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.completed_at || b.completion_date || 0).getTime() -
            new Date(a.completed_at || a.completion_date || 0).getTime(),
        )[0];
      const ds = computeDueStatus(
        t.frequency,
        lastDone?.completion_date ?? null,
        t.start_time,
        t.end_time,
        lastDone?.completed_at ?? null,
        t,
        t.completions,
        liveNow,
      );
      if (ds.due) dueTemplates.push(t);
      else if (ds.status === "upcoming") upcomingTemplates.push(t);

      // Calculate specific gaps
      const gaps = getTemplateGaps(t, t.completions || [], liveNow, 7);
      missedOccurrences.push(...gaps);
    }

    // All completed completions + today's completed
    const liveIst = getISTDateParts(liveNow);
    const todayStr = liveIst.isoDate;
    const yesterdayDate = new Date(liveNow.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayIst = getISTDateParts(yesterdayDate);
    const yesterdayStr = yesterdayIst.isoDate;

    filteredCompletions.forEach((c) => {
      if (c.status === "completed") {
        allCompletedCompletions.push(c);

        // Find template for this completion
        const template = filteredTemplates.find((t) => t.id === c.template_id);
        if (template && template.start_time && template.end_time) {
          const [sh] = template.start_time.slice(0, 5).split(":").map(Number);
          const [eh] = template.end_time.slice(0, 5).split(":").map(Number);
          const isOvernight =
            eh * 60 + (parseInt(template.end_time.slice(3, 5)) || 0) <=
            sh * 60 + (parseInt(template.start_time.slice(3, 5)) || 0);

          if (isOvernight) {
            // For overnight shifts, if completed_at is in early morning, its logical date is yesterday
            const compAt = new Date(c.completed_at || c.created_at);
            const compMins = compAt.getHours() * 60 + compAt.getMinutes();
            const ehMins =
              eh * 60 + (parseInt(template.end_time.slice(3, 5)) || 0);

            const logicalDate =
              compMins < ehMins ? yesterdayStr : c.completion_date;
            const currentLogicalToday =
              liveNow.getHours() * 60 + liveNow.getMinutes() < ehMins
                ? yesterdayStr
                : todayStr;

            if (logicalDate === currentLogicalToday) {
              todayCompletedCompletions.push(c);
            }
          } else {
            if (c.completion_date === todayStr) {
              todayCompletedCompletions.push(c);
            }
          }
        } else if (c.completion_date === todayStr) {
          todayCompletedCompletions.push(c);
        }
      }
    });

    // Sort completed by most recent first
    allCompletedCompletions.sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime(),
    );

    return {
      dueTemplates,
      upcomingTemplates,
      pausedTemplates,
      missedOccurrences,
      todayCompletedCompletions,
      allCompletedCompletions,
    };
  }

  const historyCounts = useMemo(() => {
    const { dueTemplates, missedOccurrences, allCompletedCompletions } = getHistoryGroups();
    return {
      all: dueTemplates.length + missedOccurrences.length + allCompletedCompletions.length,
      due: dueTemplates.length,
      missed: missedOccurrences.length,
      completed: allCompletedCompletions.length,
    };
  }, [filteredCompletions, liveNow, filteredTemplates, templates]);

  const filteredHistoryList = useMemo((): HistoryItem[] => {
    const {
      dueTemplates,
      upcomingTemplates,
      pausedTemplates,
      missedOccurrences,
      allCompletedCompletions,
    } = getHistoryGroups();
    const liveIst = getISTDateParts(liveNow);
    const todayStr = liveIst.isoDate;

    const getCompletionDate = (c: SOPCompletion) => {
      const template = templates.find((t) => t.id === c.template_id);
      if (!template || !template.start_time || !template.end_time) return c.completion_date || "";
      const [sh] = template.start_time.split(":").map(Number);
      const [eh] = template.end_time.split(":").map(Number);
      const isOvernight = eh * 60 + (parseInt(template.end_time.slice(3,5))||0) <= sh * 60 + (parseInt(template.start_time.slice(3,5))||0);
      if (isOvernight) {
         const compAt = new Date(c.completed_at || c.created_at);
         const compMins = compAt.getHours() * 60 + compAt.getMinutes();
         const ehMins = eh * 60 + (parseInt(template.end_time.slice(3,5))||0);
         if (compMins < ehMins) {
           const yesterday = new Date(compAt.getTime() - 24 * 60 * 60 * 1000);
           return getISTDateParts(yesterday).isoDate;
         }
      }
      return c.completion_date || "";
    };

    const getTemplateLogicalToday = (t: SOPTemplate) => {
      if (!t.start_time || !t.end_time) return todayStr;
      const [sh] = t.start_time.split(":").map(Number);
      const [eh] = t.end_time.split(":").map(Number);
      const isOvernight = eh * 60 + (parseInt(t.end_time.slice(3,5))||0) <= sh * 60 + (parseInt(t.start_time.slice(3,5))||0);
      if (isOvernight) {
         const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
         const ehMins = eh * 60 + (parseInt(t.end_time.slice(3,5))||0);
         if (nowMins < ehMins) {
           const yesterday = new Date(liveNow.getTime() - 24 * 60 * 60 * 1000);
           return getISTDateParts(yesterday).isoDate;
         }
      }
      return todayStr;
    };

    const rawItems: { item: HistoryItem; date: string; ts: number }[] = [];

    if (historyFilter === "due" || historyFilter === "all") {
      dueTemplates.forEach((t) => {
        rawItems.push({ item: { type: "template", data: t }, date: getTemplateLogicalToday(t), ts: liveNow.getTime() });
      });
    }
    if (historyFilter === "missed" || historyFilter === "all") {
      missedOccurrences.forEach((m) => {
        rawItems.push({ item: { type: "missed_occurrence", data: m }, date: m.date, ts: new Date(m.date).getTime() });
      });
    }
    if (historyFilter === "completed" || historyFilter === "all") {
      allCompletedCompletions.forEach((c) => {
        rawItems.push({ item: { type: "completion", data: c }, date: getCompletionDate(c), ts: new Date(c.completed_at || c.created_at).getTime() });
      });
    }

    rawItems.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.ts - a.ts;
    });

    const items: HistoryItem[] = [];
    let lastDate = "";
    rawItems.forEach((r) => {
      if (r.date !== lastDate) {
        items.push({ type: "date_header", date: r.date });
        lastDate = r.date;
      }
      items.push(r.item);
    });

    return items;
  }, [
    historyFilter,
    filteredCompletions,
    liveNow,
    filteredTemplates,
    templates,
  ]);

  // ── Live clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setLiveNow(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const fetchTemplates = fetchAll;

  // ── Realtime setup stub ────────────────────────────────────────────────────
  const setupRealtime = (_completionId: string) => {
    // Realtime subscriptions disabled for preview build
    realtimeChannel.current = null;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleCancelRunner = () => {
    realtimeChannel.current = null;
    setActiveTemplate(null);
    setActiveCompletion(null);
    setItemStates({});
    setAdminUnlocked(false);
    setView("history");
    refetch();
  };

  const handleToggleExpand = async (template: SOPTemplate) => {
    if (expandedTemplateId === template.id) {
      setExpandedTemplateId(null);
      return;
    }
    setExpandedTemplateId(template.id);
    if (expandedCompletions[template.id]) return;
    try {
      const res = await checklistService.fetchTemplateCompletions(propertyId as string, template.id, 20);
      setExpandedCompletions((prev) => ({
        ...prev,
        [template.id]: (res.completions || []) as SOPCompletion[],
      }));
    } catch {}
  };

  const handleStartChecklist = async (
    template: SOPTemplate,
    existingCompletion?: SOPCompletion,
    backfillDate?: string,
    backfillSlot?: string,
  ) => {
    const now = new Date();
    if (existingCompletion && existingCompletion.status !== "completed") {
      // Resume
      setActiveTemplate(template);
      setActiveCompletion(existingCompletion);
      initItemStates(template, existingCompletion);
      setupRealtime(existingCompletion.id);
      setView("runner");
      return;
    }

    // Time window check (only for non-backfill)
    if (!backfillDate) {
      const nowMins = now.getHours() * 60 + now.getMinutes();
      if (!isAdmin && template.start_time && template.end_time) {
        if (
          !isWithinTimeWindow(nowMins, template.start_time, template.end_time)
        ) {
          Alert.alert(
            "Window Closed",
            "This checklist is not available right now.",
          );
          return;
        }
      }
    }

    try {
      const isOvernight =
        template.start_time &&
        template.end_time &&
        parseInt(template.end_time.split(":")[0]) * 60 +
          parseInt(template.end_time.split(":")[1]) <=
          parseInt(template.start_time.split(":")[0]) * 60 +
            parseInt(template.start_time.split(":")[1]);

      const nowIst = getISTDateParts(now);
      let logicalDateStr = backfillDate || nowIst.isoDate;
      if (!backfillDate && isOvernight) {
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const endMins =
          parseInt(template.end_time!.split(":")[0]) * 60 +
          parseInt(template.end_time!.split(":")[1]);
        if (nowMins < endMins) {
          // If starting in the morning portion of an overnight shift, it belongs to logically "yesterday"
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const yesterdayIst = getISTDateParts(yesterday);
          logicalDateStr = yesterdayIst.isoDate;
        }
      }

      const slotTime =
        backfillSlot ||
        computeSlotTime(
          template.frequency,
          template.start_time,
          template.end_time,
          now,
        );

      let fullCompletion: SOPCompletion;
      try {
        const res = await checklistService.startCompletion({
          template_id: template.id,
          property_id: propertyId,
          organization_id: template.organization_id || orgId,
          completed_by: user?.id,
          status: "in_progress",
          completion_date: logicalDateStr,
          slot_time: slotTime || null,
        });
        fullCompletion = (res.completion || {}) as SOPCompletion;
      } catch (err: any) {
        Alert.alert("Error", err.message || "Failed to start checklist");
        setIsStarting(false);
        return;
      }

      setActiveTemplate(template);
      setActiveCompletion(fullCompletion);
      initItemStates(template, fullCompletion);
      setupRealtime(fullCompletion.id);
      setView("runner");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to start checklist");
    } finally {
      setIsStarting(false);
    }
  };

  // Auto-start a checklist scanned from the QR scanner
  useEffect(() => {
    if (!startTemplateId || !templates.length || isStarting) return;
    const template = templates.find((t) => t.id === startTemplateId);
    if (!template) return;
    // Clear the deep-link param so it doesn't re-trigger
    router.setParams({ startTemplateId: undefined });
    handleStartChecklist(template);
  }, [startTemplateId, templates, isStarting]);

  const initItemStates = (template: SOPTemplate, completion: SOPCompletion) => {
    const states: Record<
      string,
      {
        checked: boolean;
        photo?: string;
        video?: string;
        value?: string;
        comment?: string;
      }
    > = {};
    template.items.forEach((item) => {
      const compItem = completion.items?.find(
        (ci) => ci.checklist_item_id === item.id,
      );
      states[item.id] = {
        checked: compItem?.is_checked || false,
        photo: compItem?.photo_url,
        video: compItem?.video_url,
        value: compItem?.value,
        comment: compItem?.comment,
      };
    });
    setItemStates(states);
  };

  const toggleItem = async (item: ChecklistItem) => {
    const current = itemStates[item.id]?.checked || false;
    const newChecked = !current;
    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], checked: newChecked },
    }));
    try {
      if (!activeCompletion) return;
      const compItem = activeCompletion.items?.find(
        (ci) => ci.checklist_item_id === item.id,
      );
      if (compItem) {
        const updates: any = {
          is_checked: newChecked,
          ...(newChecked
            ? { checked_at: new Date().toISOString(), checked_by: user?.id }
            : {}),
        };
        await checklistService.updateCompletion(activeCompletion.id, {
          item: {
            completionItemId: compItem.id,
            checklist_item_id: item.id,
            ...updates,
          },
        });
      }
    } catch {
      setItemStates((prev) => ({
        ...prev,
        [item.id]: { ...prev[item.id], checked: current },
      }));
    }
  };

  const handleItemComment = async (item: ChecklistItem, comment: string) => {
    if (!activeCompletion) return;
    const compItem = activeCompletion.items?.find(
      (ci) => ci.checklist_item_id === item.id,
    );
    if (!compItem) return;
    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], comment },
    }));
    try {
      await checklistService.updateCompletion(activeCompletion.id, {
        item: { completionItemId: compItem.id, checklist_item_id: item.id, comment },
      });
    } catch {}
  };

  const handleItemValue = async (item: ChecklistItem, value: string) => {
    if (!activeCompletion) return;
    const compItem = activeCompletion.items?.find(
      (ci) => ci.checklist_item_id === item.id,
    );
    if (!compItem) return;
    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], value },
    }));
    try {
      await checklistService.updateCompletion(activeCompletion.id, {
        item: { completionItemId: compItem.id, checklist_item_id: item.id, value },
      });
    } catch {}
  };

  const handlePhotoCapture = async (item: ChecklistItem) => {
    const isGranted = await requestCameraPermissionWithSettings();
    if (!isGranted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadMedia(item, result.assets[0].uri, "photo");
    }
  };

  const handleVideoCapture = async (item: ChecklistItem) => {
    const isGranted = await requestCameraPermissionWithSettings();
    if (!isGranted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      quality: 0.8,
      videoMaxDuration: 15,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadMedia(item, result.assets[0].uri, "video");
    }
  };

  const handleGallerySelect = async (item: ChecklistItem) => {
    const isGranted = await requestMediaLibraryPermissionWithSettings();
    if (!isGranted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const type = result.assets[0].type === "video" ? "video" : "photo";
      await uploadMedia(item, result.assets[0].uri, type);
    }
  };

  const uploadMedia = async (
    item: ChecklistItem,
    uri: string,
    type: "photo" | "video",
  ) => {
    const stateKey = type === "photo" ? "photoUploading" : "videoUploading";

    if (!activeCompletion || !propertyId) {
      Alert.alert("Error", "Missing completion or property data.");
      return;
    }

    const compItem = activeCompletion?.items?.find(
      (ci) => ci.checklist_item_id === item.id,
    );
    if (!compItem) {
      Alert.alert("Error", "Completion item not found.");
      return;
    }

    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], [stateKey]: true },
    }));

    try {
      const isPhoto = type === "photo";
      let uploadUri = uri;
      let finalType = isPhoto ? "image/jpeg" : "video/mp4";
      const ext = isPhoto ? "jpg" : "mp4";
      let fileName = `${item.id}-${Date.now()}.${ext}`;

      if (isPhoto) {
        try {
          uploadUri = await processAndStampImage(uri);
          finalType = "image/webp";
          fileName = fileName.replace(".jpg", ".webp");
        } catch (e) {
          console.error("Failed to stamp image:", e);
        }
      }

      const formData = new FormData();
      formData.append("file", {
        uri: uploadUri,
        name: fileName,
        type: finalType,
      } as any);
      formData.append("propertyId", propertyId as string);
      formData.append("completionId", activeCompletion.id);
      formData.append("itemId", item.id);
      formData.append("type", type);

      const res = await checklistService.uploadMedia(formData);
      const publicUrl = res.url;
      const checkedAt = new Date().toISOString();

      const updateData: any = { checked_at: checkedAt };
      if (type === "photo") updateData.photo_url = publicUrl;
      else updateData.video_url = publicUrl;

      await checklistService.updateCompletion(activeCompletion.id, {
        item: {
          completionItemId: compItem.id,
          checklist_item_id: item.id,
          ...updateData,
        } as any,
      });

      setItemStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          [type === "photo" ? "photo" : "video"]: publicUrl,
          [stateKey]: false,
        },
      }));

      setActiveCompletion((prev) => {
        if (!prev) return prev;
        const newItems = prev.items.map((ci) => {
          if (ci.id === compItem.id) return { ...ci, ...updateData };
          return ci;
        });
        return { ...prev, items: newItems };
      });
    } catch (err: any) {
      setItemStates((prev) => ({
        ...prev,
        [item.id]: { ...prev[item.id], [stateKey]: false },
      }));
      Alert.alert("Upload Failed", err.message || "Failed to upload media");
    }
  };

  const handleRemoveMedia = async (
    item: ChecklistItem,
    type: "photo" | "video",
  ) => {
    const bucket = type === "photo" ? "sop_photos" : "sop_videos";
    Alert.alert("Remove Media", `Delete this ${type}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const compItem = activeCompletion?.items?.find(
              (ci) => ci.checklist_item_id === item.id,
            );
            if (!compItem) return;

            const updateData: any = {};
            if (type === "photo") updateData.photo_url = null;
            else updateData.video_url = null;

            if (activeCompletion) {
              await checklistService.updateCompletion(activeCompletion.id, {
                item: { completionItemId: compItem.id, ...updateData },
              });
            }

            // Delete from storage via server API
            const mediaUrl = type === "photo" ? compItem.photo_url : compItem.video_url;
            if (mediaUrl) {
              await checklistService.deleteMedia(type, mediaUrl, activeCompletion?.id);
            }

            setItemStates((prev) => ({
              ...prev,
              [item.id]: {
                ...prev[item.id],
                [type === "photo" ? "photo" : "video"]: undefined,
              },
            }));
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to remove media");
          }
        },
      },
    ]);
  };

  const handleCompleteChecklist = async () => {
    if (!activeCompletion || !activeTemplate) return;
    const mandatoryItems = activeTemplate.items.filter(
      (item) => !item.is_optional,
    );
    const unchecked = mandatoryItems.filter((item) => {
      const type = item.type as ItemType;
      if (type === "text" || type === "number")
        return !itemStates[item.id]?.value?.trim();
      if (type === "yes_no") return !itemStates[item.id]?.value;
      return !itemStates[item.id]?.checked;
    });
    if (unchecked.length > 0) {
      Alert.alert(
        "Incomplete",
        `${unchecked.length} mandatory item(s) not completed.`,
      );
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      let isLate = false;
      if (activeTemplate.start_time && activeTemplate.end_time) {
        isLate = !isWithinTimeWindow(
          nowMins,
          activeTemplate.start_time,
          activeTemplate.end_time,
        );
      }
      if (!isLate) {
        const hourlyMatch = activeTemplate.frequency.match(/^every_(\d+)_hours?$/);
        if (hourlyMatch) {
          const intervalH = parseInt(hourlyMatch[1]);
          const slotStart = activeCompletion.slot_time || activeCompletion.created_at;
          if (slotStart) {
            const d = activeCompletion.slot_time
              ? new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  now.getDate(),
                  parseInt(activeCompletion.slot_time.split(":")[0]),
                  parseInt(activeCompletion.slot_time.split(":")[1]),
                  0,
                  0,
                )
              : new Date(activeCompletion.created_at);
            const slotEnd = new Date(d.getTime() + intervalH * 3_600_000);
            if (now.getTime() > slotEnd.getTime()) isLate = true;
          }
        }
      }

      await checklistService.updateCompletion(activeCompletion!.id, {
        status: "completed",
        completed_at: now.toISOString(),
        is_late: isLate,
      });
      realtimeChannel.current = null;
      setActiveTemplate(null);
      setActiveCompletion(null);
      setItemStates({});
      setAdminUnlocked(false);
      Alert.alert("Success", "Checklist submitted!");
      setView("history");
      fetchAll();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit checklist");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Template CRUD ───────────────────────────────────────────────────────────
  const resetTemplateForm = () => {
    setTplTitle("");
    setTplDesc("");
    setTplCategory("general");
    setTplFrequency("daily");
    setTplStartTime("");
    setTplEndTime("");
    setTplAssignedTo([]);
    setTplItems([]);
    setEditingTemplate(null);
  };

  const openEditTemplate = (template: SOPTemplate) => {
    setTplTitle(template.title);
    setTplDesc(template.description || "");
    setTplCategory(template.category || "general");
    setTplFrequency(template.frequency as Frequency);
    setTplStartTime(template.start_time || "");
    setTplEndTime(template.end_time || "");
    setTplAssignedTo(template.assigned_to || []);
    setTplItems(
      template.items.map((item) => ({
        title: item.title,
        description: item.description || "",
        type: (item.type || "checkbox") as ItemType,
        requires_photo: item.requires_photo,
        requires_comment: item.requires_comment,
        is_optional: item.is_optional,
        section_title: item.section_title || "",
        start_time: item.start_time || "",
        end_time: item.end_time || "",
      })),
    );
    setEditingTemplate(template);
    setShowCreateTemplate(true);
  };

  const handleCreateTemplate = async () => {
    if (!tplTitle.trim() || !propertyId) {
      Alert.alert("Error", "Template name is required");
      return;
    }
    if (tplItems.length === 0) {
      Alert.alert("Error", "Add at least one checklist item");
      return;
    }
    if (!orgId) {
      Alert.alert("Error", "Organization not found.");
      return;
    }
    setIsSaving(true);
    try {
      const sectionIndexMap: Record<string, number> = {};
      let sectionOrder = 0;
      const items = tplItems.map((item, idx) => {
        if (item.section_title && !sectionIndexMap[item.section_title])
          sectionIndexMap[item.section_title] = sectionOrder++;
        return {
          title: item.title.trim(),
          description: item.description.trim() || null,
          type: item.type,
          requires_photo: item.requires_photo,
          requires_comment: item.requires_comment,
          is_optional: item.is_optional,
          order_index: item.section_title
            ? sectionIndexMap[item.section_title] * 100 + idx
            : idx,
          start_time: item.start_time || null,
          end_time: item.end_time || null,
        };
      });

      if (editingTemplate) {
        // Update existing template via API
        await checklistService.updateTemplate(editingTemplate.id, {
          title: tplTitle.trim(),
          description: tplDesc.trim() || null,
          category: tplCategory,
          frequency: tplFrequency,
          assigned_to: tplAssignedTo.length > 0 ? tplAssignedTo : [],
          start_time: tplStartTime || null,
          end_time: tplEndTime || null,
          items,
        });
      } else {
        // Create new template via API
        await checklistService.createTemplate({
          property_id: propertyId,
          organization_id: orgId,
          title: tplTitle.trim(),
          description: tplDesc.trim() || null,
          category: tplCategory,
          frequency: tplFrequency,
          assigned_to: tplAssignedTo.length > 0 ? tplAssignedTo : [],
          is_running: true,
          is_active: true,
          start_time: tplStartTime || null,
          end_time: tplEndTime || null,
          items,
        });
      }

      setShowCreateTemplate(false);
      resetTemplateForm();
      await fetchTemplates();
      Alert.alert(
        "Success",
        editingTemplate ? "Template updated" : "Template created",
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: SOPTemplate) => {
    Alert.alert(
      "Delete Template",
      `Delete "${template.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await checklistService.updateTemplate(template.id, {
                is_active: false,
              });
              await fetchTemplates();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  };

  const handleToggleRunning = async (template: SOPTemplate) => {
    if (!template.is_running) {
      Alert.alert("Start Schedule", "Resume this checklist schedule?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start",
          onPress: async () => {
            try {
              await checklistService.updateTemplate(template.id, {
                is_running: true,
              });
              await fetchTemplates();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ]);
    } else {
      Alert.alert(
        "Pause Schedule",
        "Pause this checklist schedule? It will remain saved but recurring will stop.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Pause",
            onPress: async () => {
              try {
                await checklistService.updateTemplate(template.id, {
                  is_running: false,
                });
                await fetchTemplates();
              } catch (err: any) {
                Alert.alert("Error", err.message);
              }
            },
          },
        ],
      );
    }
  };

  const addTemplateItem = () => {
    setTplItems((prev) => [
      ...prev,
      {
        title: "",
        description: "",
        type: "checkbox",
        requires_photo: false,
        requires_comment: false,
        is_optional: false,
        section_title: "",
        start_time: "",
        end_time: "",
      },
    ]);
  };

  const removeTemplateItem = (idx: number) => {
    setTplItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTplItem = (idx: number, field: string, value: any) => {
    setTplItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  // ── Runner computed ──────────────────────────────────────────────────────────
  const runnerWindowClosed = useMemo(() => {
    if (!activeTemplate?.end_time) return false;
    const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
    return !isWithinTimeWindow(
      nowMins,
      activeTemplate.start_time || "00:00",
      activeTemplate.end_time,
    );
  }, [activeTemplate, liveNow]);

  const runnerSlotOverdue = useMemo(() => {
    if (!activeTemplate || runnerWindowClosed) return false;
    const hourlyMatch = activeTemplate.frequency.match(/^every_(\d+)_hours?$/);
    if (!hourlyMatch) return false;
    const intervalH = parseInt(hourlyMatch[1]);
    const slotStart =
      activeCompletion?.slot_time || activeCompletion?.created_at;
    if (!slotStart) return false;
    const d = activeCompletion?.slot_time
      ? new Date(
          liveNow.getFullYear(),
          liveNow.getMonth(),
          liveNow.getDate(),
          parseInt(activeCompletion.slot_time.split(":")[0]),
          parseInt(activeCompletion.slot_time.split(":")[1]),
          0,
          0,
        )
      : new Date(activeCompletion?.created_at || Date.now());
    const slotEnd = new Date(d.getTime() + intervalH * 3_600_000);
    return liveNow.getTime() > slotEnd.getTime();
  }, [activeTemplate, activeCompletion, liveNow, runnerWindowClosed]);

  const runnerIsReadOnly = activeCompletion?.status === "completed";

  const runnerCheckedCount = useMemo(() => {
    if (!activeCompletion || !activeTemplate) return 0;
    return activeTemplate.items.filter((item) => {
      const state = itemStates[item.id];
      if (item.type === "text" || item.type === "number")
        return !!state?.value?.trim();
      if (item.type === "yes_no") return !!state?.value;
      return !!state?.checked;
    }).length;
  }, [activeCompletion, activeTemplate, itemStates]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  // ── Runner View ──
  if (view === "runner" && activeTemplate) {
    const totalItems = activeTemplate.items.length;
    const progress = totalItems > 0 ? runnerCheckedCount / totalItems : 0;

    // Group by section
    const sections: Record<string, ChecklistItem[]> = {};
    [...activeTemplate.items]
      .sort((a, b) => {
        const aSection = a.section_title || "zzz";
        const bSection = b.section_title || "zzz";
        if (aSection !== bSection) return aSection.localeCompare(bSection);
        return (a.order_index || 0) - (b.order_index || 0);
      })
      .forEach((item) => {
        const sec = item.section_title || "General";
        if (!sections[sec]) sections[sec] = [];
        sections[sec].push(item);
      });
    const sectionKeys = Object.keys(sections);

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          {/* Header */}
          <View
            style={[
              runnerStyles.header,
              {
                backgroundColor: colors.primary,
                paddingTop: Math.max(insets.top, 16),
                borderBottomWidth: 0,
              },
            ]}
          >
            <View style={[runnerStyles.headerRow, { justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 }]}>
              <TouchableOpacity
                style={{ padding: 4 }}
                onPress={handleCancelRunner}
              >
                <ArrowLeft size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 16 }}>
                <Text style={{ fontSize: 18, fontFamily: "Urbanist-Bold", color: "#FFFFFF" }} numberOfLines={1}>
                  {activeTemplate.title}
                </Text>
                {activeCompletion?.completion_date !==
                  getISTDateParts(new Date()).isoDate && (
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#FBBF24",
                      fontFamily: "Urbanist-Bold",
                    }}
                  >
                    BACKFILLING FOR {activeCompletion?.completion_date}{" "}
                    {activeCompletion?.slot_time
                      ? `(${getSlotWindow(activeCompletion.slot_time, activeTemplate.frequency) || fmt12h(activeCompletion.slot_time)})`
                      : ""}
                  </Text>
                )}
                {activeTemplate.description && (
                  <Text style={{ fontSize: 12, fontFamily: "Urbanist-Medium", color: "rgba(255,255,255,0.7)" }} numberOfLines={1}>
                    {activeTemplate.description}
                  </Text>
                )}
              </View>
              {isAdmin &&
                (activeCompletion?.status === "completed" ||
                  runnerWindowClosed) ? (
                  <TouchableOpacity
                    style={{ padding: 4 }}
                    onPress={() => setAdminUnlocked((v) => !v)}
                  >
                    <Lock
                      size={18}
                      color={
                        adminUnlocked ? "#FBBF24" : "rgba(255,255,255,0.7)"
                      }
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 28 }} /> // Placeholder for balance
                )}
            </View>

            {/* Meta bar */}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} color="rgba(255,255,255,0.8)" />
                <Text style={{ fontSize: 11, fontFamily: "Urbanist-Bold", color: "rgba(255,255,255,0.8)", textTransform: "uppercase" }}>
                  {activeCompletion?.completion_date
                    ? new Date(
                        activeCompletion.completion_date,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : new Date().toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                </Text>
              </View>
              {(activeTemplate.start_time || activeTemplate.end_time) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={{ fontSize: 11, fontFamily: "Urbanist-Bold", color: "rgba(255,255,255,0.8)", textTransform: "uppercase" }}>
                    {parseHourlyInterval(activeTemplate.frequency) 
                      ? getCompletionSlot(
                          activeCompletion?.created_at || new Date().toISOString(), 
                          activeTemplate.frequency, 
                          activeTemplate.start_time, 
                          activeCompletion?.slot_time
                        ) 
                      : `${fmt12h(activeTemplate.start_time)} – ${fmt12h(activeTemplate.end_time)}`
                    }
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
                <Repeat size={14} color="rgba(255,255,255,0.8)" />
                <Text style={{ fontSize: 11, fontFamily: "Urbanist-Bold", color: "rgba(255,255,255,0.8)", textTransform: "uppercase" }}>
                  {activeTemplate.frequency}
                </Text>
              </View>
            </View>

            {/* Progress */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: "rgba(255,255,255,0.8)", letterSpacing: 1 }}>
                  COMPLETION
                </Text>
                <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: "rgba(255,255,255,0.8)" }}>
                  {Math.round(progress * 100)}% — {runnerCheckedCount}/{totalItems} PTS
                </Text>
              </View>
              <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: "#4ADE80", borderRadius: 2 }} />
              </View>
            </View>
          </View>

          {/* Status Banner */}
          {false && adminUnlocked && (
            <View style={runnerStyles.bannerAmber}>
              <Lock size={12} color="#B45309" />
              <Text style={runnerStyles.bannerAmberText}>
                Admin Override Active — Edits are allowed
              </Text>
            </View>
          )}
          {false && runnerWindowClosed && !adminUnlocked && (
            <View style={runnerStyles.bannerRed}>
              <Lock size={12} color="#B91C1C" />
              <Text style={runnerStyles.bannerRedText}>
                Time Window Closed — Read-only
              </Text>
            </View>
          )}
          {false &&
            runnerSlotOverdue &&
            !runnerWindowClosed &&
            !adminUnlocked && (
              <View style={runnerStyles.bannerAmber}>
                <Lock size={12} color="#B45309" />
                <Text style={runnerStyles.bannerAmberText}>
                  Overdue — Submit Now
                </Text>
              </View>
            )}
          {activeCompletion?.status === "completed" && (
            <View
              style={[
                runnerStyles.bannerGreen,
                {
                  backgroundColor: (activeCompletion as any).is_late
                    ? "#FEF3C7"
                    : "#D1FAE5",
                },
              ]}
            >
              <CheckCircle2
                size={12}
                color={
                  (activeCompletion as any).is_late ? "#D97706" : "#059669"
                }
              />
              <Text
                style={[
                  runnerStyles.bannerGreenText,
                  {
                    color: (activeCompletion as any).is_late
                      ? "#B45309"
                      : "#065F46",
                  },
                ]}
              >
                {(activeCompletion as any).is_late
                  ? "Completed Late"
                  : "Checklist Completed"}
              </Text>
            </View>
          )}

          {/* Items */}
          <FlashList
            style={{ flex: 1 }}
            data={sectionKeys}
            keyExtractor={(s) => s}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 120,
            }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={180}
            ListFooterComponent={
              <View style={{ marginTop: 16, marginBottom: 32, gap: 12 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: "#64748B",
                    borderRadius: 24,
                    opacity: runnerIsReadOnly || runnerCheckedCount === 0 ? 0.5 : 1,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    paddingVertical: 14,
                  }}
                  onPress={handleCompleteChecklist}
                  disabled={runnerIsReadOnly || runnerCheckedCount === 0 || isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 12, fontFamily: "Urbanist-Bold", color: "#FFFFFF", textTransform: 'uppercase', letterSpacing: 1, marginRight: 8 }}>
                        {runnerIsReadOnly ? "READ ONLY" : `${runnerCheckedCount}/${totalItems} DONE`}
                      </Text>
                      {!runnerIsReadOnly && <ChevronRight size={14} color="#FFFFFF" strokeWidth={3} />}
                    </>
                  )}
                </TouchableOpacity>
                
                {!runnerIsReadOnly && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: "transparent",
                      borderRadius: 24,
                      borderWidth: 1,
                      borderColor: colors.border,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      paddingVertical: 14,
                    }}
                    onPress={() => setView("history")}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Urbanist-Bold", color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      SAVE FOR LATER
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            }
            renderItem={({ item: section }) => (
              <View style={{ marginBottom: 16 }}>
                {section !== "General" && (
                  <View style={{ backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 16, borderLeftWidth: 4, borderLeftColor: "#64748B", marginBottom: 16, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Urbanist-Bold", color: "#64748B", textTransform: 'uppercase', letterSpacing: 1 }}>{section}</Text>
                  </View>
                )}
                {sections[section].map((checkItem, index) => {
                  const state = itemStates[checkItem.id] || { checked: false };
                  const itemType = checkItem.type as ItemType;
                  const isOptional = checkItem.is_optional;

                  return (
                    <View
                      key={checkItem.id}
                      style={{
                        backgroundColor: "transparent",
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        paddingBottom: 24,
                        marginBottom: 16,
                      }}
                    >
                      {/* Item row */}
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'flex-start' }}
                        onPress={() =>
                          itemType === "checkbox"
                            ? toggleItem(checkItem)
                            : null
                        }
                        disabled={runnerIsReadOnly}
                        activeOpacity={0.7}
                      >
                        {itemType === "checkbox" ? (
                          <View
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              borderWidth: state.checked ? 0 : 1,
                              borderColor: colors.border,
                              justifyContent: 'center',
                              alignItems: 'center',
                              marginTop: 2,
                            }}
                          >
                            {state.checked ? (
                              <CheckCircle2 size={24} color={colors.success} strokeWidth={2.5} />
                            ) : (
                              <Circle size={24} color={colors.border} strokeWidth={1.5} />
                            )}
                          </View>
                        ) : (
                          <View
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: colors.border,
                              justifyContent: 'center',
                              alignItems: 'center',
                              marginTop: 2,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontFamily: "Urbanist-Bold",
                                color: colors.textTertiary,
                              }}
                            >
                              {index + 1}
                            </Text>
                          </View>
                        )}
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 16,
                              fontFamily: "Urbanist-Bold",
                              color: state.checked ? colors.textSecondary : colors.text,
                              lineHeight: 22,
                              marginTop: 2,
                            }}
                          >
                            {checkItem.title}
                            {isOptional && (
                              <Text style={{ color: colors.textTertiary, fontSize: 12, fontFamily: "Urbanist-Medium" }}>
                                {" "}
                                (Optional)
                              </Text>
                            )}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Subtitles: MEDIA DOCUMENTATION etc */}
                      <View style={{ marginTop: 12 }}>
                        <Text
                          style={{
                            fontSize: 10,
                            fontFamily: "Urbanist-Bold",
                            color: "#64748B",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                          }}
                        >
                          MEDIA DOCUMENTATION
                        </Text>
                        {checkItem.description ? (
                          <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 4, fontFamily: "Urbanist-Medium" }}>
                            {checkItem.description}
                          </Text>
                        ) : null}
                      </View>

                      {/* Value input */}
                      {(itemType === "text" || itemType === "number") && (
                        <View style={{ marginTop: 12 }}>
                          <TextInput
                            style={{
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              borderWidth: 1,
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              color: colors.text,
                              fontFamily: "Urbanist-Medium",
                              fontSize: 14,
                            }}
                            placeholder={
                              itemType === "number"
                                ? "Enter number..."
                                : "Enter observation..."
                            }
                            placeholderTextColor={colors.textTertiary}
                            keyboardType={
                              itemType === "number" ? "numeric" : "default"
                            }
                            value={state.value || ""}
                            onChangeText={(v) => handleItemValue(checkItem, v)}
                            editable={!runnerIsReadOnly}
                          />
                        </View>
                      )}

                      {/* Yes/No */}
                      {itemType === "yes_no" && (
                        <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
                          {(["yes", "no"] as const).map((opt) => {
                            const isSelected = state.value === opt;
                            const optLabel = opt === "yes" ? "Yes" : "No";
                            return (
                              <TouchableOpacity
                                key={opt}
                                style={{
                                  flex: 1,
                                  paddingVertical: 10,
                                  alignItems: 'center',
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  backgroundColor: isSelected
                                    ? opt === "yes"
                                      ? colors.success + "18"
                                      : colors.error + "18"
                                    : colors.surface,
                                  borderColor: isSelected
                                    ? opt === "yes"
                                      ? colors.success
                                      : colors.error
                                    : colors.border,
                                }}
                                onPress={() => {
                                  if (runnerIsReadOnly) return;
                                  const newValue = opt;
                                  setItemStates((prev) => ({
                                    ...prev,
                                    [checkItem.id]: {
                                      ...prev[checkItem.id],
                                      value: newValue,
                                      checked: true,
                                    },
                                  }));
                                  const compItem =
                                    activeCompletion?.items?.find(
                                      (ci) => ci.checklist_item_id === checkItem.id,
                                    );
                                  if (compItem) {
                                    checklistService.updateCompletion(activeCompletion!.id, {
                                      item: {
                                        completionItemId: compItem.id,
                                        value: newValue,
                                        is_checked: true,
                                        checked_at: new Date().toISOString(),
                                        checked_by: user?.id,
                                      },
                                    });
                                  }
                                }}
                                disabled={runnerIsReadOnly}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontFamily: "Urbanist-Bold",
                                    color: isSelected
                                      ? opt === "yes"
                                        ? colors.success
                                        : colors.error
                                      : colors.textSecondary,
                                  }}
                                >
                                  {optLabel.toUpperCase()}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Comment */}
                      {checkItem.requires_comment && (
                        <View style={{ marginTop: 12 }}>
                          <TextInput
                            style={{
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              borderWidth: 1,
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              color: colors.text,
                              fontFamily: "Urbanist-Medium",
                              fontSize: 14,
                              minHeight: 60,
                            }}
                            placeholder="Add observation..."
                            placeholderTextColor={colors.textTertiary}
                            value={state.comment || ""}
                            onChangeText={(v) => handleItemComment(checkItem, v)}
                            editable={!runnerIsReadOnly}
                            multiline
                          />
                        </View>
                      )}

                      {/* Media Thumbnails and Actions */}
                      <View style={{ marginTop: 16 }}>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: state.photo || state.video ? 10 : 0 }}>
                          {state.photo && (
                            <View style={{ width: 100, height: 75, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                              <Image source={{ uri: state.photo }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                              <View style={{ position: "absolute", bottom: 4, left: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4 }}>
                                <Text style={{ color: "white", fontSize: 7, fontWeight: "bold" }}>PHOTO</Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleRemoveMedia(checkItem, "photo")}
                                style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(239, 68, 68, 0.9)", justifyContent: "center", alignItems: "center" }}
                              >
                                <X size={12} color="white" />
                              </TouchableOpacity>
                            </View>
                          )}
                          {state.video && (
                            <View style={{ width: 100, height: 75, borderRadius: 12, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" }}>
                              <Play size={20} color="white" fill="rgba(255,255,255,0.4)" />
                              <View style={{ position: "absolute", bottom: 4, left: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: colors.primary, borderRadius: 4 }}>
                                <Text style={{ color: "white", fontSize: 7, fontWeight: "bold" }}>VIDEO</Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleRemoveMedia(checkItem, "video")}
                                style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(239, 68, 68, 0.9)", justifyContent: "center", alignItems: "center" }}
                              >
                                <X size={12} color="white" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* Media Action Buttons */}
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => !runnerIsReadOnly && handlePhotoCapture(checkItem)}
                            disabled={runnerIsReadOnly || state.photoUploading}
                            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, backgroundColor: 'transparent', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
                          >
                            {state.photoUploading ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <Camera size={18} color={colors.textTertiary} />}
                            <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>
                              {state.photoUploading ? "UPLOADING..." : "CAPTURE"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => !runnerIsReadOnly && handleGallerySelect(checkItem)}
                            disabled={runnerIsReadOnly || state.photoUploading || state.videoUploading}
                            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, backgroundColor: 'transparent', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
                          >
                            {(state.photoUploading || state.videoUploading) ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <Paperclip size={18} color={colors.textTertiary} />}
                            <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>
                              {(state.photoUploading || state.videoUploading) ? "UPLOADING..." : "GALLERY"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => !runnerIsReadOnly && handleVideoCapture(checkItem)}
                            disabled={runnerIsReadOnly || state.videoUploading}
                            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, backgroundColor: 'transparent', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
                          >
                            {state.videoUploading ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <Film size={18} color={colors.textTertiary} />}
                            <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>
                              {state.videoUploading ? "UPLOADING..." : "15S VIDEO"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          />
        </KeyboardAvoidingView>
        <MediaViewerModal
          visible={!!mediaViewer}
          uri={mediaViewer?.uri || null}
          type={mediaViewer?.type || 'photo'}
          onClose={() => setMediaViewer(null)}
        />
      </View>
    );
  }

  // ── History Detail View ──
  if (view === "detail" && historyCompletion) {
    const template = templates.find(
      (t) => t.id === historyCompletion.template_id,
    );
    const completedAuditItems = (template?.items || []).filter((it) => {
      const ci = historyCompletion.items?.find(
        (c) => c.checklist_item_id === it.id,
      );
      if (!ci) return false;
      if (it.type === "text" || it.type === "number")
        return !!ci.value?.trim();
      if (it.type === "yes_no") return !!ci.value;
      return !!ci.is_checked;
    });
    const auditScore = Math.round(
      (completedAuditItems.length /
        Math.max(template?.items?.length || 1, 1)) *
        100,
    );
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            runnerStyles.header,
            {
              backgroundColor: colors.card,
              paddingTop: Math.max(insets.top, 16),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              paddingBottom: 16,
            },
          ]}
        >
          <View style={[runnerStyles.headerRow, { alignItems: 'flex-start' }]}>
            <TouchableOpacity
              style={[runnerStyles.backBtn, { backgroundColor: 'transparent', width: 'auto', paddingHorizontal: 0, paddingRight: 10, marginTop: 4 }]}
              onPress={() => {
                setHistoryCompletion(null);
                setView("history");
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase' }}>Back</Text>
              </View>
            </TouchableOpacity>
            
            <View style={[runnerStyles.headerTitle, { flex: 1 }]}>
              <Text style={[runnerStyles.headerTitleText, { color: colors.text, fontSize: 18 }]}>
                {template?.title || "Checklist"}
              </Text>
              
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Calendar size={12} color={colors.textSecondary} />
                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "Urbanist-Medium", textTransform: "uppercase" }}>
                    {historyCompletion.completion_date
                      ? new Date(historyCompletion.completion_date).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Unknown"}
                  </Text>
                </View>
                {(() => {
                  const slotRange = getCompletionSlot(
                    historyCompletion.completed_at || historyCompletion.created_at,
                    template?.frequency,
                    template?.start_time,
                    historyCompletion.slot_time,
                  );
                  return slotRange ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "Urbanist-Medium", textTransform: "uppercase" }}>
                        {slotRange}
                      </Text>
                    </View>
                  ) : null;
                })()}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <User size={12} color={colors.textSecondary} />
                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "Urbanist-Medium", textTransform: "uppercase" }}>
                    {(historyCompletion as any).user?.full_name || (historyCompletion as any).completed_by_user?.full_name || "SYSTEM USER"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ alignItems: "flex-end" }}>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: historyCompletion.status === "completed" ? colors.success + "50" : colors.primary + "50",
                  backgroundColor: "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: "Urbanist-Bold",
                    letterSpacing: 0.5,
                    color: historyCompletion.status === "completed" ? colors.success : colors.primary,
                  }}
                >
                  {historyCompletion.status?.replace("_", " ").toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <FlashList
          style={{ flex: 1 }}
          data={(template?.items || []) as any[]}
          keyExtractor={(item) => (item as any).id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 200,
          }}
          estimatedItemSize={180}
          ListHeaderComponent={
            <View style={{ marginBottom: 20 }}>
              {/* Score Section */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Audit Score
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                  <Text style={{ fontSize: 24, fontFamily: "Poppins-Bold", color: colors.text, lineHeight: 28 }}>
                    {auditScore}%
                  </Text>
                  <View style={{ backgroundColor: colors.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Urbanist-Bold", color: colors.textSecondary }}>
                      {completedAuditItems.length}/{template?.items?.length || 0} PTS
                    </Text>
                  </View>
                </View>
                <View style={{ height: 6, backgroundColor: colors.surface, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ 
                    height: '100%', 
                    backgroundColor: colors.success, 
                    borderRadius: 3, 
                    width: `${auditScore}%` 
                  }} />
                </View>
              </View>

              {/* Breakdown Label */}
              <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Audit Breakdown
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const compItem = historyCompletion.items?.find(
              (ci) => ci.checklist_item_id === item.id,
            );
            const itemCompleted = (() => {
              if (!compItem) return false;
              if (item.type === "text" || item.type === "number")
                return !!compItem.value?.trim();
              if (item.type === "yes_no") return !!compItem.value;
              return !!compItem.is_checked;
            })();
            const itemTimestamp = compItem?.checked_at || (historyCompletion as any).completed_at || (historyCompletion as any).created_at;
            return (
              <View
                style={[
                  runnerStyles.itemCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    marginBottom: 16,
                    borderRadius: 16,
                  },
                ]}
              >
                <View style={{ padding: 16 }}>
                  {/* Top row with Check and Title */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', flex: 1, paddingRight: 12 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          borderWidth: itemCompleted ? 2 : 1,
                          borderColor: itemCompleted ? colors.success : colors.border,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginTop: 2,
                        }}
                      >
                        {itemCompleted ? (
                          <CheckCircle2 size={16} color={colors.success} strokeWidth={3} />
                        ) : (
                          <Circle size={14} color={colors.textTertiary} />
                        )}
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontFamily: "Poppins-Bold", lineHeight: 22 }}>
                          {item.title}
                        </Text>
                        
                        {(item.type === "text" || item.type === "number" || item.type === "yes_no") && compItem?.value && (
                          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, fontFamily: "Urbanist-Medium" }}>
                            {compItem.value}
                          </Text>
                        )}
                        {compItem?.comment && (
                          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, fontFamily: "Urbanist-Medium" }}>
                            {compItem.comment}
                          </Text>
                        )}
                        
                        {/* User info inline */}
                        {(compItem?.checked_by_user || compItem?.checked_at) && (
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 12, flexWrap: "wrap" }}>
                            {compItem?.checked_by_user && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <User size={10} color={colors.textSecondary} />
                                <Text style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "Urbanist-Bold", textTransform: "uppercase" }}>
                                  {Array.isArray(compItem.checked_by_user) ? compItem.checked_by_user[0]?.full_name : compItem.checked_by_user?.full_name}
                                </Text>
                              </View>
                            )}
                            {itemTimestamp && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Clock size={10} color={colors.textSecondary} />
                                <Text style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "Urbanist-Bold", textTransform: "uppercase" }}>
                                  {new Date(itemTimestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </View>

                    {!item.is_optional && (
                      <View style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                        <Text style={{ fontSize: 9, fontFamily: "Urbanist-Bold", color: "#EF4444" }}>REQUIRED</Text>
                      </View>
                    )}
                  </View>

                  {/* Photo Proof */}
                  {compItem?.photo_url && (
                    <View style={{ marginTop: 16, marginLeft: 36 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Eye size={12} color={colors.textSecondary} />
                        <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textSecondary, letterSpacing: 0.5 }}>VISUAL PROOF</Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={() => compItem.photo_url && setMediaViewer({ uri: compItem.photo_url, type: 'photo' })}
                      >
                        <View style={{ borderRadius: 12, overflow: 'hidden', height: 180 }}>
                          <Image source={{ uri: compItem.photo_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                          <View style={{ position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Camera size={10} color="#FFF" />
                            <Text style={{ color: "#FFF", fontSize: 10, fontFamily: "Urbanist-Bold" }}>Photo</Text>
                          </View>
                          {itemTimestamp && (
                            <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                              <Text style={{ color: "#FFF", fontSize: 9, fontFamily: "Urbanist-Medium" }}>
                                {new Date(itemTimestamp).toLocaleString("en-US", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                              </Text>
                            </View>
                          )}
                          <View style={{ position: "absolute", top: 8, right: 8, flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => compItem.photo_url && setMediaViewer({ uri: compItem.photo_url, type: 'photo' })}
                              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: 'center', alignItems: 'center' }}
                              activeOpacity={0.7}
                            >
                              <Maximize2 size={14} color="#FFF" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => compItem.photo_url && handleDownloadMedia(compItem.photo_url, 'photo')}
                              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: 'center', alignItems: 'center' }}
                              activeOpacity={0.7}
                            >
                              <Download size={14} color="#FFF" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Video Proof */}
                  {compItem?.video_url && (
                    <View style={{ marginTop: 16, marginLeft: 36 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Eye size={12} color={colors.textSecondary} />
                        <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textSecondary, letterSpacing: 0.5 }}>VIDEO PROOF</Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={() => compItem.video_url && setMediaViewer({ uri: compItem.video_url, type: 'video' })}
                      >
                        <View style={{ borderRadius: 12, overflow: 'hidden', height: 180, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                          <ExpoAV.Video
                            source={{ uri: compItem.video_url }}
                            style={{ position: "absolute", width: "100%", height: "100%" }}
                            resizeMode={ExpoAV.ResizeMode.COVER}
                            shouldPlay={false}
                            isLooping={false}
                            useNativeControls={false}
                          />
                          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: 'center', alignItems: 'center' }}>
                            <Play size={26} color="#FFF" fill="#FFF" />
                          </View>
                          <View style={{ position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Film size={10} color="#FFF" />
                            <Text style={{ color: "#FFF", fontSize: 10, fontFamily: "Urbanist-Bold" }}>Video</Text>
                          </View>
                          {itemTimestamp && (
                            <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                              <Text style={{ color: "#FFF", fontSize: 9, fontFamily: "Urbanist-Medium" }}>
                                {new Date(itemTimestamp).toLocaleString("en-US", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                              </Text>
                            </View>
                          )}
                          <View style={{ position: "absolute", top: 8, right: 8, flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => compItem.video_url && setMediaViewer({ uri: compItem.video_url, type: 'video' })}
                              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: 'center', alignItems: 'center' }}
                              activeOpacity={0.7}
                            >
                              <Maximize2 size={14} color="#FFF" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => compItem.video_url && handleDownloadMedia(compItem.video_url, 'video')}
                              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: 'center', alignItems: 'center' }}
                              activeOpacity={0.7}
                            >
                              <Download size={14} color="#FFF" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}

                  {compItem?.admin_rating && (
                    <View style={{ marginTop: 16, marginLeft: 36 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Star size={12} color={colors.textSecondary} />
                        <Text style={{ fontSize: 10, fontFamily: "Urbanist-Bold", color: colors.textSecondary, letterSpacing: 0.5 }}>RATING</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ 
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                          backgroundColor: compItem.admin_rating === 1 ? "#FEE2E2" : compItem.admin_rating === 2 ? "#FEF3C7" : "#DCFCE7",
                        }}>
                          <Text style={{ 
                            fontSize: 10, fontFamily: "Urbanist-Bold",
                            color: compItem.admin_rating === 1 ? "#EF4444" : compItem.admin_rating === 2 ? "#F59E0B" : "#10B981" 
                          }}>
                            {compItem.admin_rating === 1 ? "NEEDS WORK" : compItem.admin_rating === 2 ? "ACCEPTABLE" : "EXCELLENT"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
        <MediaViewerModal
          visible={!!mediaViewer}
          uri={mediaViewer?.uri || null}
          type={mediaViewer?.type || 'photo'}
          onClose={() => setMediaViewer(null)}
        />
      </View>
    );
  }

  // ── Main View ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top nav */}
      <View style={[styles.topNav, { paddingTop: Math.max(insets.top, 16), borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.navIconBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topNavTitle, { color: colors.text }]}>Checklists</Text>
        <TouchableOpacity
          onPress={() =>
            router.push(`/property/${propertyId}/checklist/scan` as any)
          }
          style={[styles.navIconBtn, { backgroundColor: colors.surface }]}
        >
          <Maximize2 size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : view === "templates" && isAdmin ? (
        <FlashList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 200 }}
          data={filteredTemplates as SOPTemplate[]}
          keyExtractor={(item) => (item as SOPTemplate).id}
          estimatedItemSize={120}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.headerTop}>
                  <View style={styles.headerLeft}>
                    <View style={[styles.headerIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}>
                      <ClipboardList size={18} color={colors.text} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                      {isAdmin ? "Checklist Manager" : "My Checklists"}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        resetTemplateForm();
                        setShowCreateTemplate(true);
                      }}
                    >
                      <Plus size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.viewToggle}>
                  <TouchableOpacity
                    style={[
                      styles.toggleTab,
                      { backgroundColor: colors.surface },
                      view === "history" && [styles.toggleTabActive, { backgroundColor: colors.primary + "20", borderColor: colors.primary }],
                    ]}
                    onPress={() => setView("history")}
                  >
                    <History size={12} color={colors.textSecondary} />
                    <Text style={[styles.toggleTabText, { color: view === "history" ? colors.primary : colors.text }]}>History</Text>
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[
                        styles.toggleTab,
                        { backgroundColor: colors.surface },
                        view === "templates" && [styles.toggleTabActive, { backgroundColor: colors.primary + "20", borderColor: colors.primary }],
                      ]}
                      onPress={() => setView("templates")}
                    >
                      <LayoutGrid size={12} color={colors.textSecondary} />
                      <Text style={[styles.toggleTabText, { color: view === "templates" ? colors.primary : colors.text }]}>Templates</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 80, gap: 12 }}>
              <ClipboardList size={48} color={colors.textTertiary} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>
                No templates yet
              </Text>
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  resetTemplateForm();
                  setShowCreateTemplate(true);
                }}
              >
                <Plus size={14} color="#FFFFFF" />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 12,
                    fontWeight: "700",
                    marginLeft: 6,
                  }}
                >
                  Create Template
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: template }) => {
            const ds = dueStatusMap[template.id];
            const inProgress = template.completions.find(
              (c) => c.status === "in_progress",
            );
            return (
              <View style={{ marginBottom: 12 }}>
                <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.historyCardRow}>
                    <View style={styles.historyCardContent}>
                      <Text style={[styles.historyTitle, { color: colors.text }]}>{template.title}</Text>
                      <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
                        {getFrequencyLabel(template.frequency)}
                        {template.start_time ? ` · ${fmt12h(template.start_time)}` : ""}
                      </Text>
                      <StatusBadge status={!template.is_running ? "paused" : (ds?.status || "upcoming")} label={ds?.label || ""} />
                    </View>
                    <View style={styles.historyCardRight}>
                      <TouchableOpacity
                        style={[styles.startBtn, { marginBottom: 6, backgroundColor: colors.primary }]}
                        onPress={() => handleStartChecklist(template, inProgress)}
                      >
                        <Play size={14} color="#FFFFFF" />
                        <Text style={styles.startBtnText}>
                          {inProgress ? "Resume" : "Start"}
                        </Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => openEditTemplate(template)}
                        >
                          <Edit3 size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleToggleRunning(template)}
                        >
                          {template.is_running ? (
                            <Pause size={16} color={colors.textSecondary} />
                          ) : (
                            <PlayCircle size={16} color={colors.textSecondary} />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteTemplate(template)}
                        >
                          <Trash2 size={16} color={colors.error || colors.warning} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlashList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 200 }}
          data={filteredHistoryList}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          keyExtractor={(item, idx) =>
            item.type === "date_header"
              ? `header-${item.date}`
              : item.type === "missed_occurrence"
              ? `missed-${idx}`
              : item.type === "template"
              ? `tmpl-${item.data.id}`
              : `comp-${item.data.id}`
          }
          estimatedItemSize={120}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.headerTop}>
                  <View style={styles.headerLeft}>
                    <View style={[styles.headerIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}>
                      <ClipboardList size={18} color={colors.text} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                      {isAdmin ? "Checklist Manager" : "My Checklists"}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        resetTemplateForm();
                        setShowCreateTemplate(true);
                      }}
                    >
                      <Plus size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.viewToggle}>
                  <TouchableOpacity
                    style={[
                      styles.toggleTab,
                      { backgroundColor: colors.surface },
                      view === "history" && [styles.toggleTabActive, { backgroundColor: colors.primary + "20", borderColor: colors.primary }],
                    ]}
                    onPress={() => setView("history")}
                  >
                    <History size={12} color={colors.textSecondary} />
                    <Text style={[styles.toggleTabText, { color: view === "history" ? colors.primary : colors.text }]}>History</Text>
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[
                        styles.toggleTab,
                        { backgroundColor: colors.surface },
                        view === "templates" && [styles.toggleTabActive, { backgroundColor: colors.primary + "20", borderColor: colors.primary }],
                      ]}
                      onPress={() => setView("templates")}
                    >
                      <LayoutGrid size={12} color={colors.textSecondary} />
                      <Text style={[styles.toggleTabText, { color: view === "templates" ? colors.primary : colors.text }]}>Templates</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.filterRow}>
                {(
                  [
                    "all",
                    "missed",
                    "due",
                    "completed",
                  ] as HistoryFilter[]
                ).map((f) => {
                  const label = f.charAt(0).toUpperCase() + f.slice(1);
                  const count = historyCounts[f] || 0;
                  const active = historyFilter === f;
                  
                  let themeColor = colors.primary;
                  if (f === 'completed') themeColor = colors.success || '#10B981';
                  if (f === 'missed') themeColor = colors.error || '#EF4444';
                  if (f === 'due') themeColor = colors.warning || '#F59E0B';
                  
                  return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.filterChip,
                      { backgroundColor: active ? themeColor + "18" : colors.surface, borderColor: active ? themeColor : colors.border },
                      { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 }
                    ]}
                    onPress={() => setHistoryFilter(f)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? themeColor : colors.textSecondary },
                        { fontSize: 11, fontFamily: "Urbanist-Bold", letterSpacing: 0.5 }
                      ]}
                    >
                      {label} ({count})
                    </Text>
                  </TouchableOpacity>
                )})}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <History size={48} color={colors.textTertiary} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>
                No records
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.textSecondary,
                  textAlign: "center",
                }}
              >
                {isAdmin
                  ? "Create a template to get started"
                  : "No checklists assigned to you"}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === "date_header") {
              return (
                <View style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  marginTop: 16,
                  marginBottom: 8,
                  backgroundColor: colors.surface,
                  alignSelf: "flex-start",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}>
                  <Text style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontFamily: "Urbanist-Bold",
                    letterSpacing: 1
                  }}>
                    {item.date}
                  </Text>
                </View>
              );
            }
            return (
              <HistoryListCard
                item={item}
                templates={templates}
                dueStatusMap={dueStatusMap}
                liveNow={liveNow}
                onStart={handleStartChecklist}
                onView={async (comp) => {
                  // Fetch completion with items for detail view
                  try {
                    const res = await checklistService.fetchTemplateCompletions(propertyId as string, comp.template_id, 50);
                    const completionWithItems = res.completions.find((c) => c.id === comp.id);
                    if (completionWithItems) {
                      // Merge with original comp so we keep any fields the server query may miss
                      setHistoryCompletion({
                        ...comp,
                        ...completionWithItems,
                        items: completionWithItems.items?.length ? completionWithItems.items : comp.items,
                        user: completionWithItems.user || (comp as any).user || (comp as any).completed_by_user,
                        slot_time: completionWithItems.slot_time ?? comp.slot_time ?? null,
                      });
                    } else {
                      setHistoryCompletion(comp); // fallback
                    }
                  } catch {
                    setHistoryCompletion(comp); // fallback
                  }
                  setView("detail");
                }}
              />
            );
          }}
        />
      )}

      {/* Create/Edit Template Modal */}
      <Modal visible={showCreateTemplate} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={[modalStyles.overlay, { paddingBottom: insets.bottom, paddingTop: insets.top }]}>
            <View style={[modalStyles.sheet, { backgroundColor: colors.card }]}>
              <View style={modalStyles.handle} />
              <View style={modalStyles.modalHeader}>
                <Text style={[modalStyles.modalTitle, { color: colors.text }]}>
                  {editingTemplate ? "Edit Template" : "New Template"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowCreateTemplate(false);
                    resetTemplateForm();
                  }}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={modalStyles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Template Name *
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="e.g., Morning Shift Perimeter Check"
                  placeholderTextColor={colors.textTertiary}
                  value={tplTitle}
                  onChangeText={setTplTitle}
                />

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Description
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    modalStyles.textArea,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Briefly describe the purpose of this checklist..."
                  placeholderTextColor={colors.textTertiary}
                  value={tplDesc}
                  onChangeText={setTplDesc}
                  multiline
                />

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Category
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="general"
                  placeholderTextColor={colors.textTertiary}
                  value={tplCategory}
                  onChangeText={setTplCategory}
                />

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Frequency
                </Text>
                <View style={modalStyles.freqGrid}>
                  {FREQUENCY_OPTIONS.map((freq) => (
                    <TouchableOpacity
                      key={freq.value}
                      style={[
                        modalStyles.freqChip,
                        tplFrequency === freq.value
                          ? {
                              backgroundColor: colors.primary + "18",
                              borderColor: colors.primary,
                            }
                          : {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                      ]}
                      onPress={() => setTplFrequency(freq.value)}
                    >
                      <Text
                        style={[
                          modalStyles.freqChipText,
                          {
                            color:
                              tplFrequency === freq.value
                                ? colors.primary
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        {freq.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Time Window {isHourlyFreq(tplFrequency) ? "(Required for Hourly)" : "(Optional)"}
                </Text>
                <View style={modalStyles.timeRow}>
                  <View style={[modalStyles.timePickerBtn, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flex: 1 }]}>
                    <Ionicons name="time-outline" size={16} color={colors.primary} />
                    <TextInput
                      style={[modalStyles.timePickerText, { color: colors.text, marginLeft: 8, flex: 1 }]}
                      placeholder="HH:MM (e.g. 09:00)"
                      placeholderTextColor={colors.textTertiary}
                      value={tplStartTime}
                      onChangeText={setTplStartTime}
                    />
                  </View>
                  <Text style={{ color: colors.textTertiary, marginHorizontal: 8 }}>to</Text>
                  <View style={[modalStyles.timePickerBtn, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flex: 1 }]}>
                    <Ionicons name="time-outline" size={16} color={colors.primary} />
                    <TextInput
                      style={[modalStyles.timePickerText, { color: colors.text, marginLeft: 8, flex: 1 }]}
                      placeholder="HH:MM (e.g. 17:00)"
                      placeholderTextColor={colors.textTertiary}
                      value={tplEndTime}
                      onChangeText={setTplEndTime}
                    />
                  </View>
                </View>

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Assign to (leave empty for all)
                </Text>
                <View style={modalStyles.assigneeSection}>
                  {propertyMembers.map((member) => {
                    const isSelected = tplAssignedTo.includes(member.id);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[
                          modalStyles.assigneeChip,
                          isSelected
                            ? {
                                backgroundColor: colors.primary + "18",
                                borderColor: colors.primary,
                              }
                            : {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                              },
                        ]}
                        onPress={() =>
                          setTplAssignedTo((prev) =>
                            isSelected
                              ? prev.filter((id) => id !== member.id)
                              : [...prev, member.id],
                          )
                        }
                      >
                        <Text
                          style={[
                            modalStyles.assigneeChipText,
                            {
                              color: isSelected
                                ? colors.primary
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {member.full_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={modalStyles.itemsSectionHeader}>
                  <Text
                    style={[
                      modalStyles.label,
                      { color: colors.textSecondary, marginBottom: 0 },
                    ]}
                  >
                    Checklist Items ({tplItems.length})
                  </Text>
                  <TouchableOpacity
                    style={[
                      modalStyles.addItemBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={addTemplateItem}
                  >
                    <Plus size={12} color="#FFFFFF" />
                    <Text style={modalStyles.addItemBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>

                {tplItems.map((item, idx) => (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: 12,
                      marginBottom: 10,
                      overflow: 'hidden'
                    }}
                  >
                    <View
                      style={[
                        modalStyles.itemRow,
                        {
                          borderWidth: 0,
                          marginBottom: 0
                        },
                      ]}
                    >
                    <View style={modalStyles.itemInputs}>
                      <TextInput
                        style={[
                          modalStyles.input,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            color: colors.text,
                            fontSize: 13,
                          },
                        ]}
                        placeholder="Step Title"
                        placeholderTextColor={colors.textTertiary}
                        value={item.title}
                        onChangeText={(v) => updateTplItem(idx, "title", v)}
                      />
                      <TextInput
                        style={[
                          modalStyles.input,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            color: colors.text,
                            fontSize: 13,
                            minHeight: 60,
                            textAlignVertical: "top",
                          },
                        ]}
                        placeholder="Step Description / Instructions..."
                        placeholderTextColor={colors.textTertiary}
                        value={item.description || ""}
                        onChangeText={(v) => updateTplItem(idx, "description", v)}
                        multiline
                      />
                      <View style={modalStyles.typeRow}>
                        {(
                          ["checkbox", "text", "number", "yes_no"] as ItemType[]
                        ).map((type) => (
                          <TouchableOpacity
                            key={type}
                            style={[
                              modalStyles.typeChip,
                              item.type === type
                                ? {
                                    backgroundColor: colors.primary + "18",
                                    borderColor: colors.primary,
                                  }
                                : {
                                    backgroundColor: "transparent",
                                    borderColor: colors.border,
                                  },
                            ]}
                            onPress={() => updateTplItem(idx, "type", type)}
                          >
                            <Text
                              style={[
                                modalStyles.typeChipText,
                                {
                                  color:
                                    item.type === type
                                      ? colors.primary
                                      : colors.textTertiary,
                                },
                              ]}
                            >
                              {type === "checkbox"
                                ? "Check"
                                : type === "yes_no"
                                  ? "Yes/No"
                                  : type.charAt(0).toUpperCase() +
                                    type.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={modalStyles.itemOptionsRow}>
                        <TouchableOpacity
                          style={[
                            modalStyles.optionToggle,
                            {
                              backgroundColor: item.requires_photo
                                ? colors.warning + "18"
                                : "transparent",
                              borderColor: item.requires_photo
                                ? colors.warning
                                : colors.border,
                            },
                          ]}
                          onPress={() =>
                            updateTplItem(
                              idx,
                              "requires_photo",
                              !item.requires_photo,
                            )
                          }
                        >
                          <Camera
                            size={10}
                            color={
                              item.requires_photo
                                ? colors.warning
                                : colors.textTertiary
                            }
                          />
                          <Text
                            style={[
                              modalStyles.optionToggleText,
                              {
                                color: item.requires_photo
                                  ? colors.warning
                                  : colors.textTertiary,
                              },
                            ]}
                          >
                            Photo
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            modalStyles.optionToggle,
                            {
                              backgroundColor: item.requires_comment
                                ? (colors.info || colors.primary) + "18"
                                : "transparent",
                              borderColor: item.requires_comment
                                ? colors.info || colors.primary
                                : colors.border,
                            },
                          ]}
                          onPress={() =>
                            updateTplItem(
                              idx,
                              "requires_comment",
                              !item.requires_comment,
                            )
                          }
                        >
                          <MessageSquare
                            size={10}
                            color={
                              item.requires_comment
                                ? colors.info || colors.primary
                                : colors.textTertiary
                            }
                          />
                          <Text
                            style={[
                              modalStyles.optionToggleText,
                              {
                                color: item.requires_comment
                                  ? colors.info || colors.primary
                                  : colors.textTertiary,
                              },
                            ]}
                          >
                            Comment
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            modalStyles.optionToggle,
                            {
                              backgroundColor: item.is_optional
                                ? colors.textTertiary + "18"
                                : "transparent",
                              borderColor: item.is_optional
                                ? colors.textTertiary
                                : colors.border,
                            },
                          ]}
                          onPress={() =>
                            updateTplItem(idx, "is_optional", !item.is_optional)
                          }
                        >
                          <Text
                            style={[
                              modalStyles.optionToggleText,
                              {
                                color: item.is_optional
                                  ? colors.textTertiary
                                  : colors.textTertiary,
                              },
                            ]}
                          >
                            Optional
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={{ padding: 4 }}
                      onPress={() => removeTemplateItem(idx)}
                    >
                      <X size={16} color={colors.error || colors.error || colors.warning} />
                    </TouchableOpacity>
                  </View>
                  <View style={[modalStyles.timeRow, { marginTop: 8, paddingHorizontal: 10 }]}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[modalStyles.subLabel, { color: colors.textTertiary, marginBottom: 0 }]}>Start</Text>
                      <TextInput
                        style={[modalStyles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, paddingVertical: 4 }]}
                        placeholder="09:00"
                        placeholderTextColor={colors.textTertiary}
                        value={item.start_time || ""}
                        onChangeText={(v) => updateTplItem(idx, "start_time", v)}
                      />
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[modalStyles.subLabel, { color: colors.textTertiary, marginBottom: 0 }]}>End</Text>
                      <TextInput
                        style={[modalStyles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, paddingVertical: 4 }]}
                        placeholder="17:00"
                        placeholderTextColor={colors.textTertiary}
                        value={item.end_time || ""}
                        onChangeText={(v) => updateTplItem(idx, "end_time", v)}
                      />
                    </View>
                  </View>
                </View>
                ))}

                {tplItems.length === 0 && (
                  <TouchableOpacity
                    style={[
                      modalStyles.addFirstItem,
                      { borderColor: colors.border },
                    ]}
                    onPress={addTemplateItem}
                  >
                    <Plus size={18} color={colors.textTertiary} />
                    <Text
                      style={[
                        modalStyles.addFirstItemText,
                        { color: colors.textTertiary },
                      ]}
                    >
                      Add first item
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={{ height: 80 }} />
              </ScrollView>
              <TouchableOpacity
                style={[
                  modalStyles.submitBtn,
                  { backgroundColor: colors.primary },
                  isSaving && { opacity: 0.6 },
                ]}
                onPress={handleCreateTemplate}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={modalStyles.submitBtnText}>
                    {editingTemplate ? "Update Template" : "Create Template"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <MediaViewerModal
        visible={!!mediaViewer}
        uri={mediaViewer?.uri || null}
        type={mediaViewer?.type || 'photo'}
        onClose={() => setMediaViewer(null)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  topNavTitle: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    letterSpacing: -0.5,
  },
  navIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  headerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Poppins-Bold",
    letterSpacing: -0.3,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  viewToggle: { flexDirection: "row", gap: 10 },
  toggleTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleTabActive: {
    borderWidth: 1,
  },
  toggleTabText: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
    justifyContent: "space-between",
  },
  statCard: { width: "48%", padding: 16, borderRadius: 12, borderWidth: 1 },
  statLabel: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: { fontSize: 32, fontFamily: "Poppins-Bold" },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterChipActive: {
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
  },

  historyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  historyCardRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  historyCardContent: { flex: 1 },
  historyTitle: {
    fontSize: 14,
    fontFamily: "Poppins-Bold",
    marginBottom: 2,
  },
  historyMeta: {
    fontSize: 11,
    fontFamily: "Urbanist-Medium",
  },

  historyCardRight: { alignItems: "flex-end", gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusBadgeText: {
    fontSize: 9,
    fontFamily: "Urbanist-Bold",
    letterSpacing: 0.5,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 90,
  },
  startBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Poppins-Bold",
    lineHeight: 16,
    includeFontPadding: false,
  },
});

const runnerStyles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { flex: 1 },
  headerTitleText: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: "Urbanist-Medium",
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  adminBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  metaBar: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.7)",
  },
  progressSection: { marginTop: 12 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.7)",
  },
  progressCount: { fontSize: 13, fontFamily: "Poppins-Bold", color: "#FFFFFF" },
  progressTrack: {
    height: 5,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 3,
  },
  progressFill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: 3 },

  bannerAmber: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
  },
  bannerAmberText: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    color: "#B45309",
  },
  bannerRed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
  },
  bannerRedText: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    color: "#B91C1C",
  },
  bannerGreen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  bannerGreenText: { fontSize: 11, fontFamily: "Urbanist-Bold" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionAccent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#718f96",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: "#64748B",
  },

  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    gap: 12,
  },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 14, fontFamily: "Poppins-Bold", lineHeight: 20 },
  slotBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  slotBadgeText: {
    fontSize: 9,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  valueInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  yesNoRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  yesNoBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  yesNoBtnText: { fontSize: 12, fontFamily: "Poppins-Bold", letterSpacing: 1 },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    minHeight: 28,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  completeBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Poppins-Bold",
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontFamily: "Urbanist-Bold" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: "92%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: "Poppins-Bold" },
  modalBody: { maxHeight: 480 },
  label: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#64748B",
    marginBottom: 6,
    marginTop: 10,
  },
  subLabel: { fontSize: 10, fontFamily: "Urbanist-Medium", marginBottom: 4 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Urbanist-Medium",
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  freqGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  freqChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  freqChipText: { fontSize: 11, fontFamily: "Urbanist-Medium" },
  timeRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  timePickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  timePickerText: {
    fontSize: 14,
    fontFamily: "Urbanist-Medium",
  },
  assigneeSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  assigneeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  assigneeChipText: { fontSize: 12, fontFamily: "Urbanist-Medium" },
  itemsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  addItemBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  itemInputs: { flex: 1, gap: 6 },
  typeRow: { flexDirection: "row", gap: 4 },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 10, fontFamily: "Urbanist-Medium" },
  itemOptionsRow: { flexDirection: "row", gap: 6 },
  optionToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionToggleText: { fontSize: 10, fontFamily: "Urbanist-Medium" },
  addFirstItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 24,
    marginTop: 8,
  },
  addFirstItemText: { fontSize: 13, fontFamily: "Urbanist-Medium" },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Poppins-Bold" },
});
