export const DEFAULT_SCHEDULE = {
  timezone: "Asia/Kolkata",
  slotDuration: 30,
  bufferMinutes: 0,
  minimumNoticeMinutes: 120,
  maximumAdvanceDays: 30,
  weeklyHours: [
    { day: 1, enabled: true, start: "10:00", end: "18:00", breakStart: "", breakEnd: "" },
    { day: 2, enabled: true, start: "10:00", end: "18:00", breakStart: "", breakEnd: "" },
    { day: 3, enabled: true, start: "10:00", end: "18:00", breakStart: "", breakEnd: "" },
    { day: 4, enabled: true, start: "10:00", end: "18:00", breakStart: "", breakEnd: "" },
    { day: 5, enabled: true, start: "10:00", end: "18:00", breakStart: "", breakEnd: "" },
    { day: 6, enabled: true, start: "10:00", end: "18:00", breakStart: "", breakEnd: "" },
    { day: 0, enabled: false, start: "10:00", end: "18:00", breakStart: "", breakEnd: "" },
  ],
};

const VALID_DURATIONS = new Set([15, 30, 45, 60]);

export function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

export function validateSchedule(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Schedule must be an object.");
  }
  if (!VALID_DURATIONS.has(Number(value.slotDuration))) {
    throw new Error("Choose a slot duration of 15, 30, 45, or 60 minutes.");
  }
  if (!Number.isInteger(value.bufferMinutes) || value.bufferMinutes < 0 || value.bufferMinutes > 120 || value.bufferMinutes % 15 !== 0) {
    throw new Error("Buffer must be a multiple of 15 minutes between 0 and 120.");
  }
  if (!Number.isInteger(value.minimumNoticeMinutes) || value.minimumNoticeMinutes < 0 || value.minimumNoticeMinutes > 10080) {
    throw new Error("Minimum notice must be between 0 minutes and 7 days.");
  }
  if (!Number.isInteger(value.maximumAdvanceDays) || value.maximumAdvanceDays < 1 || value.maximumAdvanceDays > 365) {
    throw new Error("Maximum advance booking must be between 1 and 365 days.");
  }
  if (typeof value.timezone !== "string" || value.timezone.length > 64) {
    throw new Error("Choose a valid consultation timezone.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(new Date());
  } catch {
    throw new Error("Choose a valid consultation timezone.");
  }
  if (!Array.isArray(value.weeklyHours) || value.weeklyHours.length !== 7) {
    throw new Error("Configure all seven weekdays.");
  }
  const seen = new Set();
  for (const hours of value.weeklyHours) {
    if (!hours || !Number.isInteger(hours.day) || hours.day < 0 || hours.day > 6 || seen.has(hours.day)) {
      throw new Error("Each weekday must be configured exactly once.");
    }
    seen.add(hours.day);
    if (typeof hours.enabled !== "boolean") throw new Error("Each weekday requires an enabled or disabled setting.");
    if (!hours.enabled) continue;
    const start = timeToMinutes(hours.start);
    const end = timeToMinutes(hours.end);
    if (start === null || end === null || start >= end || start % 15 !== 0 || end % 15 !== 0) {
      throw new Error("Working hours must be valid 15-minute increments with an end after the start.");
    }
    const hasBreakStart = Boolean(hours.breakStart);
    const hasBreakEnd = Boolean(hours.breakEnd);
    if (hasBreakStart !== hasBreakEnd) throw new Error("Set both break times or leave both blank.");
    if (hasBreakStart) {
      const breakStart = timeToMinutes(hours.breakStart);
      const breakEnd = timeToMinutes(hours.breakEnd);
      if (
        breakStart === null ||
        breakEnd === null ||
        breakStart % 15 !== 0 ||
        breakEnd % 15 !== 0 ||
        breakStart <= start ||
        breakEnd >= end ||
        breakStart >= breakEnd
      ) {
        throw new Error("The break must be a valid time range inside working hours.");
      }
    }
  }
  return {
    timezone: value.timezone,
    slotDuration: Number(value.slotDuration),
    bufferMinutes: value.bufferMinutes,
    minimumNoticeMinutes: value.minimumNoticeMinutes,
    maximumAdvanceDays: value.maximumAdvanceDays,
    weeklyHours: [...value.weeklyHours].sort((a, b) => a.day - b.day).map((hours) => ({
      day: hours.day,
      enabled: hours.enabled,
      start: hours.start,
      end: hours.end,
      breakStart: hours.breakStart || "",
      breakEnd: hours.breakEnd || "",
    })),
  };
}

export function timeToMinutes(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function dateStringAt(date, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

export function zonedDateTime(dateString, time, timezone) {
  const date = parseDate(dateString);
  const minutes = timeToMinutes(time);
  if (!date || minutes === null) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const expected = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = expected;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(timestamp), timezone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const adjustment = expected - represented;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }
  const result = new Date(timestamp);
  const actual = zonedParts(result, timezone);
  if (actual.year !== year || actual.month !== month || actual.day !== day || actual.hour !== hour || actual.minute !== minute) return null;
  return result;
}

function exceptionForDate(exceptions, date) {
  return exceptions.find((item) => item.date === date);
}

function intervalKeys(date, startMinutes, endMinutes) {
  const keys = [];
  for (let minute = startMinutes; minute < endMinutes; minute += 15) {
    keys.push(`${date}T${String(minute).padStart(4, "0")}`);
  }
  return keys;
}

export function getLockKeys(date, startsAt, endsAt, bufferMinutes, timezone) {
  const start = zonedParts(startsAt, timezone);
  const end = zonedParts(new Date(endsAt.getTime() + bufferMinutes * 60_000), timezone);
  const startDate = `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`;
  const endDate = `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`;
  if (startDate !== endDate || date !== startDate) throw new Error("Appointments and buffers must end on the same local date.");
  return intervalKeys(date, start.hour * 60 + start.minute, end.hour * 60 + end.minute);
}

export function getAvailableSlots(date, scheduleValue, exceptions, bookings, locks, now = Date.now(), excludeBookingId = "") {
  const schedule = validateSchedule(scheduleValue);
  const parsedDate = parseDate(date);
  if (!parsedDate) return [];
  const exception = exceptionForDate(exceptions, date);
  if (exception?.type === "full-day") return [];
  const hours = exception?.type === "special-hours"
    ? { enabled: true, start: exception.startTime, end: exception.endTime, breakStart: "", breakEnd: "" }
    : schedule.weeklyHours.find((item) => item.day === parsedDate.getUTCDay());
  if (!hours?.enabled) return [];
  const startMinutes = timeToMinutes(hours.start);
  const endMinutes = timeToMinutes(hours.end);
  if (startMinutes === null || endMinutes === null) return [];
  const breakStart = timeToMinutes(hours.breakStart);
  const breakEnd = timeToMinutes(hours.breakEnd);
  const daysUntil = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dateStringAt(new Date(now), schedule.timezone)}T00:00:00Z`)) / 86_400_000);
  if (daysUntil < 0 || daysUntil > schedule.maximumAdvanceDays) return [];
  const blockedRanges = exceptions
    .filter((item) => item.date === date && item.type === "blocked-range")
    .map((item) => [timeToMinutes(item.startTime), timeToMinutes(item.endTime)]);
  const bookedIntervals = bookings
    .filter((booking) => booking.$id !== excludeBookingId && ["confirmed", "pending"].includes(booking.status))
    .map((booking) => [Date.parse(booking.startsAt), Date.parse(booking.endsAt)]);
  const locked = new Set(locks.map((item) => item.lockKey));
  const result = [];
  const step = schedule.slotDuration + schedule.bufferMinutes;
  for (let minute = startMinutes; minute + schedule.slotDuration + schedule.bufferMinutes <= endMinutes; minute += step) {
    const bookingEndMinute = minute + schedule.slotDuration;
    const occupiedThrough = bookingEndMinute + schedule.bufferMinutes;
    if (breakStart !== null && breakEnd !== null && minute < breakEnd && occupiedThrough > breakStart) continue;
    if (blockedRanges.some(([from, to]) => from !== null && to !== null && minute < to && occupiedThrough > from)) continue;
    const startTime = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const endTime = `${String(Math.floor(bookingEndMinute / 60)).padStart(2, "0")}:${String(bookingEndMinute % 60).padStart(2, "0")}`;
    const startsAt = zonedDateTime(date, startTime, schedule.timezone);
    const endsAt = zonedDateTime(date, endTime, schedule.timezone);
    if (!startsAt || !endsAt || startsAt.getTime() < now + schedule.minimumNoticeMinutes * 60_000) continue;
    if (bookedIntervals.some(([from, to]) => from < endsAt.getTime() && to > startsAt.getTime())) continue;
    const keys = getLockKeys(date, startsAt, endsAt, schedule.bufferMinutes, schedule.timezone);
    if (keys.some((key) => locked.has(key))) continue;
    result.push({ time: startTime, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  }
  return result;
}

export function validateException(value) {
  if (!value || typeof value !== "object" || !parseDate(value.date)) throw new Error("Choose a valid exception date.");
  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 500) : "";
  if (!["full-day", "blocked-range", "special-hours"].includes(value.type)) throw new Error("Choose a valid exception type.");
  if (value.type === "full-day") {
    return { date: value.date, type: value.type, startTime: "", endTime: "", reason };
  }
  const start = timeToMinutes(value.startTime);
  const end = timeToMinutes(value.endTime);
  if (start === null || end === null || start >= end || start % 15 !== 0 || end % 15 !== 0) {
    throw new Error("Exception hours must be a valid 15-minute time range.");
  }
  return {
    date: value.date,
    type: value.type,
    startTime: value.startTime,
    endTime: value.endTime,
    reason,
  };
}
