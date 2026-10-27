import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCHEDULE,
  getAvailableSlots,
  getLockKeys,
  validateException,
  validateSchedule,
  zonedDateTime,
} from "./schedule.js";

test("validates the default schedule and rejects a break outside working hours", () => {
  assert.equal(validateSchedule(DEFAULT_SCHEDULE).timezone, "Asia/Kolkata");
  const invalid = structuredClone(DEFAULT_SCHEDULE);
  invalid.weeklyHours[0].breakStart = "09:00";
  invalid.weeklyHours[0].breakEnd = "09:30";
  assert.throws(() => validateSchedule(invalid), /break must be a valid time range/);
});

test("generates working slots while respecting breaks, exceptions, notice and existing bookings", () => {
  const schedule = structuredClone(DEFAULT_SCHEDULE);
  schedule.weeklyHours[1].breakStart = "13:00";
  schedule.weeklyHours[1].breakEnd = "14:00";
  const now = Date.parse("2026-10-26T00:00:00Z");
  const bookedStart = zonedDateTime("2026-10-27", "10:00", schedule.timezone);
  const bookings = [{ $id: "booked", status: "confirmed", startsAt: bookedStart.toISOString(), endsAt: new Date(bookedStart.getTime() + 30 * 60_000).toISOString() }];
  const slots = getAvailableSlots("2026-10-27", schedule, [], bookings, [], now);
  assert.ok(!slots.some((slot) => slot.time === "10:00"));
  assert.ok(!slots.some((slot) => slot.time === "13:00"));
  assert.ok(slots.some((slot) => slot.time === "14:00"));
  assert.deepEqual(getAvailableSlots("2026-10-27", schedule, [{ date: "2026-10-27", type: "full-day" }], [], [], now), []);
});

test("unique 15-minute lock keys cover duration and buffer", () => {
  const start = zonedDateTime("2026-10-27", "10:00", "Asia/Kolkata");
  const end = zonedDateTime("2026-10-27", "10:45", "Asia/Kolkata");
  assert.deepEqual(getLockKeys("2026-10-27", start, end, 15, "Asia/Kolkata"), [
    "2026-10-27T0600",
    "2026-10-27T0615",
    "2026-10-27T0630",
    "2026-10-27T0645",
  ]);
});

test("rejects malformed or partial time exceptions", () => {
  assert.throws(() => validateException({ date: "2026-10-27", type: "blocked-range", startTime: "10:00", endTime: "10:00" }));
  assert.equal(validateException({ date: "2026-10-27", type: "full-day", reason: "Holiday" }).reason, "Holiday");
});
