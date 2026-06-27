export function parseHourlyInterval(frequency: string): number | null {
  if (!frequency?.startsWith("every_")) return null;
  const match = frequency.match(/^every_(\d+)_hours$/);
  return match ? parseInt(match[1], 10) : null;
}

export function fmt12h(timeStr: string | null): string {
  if (!timeStr) return "N/A";
  const [hStr, mStr] = timeStr.slice(0, 5).split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function fmtRemaining(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rMins = mins % 60;
  return `${hrs}h ${rMins}m`;
}

export function getISTDateParts(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();

  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    isoDate,
    totalMins: hour * 60 + minute,
    todayStart: new Date(year, month - 1, day, 0, 0, 0),
  };
}

export function computeSlotTime(
  frequency: string,
  startTime: string | null,
  endTime: string | null,
  now: Date,
): string | null {
  const intervalH = parseHourlyInterval(frequency);
  if (!intervalH || !startTime) return null;

  // Validate startTime format
  if (!startTime || typeof startTime !== 'string' || !startTime.includes(':')) {
    return null;
  }

  const ist = getISTDateParts(now);
  const nowMins = ist.totalMins;

  const timeParts = startTime.slice(0, 5).split(":").map(Number);
  if (timeParts.some(isNaN)) return null;
  const [sH, sM] = timeParts;
  const startMins = sH * 60 + sM;

  if (isNaN(startMins)) return null;

  const elapsed = nowMins - startMins;
  const elapsedActual = elapsed < 0 ? elapsed + 1440 : elapsed;

  let slotStartMins = startMins + Math.floor(elapsedActual / (intervalH * 60)) * intervalH * 60;

  if (endTime && typeof endTime === 'string' && endTime.includes(':')) {
    const endParts = endTime.slice(0, 5).split(":").map(Number);
    if (!endParts.some(isNaN)) {
      const [eH, eM] = endParts;
      const endMins = eH * 60 + eM;
      if (!isNaN(endMins)) {
        const isOvernight = endMins <= startMins;
        const windowDuration = isOvernight ? 1440 - startMins + endMins : endMins - startMins;
        const elapsedSinceStart = isOvernight && nowMins < endMins ? nowMins + 1440 - startMins : nowMins - startMins;
        if (elapsedSinceStart < 0 || elapsedSinceStart >= windowDuration) return null;
        const lastValidSlotStartOffset = Math.floor((windowDuration - intervalH * 60) / (intervalH * 60)) * intervalH * 60;
        const currentSlotOffset = Math.floor(elapsedSinceStart / (intervalH * 60)) * intervalH * 60;
        if (currentSlotOffset > lastValidSlotStartOffset) return null;
        slotStartMins = startMins + currentSlotOffset;
      }
    }
  }

  if (isNaN(slotStartMins)) return null;

  const h = Math.floor(slotStartMins / 60) % 24;
  const mn = slotStartMins % 60;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

export function getCompletionSlot(
  timestampStr: string | null,
  frequency: string,
  startTime?: string | null,
  explicitSlotTime?: string | null,
): string | null {
  const intervalHours = parseHourlyInterval(frequency);
  if (!intervalHours || !startTime) return null;

  if (explicitSlotTime) {
    const [h, m] = explicitSlotTime.slice(0, 5).split(":").map(Number);
    const start = h * 60 + m;
    const end = start + intervalHours * 60;
    const fmt = (mins: number) => {
      const hh = Math.floor(mins / 60) % 24;
      const mm = mins % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };
    return `${fmt(start)} - ${fmt(end)}`;
  }
  if (!timestampStr) return null;
  const d = new Date(timestampStr);
  return computeSlotTime(frequency, startTime, null, d);
}

export function isWithinTimeWindow(nowMins: number, startTime: string, endTime: string): boolean {
  const [sH, sM] = startTime.split(":").map(Number);
  const [eH, eM] = endTime.split(":").map(Number);
  const start = sH * 60 + sM;
  const end = eH * 60 + eM;
  if (end > start) {
    return nowMins >= start && nowMins <= end;
  }
  return nowMins >= start || nowMins <= end;
}

export function isDue(
  frequency: string,
  lastCompletionDate: string | null,
  startTime?: string | null,
  endTime?: string | null,
  lastCompletedAt?: string | null,
  startedAt?: string | null,
  baseDate?: Date,
): {
  due: boolean;
  label: string;
  status: "due" | "missed" | "completed" | "upcoming" | "";
} {
  if (frequency === "on_demand") return { due: false, label: "", status: "" };

  const now = baseDate || new Date();
  const ist = getISTDateParts(now);
  const nowMins = ist.totalMins;
  const intervalHours = parseHourlyInterval(frequency);

  let todayStr = ist.isoDate;
  if (startTime && endTime) {
    const [sH, sM] = startTime.slice(0, 5).split(":").map(Number);
    const [eH, eM] = endTime.slice(0, 5).split(":").map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;
    const isOvernight = endMins <= startMins;

    if (isOvernight && nowMins < endMins) {
      const yesterday = new Date(now.getTime() - 86400000);
      todayStr = getISTDateParts(yesterday).isoDate;
    }
  }

  if (intervalHours !== null && startTime && endTime) {
    const [sH, sM] = startTime.slice(0, 5).split(":").map(Number);
    const [eH, eM] = endTime.slice(0, 5).split(":").map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;

    const isOvernight = endMins <= startMins;
    let baselineDateStr = todayStr;

    const baselineStart = new Date(
      `${baselineDateStr}T${startTime.slice(0, 5)}:00+05:30`,
    );
    const windowDurationMins = isOvernight
      ? 1440 - startMins + endMins
      : endMins - startMins;

    const todaySlots: Date[] = [];
    let t = 0;
    while (t + intervalHours * 60 <= windowDurationMins) {
      const slotTime = new Date(baselineStart.getTime() + t * 60 * 1000);
      todaySlots.push(slotTime);
      t += intervalHours * 60;
    }

    const passedSlots = todaySlots.filter((s) => s <= now);
    const currentSlot =
      passedSlots.length > 0 ? passedSlots[passedSlots.length - 1] : null;

    if (!currentSlot) {
      return {
        due: false,
        label: `Starts at ${fmt12h(startTime)}`,
        status: "upcoming",
      };
    }

    const lastDone = lastCompletedAt ? new Date(lastCompletedAt) : null;
    const isDone = lastDone && lastDone >= currentSlot;

    if (isDone) {
      const nextSlot = todaySlots.find((s) => s > now);
      if (!nextSlot)
        return { due: false, label: "All done today", status: "completed" };
      return {
        due: false,
        label: `Next in ${fmtRemaining(
          nextSlot.getTime() - now.getTime(),
        )}`,
        status: "completed",
      };
    }

    if (isWithinTimeWindow(nowMins, startTime, endTime)) {
      const isLate = now.getTime() - currentSlot.getTime() > 30 * 60 * 1000;
      if (startedAt && new Date(startedAt) >= currentSlot) {
        return { due: true, label: "In Progress", status: "due" };
      }
      return {
        due: true,
        label: isLate ? "Overdue" : "Due Now",
        status: "due",
      };
    }

    return { due: false, label: "Missed", status: "missed" };
  }

  // Daily
  if (frequency === "daily") {
    let lastDoneStr = lastCompletionDate;
    if (startTime && endTime) {
      const [sH, sM] = startTime.slice(0, 5).split(":").map(Number);
      const [eH, eM] = endTime.slice(0, 5).split(":").map(Number);
      const startMins = sH * 60 + sM;
      const endMins = eH * 60 + eM;
      if (endMins <= startMins && lastCompletedAt) {
        const lastDateObj = new Date(lastCompletedAt);
        const lIst = getISTDateParts(lastDateObj);
        if (lIst.totalMins < endMins) {
           const y = new Date(lastDateObj.getTime() - 86400000);
           lastDoneStr = getISTDateParts(y).isoDate;
        } else {
           lastDoneStr = lIst.isoDate;
        }
      }
    }
    
    if (lastDoneStr === todayStr) {
      return { due: false, label: "Done for today", status: "completed" };
    }
    if (startTime && endTime) {
      if (isWithinTimeWindow(nowMins, startTime, endTime)) {
        return { due: true, label: "Due Today", status: "due" };
      }
      const [sh, sm] = startTime.slice(0, 5).split(":").map(Number);
      if (nowMins < sh * 60 + sm) {
        return {
          due: false,
          label: `Starts at ${fmt12h(startTime)}`,
          status: "upcoming",
        };
      }
      return { due: false, label: "Missed", status: "missed" };
    }
    return { due: true, label: "Due Today", status: "due" };
  }

  // Weekly/Monthly
  return { due: true, label: "Due", status: "due" };
}

export function getDueStatus(
  frequency: string,
  lastCompletionDate: string | null,
  startTime: string | null,
  endTime: string | null,
  lastSlotTime: string | null,
): "due" | "upcoming" | "completed" | null {
  if (isDue(frequency, lastCompletionDate, startTime, endTime, lastSlotTime)) return "due";
  return "completed";
}
