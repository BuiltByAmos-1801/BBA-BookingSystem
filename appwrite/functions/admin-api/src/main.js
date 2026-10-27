import { Account, Client, ID, Query, TablesDB } from "node-appwrite";
import {
  DEFAULT_SCHEDULE,
  dateStringAt,
  getAvailableSlots,
  getLockKeys,
  parseDate,
  validateException,
  validateSchedule,
  zonedDateTime,
} from "../../shared/schedule.js";

const ACTIVE_STATUSES = ["confirmed", "pending"];
const SCHEDULE_ROW_ID = "weekly-settings";
const SCHEDULE_GUARD_KEY = "__schedule_guard__";
const SERVICES = new Set([
  "website-development",
  "ecommerce-website",
  "mobile-app-development",
  "custom-software-automation",
]);

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function json(res, body, statusCode, origin) {
  const headers = { "Cache-Control": "no-store" };
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return res.json(body, statusCode, headers);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return (process.env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}

function readBody(req) {
  const body = req.bodyJson && typeof req.bodyJson === "object"
    ? req.bodyJson
    : typeof req.bodyText === "string"
      ? JSON.parse(req.bodyText)
      : null;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Send a valid request.");
  return body;
}

function addDays(date, days) {
  const parsed = parseDate(date);
  if (!parsed) throw new HttpError("Choose a valid date.");
  const shifted = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + days));
  return shifted.toISOString().slice(0, 10);
}

async function authorize(req) {
  const jwt = req.headers["x-appwrite-user-jwt"];
  if (!jwt) throw new HttpError("Sign in with an authorized admin account.", 401);
  const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!adminIds.length) throw new HttpError("Admin access has not been configured.", 503);
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  if (!endpoint || !projectId) throw new HttpError("The Appwrite Function runtime is not configured.", 503);
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
  let user;
  try {
    user = await new Account(client).get();
  } catch (caught) {
    throw new HttpError("Your Appwrite session is invalid or expired. Sign in again.", 401);
  }
  if (!adminIds.includes(user.$id)) throw new HttpError("This Appwrite account is not authorized to manage bookings.", 403);
  return user;
}

function getConfig(req) {
  const required = [
    "APPWRITE_DATABASE_ID",
    "APPWRITE_BOOKINGS_TABLE_ID",
    "APPWRITE_SCHEDULE_TABLE_ID",
    "APPWRITE_EXCEPTIONS_TABLE_ID",
    "APPWRITE_SLOT_LOCKS_TABLE_ID",
    "APPWRITE_BOOKING_AUDIT_TABLE_ID",
  ];
  const missing = required.filter((name) => !process.env[name]);
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const functionKey = req.headers["x-appwrite-key"];
  if (missing.length || !endpoint || !projectId || !functionKey) {
    throw new HttpError("Admin Function database settings are incomplete.", 503);
  }
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(functionKey);
  return {
    tablesDB: new TablesDB(client),
    databaseId: process.env.APPWRITE_DATABASE_ID,
    bookingsTableId: process.env.APPWRITE_BOOKINGS_TABLE_ID,
    scheduleTableId: process.env.APPWRITE_SCHEDULE_TABLE_ID,
    exceptionsTableId: process.env.APPWRITE_EXCEPTIONS_TABLE_ID,
    locksTableId: process.env.APPWRITE_SLOT_LOCKS_TABLE_ID,
    auditTableId: process.env.APPWRITE_BOOKING_AUDIT_TABLE_ID,
  };
}

async function getSchedule(tablesDB, databaseId, tableId) {
  try {
    const row = await tablesDB.getRow({ databaseId, tableId, rowId: SCHEDULE_ROW_ID });
    return validateSchedule(JSON.parse(row.scheduleJson));
  } catch (caught) {
    if (Number(caught.code) === 404) return DEFAULT_SCHEDULE;
    if (caught instanceof SyntaxError) throw new HttpError("The saved schedule is invalid. Correct it before making changes.", 503);
    throw caught;
  }
}

async function getRowsForDate(tablesDB, databaseId, bookingsTableId, exceptionsTableId, locksTableId, date, timezone) {
  const dayStart = zonedDateTime(date, "00:00", timezone);
  const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const dayEnd = zonedDateTime(nextDate, "00:00", timezone);
  if (!dayStart || !dayEnd) throw new HttpError("Choose a valid date.");
  const [bookings, exceptions, locks] = await Promise.all([
    tablesDB.listRows({
      databaseId,
      tableId: bookingsTableId,
      queries: [
        Query.equal("status", ACTIVE_STATUSES),
        Query.greaterThanEqual("startsAt", dayStart.toISOString()),
        Query.lessThan("startsAt", dayEnd.toISOString()),
        Query.limit(100),
      ],
      total: false,
      ttl: 0,
    }),
    tablesDB.listRows({
      databaseId,
      tableId: exceptionsTableId,
      queries: [Query.equal("date", date), Query.limit(100)],
      total: false,
      ttl: 0,
    }),
    tablesDB.listRows({
      databaseId,
      tableId: locksTableId,
      queries: [Query.startsWith("lockKey", `${date}T`), Query.limit(500)],
      total: false,
      ttl: 0,
    }),
  ]);
  return { bookings: bookings.rows, exceptions: exceptions.rows, locks: locks.rows };
}

async function listRows(tablesDB, databaseId, tableId, queries, maxRows = 1000) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += 100) {
    const result = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [...queries, Query.limit(100), Query.offset(offset)],
      total: false,
      ttl: 0,
    });
    rows.push(...result.rows);
    if (result.rows.length < 100) break;
  }
  return rows;
}

async function writeAudit(config, actor, event) {
  const { tablesDB, databaseId, auditTableId } = config;
  await tablesDB.createRow({
    databaseId,
    tableId: auditTableId,
    rowId: ID.unique(),
    data: {
      bookingId: event.bookingId || "",
      reference: event.reference || "",
      action: event.action,
      fromStatus: event.fromStatus || "",
      toStatus: event.toStatus || "",
      reason: event.reason || "",
      actorUserId: actor.$id,
      detailsJson: JSON.stringify(event.details || {}),
      createdAt: new Date().toISOString(),
    },
    permissions: [],
  });
}

async function listLocks(config, bookingId) {
  return listRows(config.tablesDB, config.databaseId, config.locksTableId, [Query.equal("bookingId", bookingId)]);
}

async function releaseLocks(config, bookingId, keepKeys = new Set()) {
  const locks = await listLocks(config, bookingId);
  for (const lock of locks) {
    if (!keepKeys.has(lock.lockKey)) {
      await config.tablesDB.deleteRow({
        databaseId: config.databaseId,
        tableId: config.locksTableId,
        rowId: lock.$id,
      });
    }
  }
}

async function acquireLocks(config, bookingId, keys) {
  const created = [];
  for (const lockKey of keys) {
    try {
      const lock = await config.tablesDB.createRow({
        databaseId: config.databaseId,
        tableId: config.locksTableId,
        rowId: ID.unique(),
        data: { lockKey, bookingId },
        permissions: [],
      });
      created.push(lock.$id);
    } catch (caught) {
      if (Number(caught.code) !== 409) {
        await deleteLockRows(config, created);
        throw caught;
      }
      const collision = await config.tablesDB.listRows({
        databaseId: config.databaseId,
        tableId: config.locksTableId,
        queries: [Query.equal("lockKey", lockKey), Query.limit(1)],
        total: false,
        ttl: 0,
      });
      if (collision.rows[0]?.bookingId !== bookingId) {
        await deleteLockRows(config, created);
        return false;
      }
    }
  }
  return true;
}

async function withScheduleGuard(config, operation) {
  const guardId = ID.unique();
  if (!(await acquireLocks(config, guardId, [SCHEDULE_GUARD_KEY]))) {
    throw new HttpError("A booking or schedule update is in progress. Please retry.", 409);
  }
  try {
    return await operation();
  } finally {
    await releaseLocks(config, guardId);
  }
}

async function deleteLockRows(config, rowIds) {
  for (const rowId of rowIds) {
    await config.tablesDB.deleteRow({
      databaseId: config.databaseId,
      tableId: config.locksTableId,
      rowId,
    });
  }
}

async function resolveSlots(config, date, excludeBookingId = "") {
  if (!parseDate(date)) throw new HttpError("Choose a valid date.");
  const schedule = await getSchedule(config.tablesDB, config.databaseId, config.scheduleTableId);
  const { bookings, exceptions, locks } = await getRowsForDate(
    config.tablesDB,
    config.databaseId,
    config.bookingsTableId,
    config.exceptionsTableId,
    config.locksTableId,
    date,
    schedule.timezone,
  );
  const ownLocks = excludeBookingId ? await listLocks(config, excludeBookingId) : [];
  const slots = getAvailableSlots(
    date,
    schedule,
    exceptions,
    bookings,
    locks.filter((lock) => lock.bookingId !== excludeBookingId),
    Date.now(),
    excludeBookingId,
  );
  return { schedule, slots, ownLocks };
}

async function listBookings(config, body) {
  const schedule = await getSchedule(config.tablesDB, config.databaseId, config.scheduleTableId);
  const queries = [];
  if (body.dateFrom) {
    if (!parseDate(body.dateFrom)) throw new HttpError("Choose a valid start date.");
    const startsAt = zonedDateTime(body.dateFrom, "00:00", schedule.timezone);
    queries.push(Query.greaterThanEqual("startsAt", startsAt.toISOString()));
  }
  if (body.dateTo) {
    if (!parseDate(body.dateTo)) throw new HttpError("Choose a valid end date.");
    if (body.dateFrom && body.dateFrom > body.dateTo) throw new HttpError("The start date must be on or before the end date.");
    const endsAt = zonedDateTime(addDays(body.dateTo, 1), "00:00", schedule.timezone);
    queries.push(Query.lessThan("startsAt", endsAt.toISOString()));
  }
  if (body.status && body.status !== "all") {
    if (!["pending", "confirmed", "cancelled", "completed"].includes(body.status)) throw new HttpError("Choose a valid booking status.");
    queries.push(Query.equal("status", body.status));
  }
  if (body.service && body.service !== "all") {
    if (!SERVICES.has(body.service)) throw new HttpError("Choose a valid service.");
    queries.push(Query.equal("service", body.service));
  }
  const rows = await listRows(config.tablesDB, config.databaseId, config.bookingsTableId, [
    ...queries,
    Query.orderDesc("startsAt"),
  ]);
  const search = typeof body.search === "string" ? body.search.trim().toLocaleLowerCase().slice(0, 120) : "";
  return rows.filter((row) => !search || [
    row.customerName,
    row.customerEmail,
    row.customerPhone,
    row.reference,
    row.businessName,
  ].some((value) => String(value || "").toLocaleLowerCase().includes(search)));
}

async function loadExceptions(config) {
  return listRows(config.tablesDB, config.databaseId, config.exceptionsTableId, [Query.orderAsc("date")]);
}

async function getDashboard(config) {
  const schedule = await getSchedule(config.tablesDB, config.databaseId, config.scheduleTableId);
  const exceptions = await loadExceptions(config);
  const today = dateStringAt(new Date(), schedule.timezone);
  const start = zonedDateTime(addDays(today, -30), "00:00", schedule.timezone).toISOString();
  const future = zonedDateTime(addDays(today, schedule.maximumAdvanceDays + 1), "00:00", schedule.timezone).toISOString();
  const bookings = await listRows(config.tablesDB, config.databaseId, config.bookingsTableId, [
    Query.greaterThanEqual("startsAt", start),
    Query.lessThan("startsAt", future),
    Query.orderAsc("startsAt"),
  ]);
  return {
    schedule,
    exceptions,
    bookings,
    stats: {
      today: bookings.filter((booking) => dateStringAt(new Date(booking.startsAt), schedule.timezone) === today && ACTIVE_STATUSES.includes(booking.status)).length,
      upcoming: bookings.filter((booking) => Date.parse(booking.startsAt) >= Date.now() && ACTIVE_STATUSES.includes(booking.status)).length,
      pending: bookings.filter((booking) => booking.status === "pending").length,
    },
  };
}

async function ensureSlotAvailable(config, date, time, bookingId = "") {
  const { schedule, slots } = await resolveSlots(config, date, bookingId);
  const slot = slots.find((item) => item.time === time);
  if (!slot) throw new HttpError("That time is no longer available under the current schedule.", 409);
  return {
    schedule,
    slot,
    lockKeys: getLockKeys(date, new Date(slot.startsAt), new Date(slot.endsAt), schedule.bufferMinutes, schedule.timezone),
  };
}

async function saveSchedule(config, actor, body) {
  const schedule = validateSchedule(body.schedule);
  const rowData = { scheduleJson: JSON.stringify(schedule) };
  let previous = DEFAULT_SCHEDULE;
  try {
    const current = await config.tablesDB.getRow({
      databaseId: config.databaseId,
      tableId: config.scheduleTableId,
      rowId: SCHEDULE_ROW_ID,
    });
    previous = validateSchedule(JSON.parse(current.scheduleJson));
    await config.tablesDB.updateRow({
      databaseId: config.databaseId,
      tableId: config.scheduleTableId,
      rowId: SCHEDULE_ROW_ID,
      data: rowData,
    });
  } catch (caught) {
    if (Number(caught.code) !== 404) {
      if (caught instanceof SyntaxError) throw new HttpError("The stored schedule is invalid.", 503);
      throw caught;
    }
    await config.tablesDB.createRow({
      databaseId: config.databaseId,
      tableId: config.scheduleTableId,
      rowId: SCHEDULE_ROW_ID,
      data: rowData,
      permissions: [],
    });
  }
  await writeAudit(config, actor, {
    action: "schedule.updated",
    details: { before: previous, after: schedule },
  });
  return { schedule };
}

async function addException(config, actor, body) {
  const exception = validateException(body.exception);
  const existing = await config.tablesDB.listRows({
    databaseId: config.databaseId,
    tableId: config.exceptionsTableId,
    queries: [Query.equal("date", exception.date), Query.limit(1)],
    total: false,
    ttl: 0,
  });
  if (existing.rows.length) throw new HttpError("An exception already exists for that date. Edit or remove it first.", 409);
  const row = await config.tablesDB.createRow({
    databaseId: config.databaseId,
    tableId: config.exceptionsTableId,
    rowId: ID.unique(),
    data: exception,
    permissions: [],
  });
  await writeAudit(config, actor, {
    action: "exception.created",
    reason: exception.reason,
    details: { date: exception.date, type: exception.type },
  });
  return { exception: row };
}

async function removeException(config, actor, body) {
  if (typeof body.exceptionId !== "string" || !body.exceptionId) throw new HttpError("Choose an exception to remove.");
  const exception = await config.tablesDB.getRow({
    databaseId: config.databaseId,
    tableId: config.exceptionsTableId,
    rowId: body.exceptionId,
  });
  await config.tablesDB.deleteRow({
    databaseId: config.databaseId,
    tableId: config.exceptionsTableId,
    rowId: body.exceptionId,
  });
  await writeAudit(config, actor, {
    action: "exception.removed",
    reason: exception.reason,
    details: { date: exception.date, type: exception.type },
  });
  return { removed: true };
}

async function updateBookingStatus(config, actor, body) {
  if (typeof body.bookingId !== "string" || !body.bookingId) throw new HttpError("Choose a booking.");
  if (!["confirmed", "cancelled", "completed"].includes(body.status)) throw new HttpError("Choose a valid status.");
  const booking = await config.tablesDB.getRow({
    databaseId: config.databaseId,
    tableId: config.bookingsTableId,
    rowId: body.bookingId,
  });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (body.status === "cancelled" && reason.length < 3) throw new HttpError("Enter a cancellation reason.");
  if (booking.status === body.status) {
    if (body.status === "cancelled" || body.status === "completed") await releaseLocks(config, booking.$id);
    return { booking };
  }
  const allowed = booking.status === "pending"
    ? ["confirmed", "cancelled"]
    : booking.status === "confirmed"
      ? ["cancelled", "completed"]
      : [];
  if (!allowed.includes(body.status)) throw new HttpError("That booking status change is not allowed.", 409);
  if (body.status === "completed" && Date.parse(booking.endsAt) > Date.now()) {
    throw new HttpError("A consultation can only be marked completed after its scheduled end.", 409);
  }

  let heldKeys = [];
  if (body.status === "confirmed") {
    const schedule = await getSchedule(config.tablesDB, config.databaseId, config.scheduleTableId);
    const date = dateStringAt(new Date(booking.startsAt), schedule.timezone);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: schedule.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(booking.startsAt));
    const result = await ensureSlotAvailable(config, date, time, booking.$id);
    heldKeys = result.lockKeys;
    if (!(await acquireLocks(config, booking.$id, heldKeys))) throw new HttpError("That time is already reserved.", 409);
  }

  let updated;
  try {
    updated = await config.tablesDB.updateRow({
      databaseId: config.databaseId,
      tableId: config.bookingsTableId,
      rowId: booking.$id,
      data: {
        status: body.status,
        cancellationReason: body.status === "cancelled" ? reason : "",
      },
    });
  } catch (caught) {
    if (heldKeys.length) await releaseLocks(config, booking.$id);
    throw caught;
  }
  if (body.status === "cancelled" || body.status === "completed") await releaseLocks(config, booking.$id);
  await writeAudit(config, actor, {
    bookingId: booking.$id,
    reference: booking.reference,
    action: `booking.${body.status}`,
    fromStatus: booking.status,
    toStatus: body.status,
    reason,
  });
  return { booking: updated };
}

async function rescheduleBooking(config, actor, body) {
  return withScheduleGuard(config, async () => {
  if (typeof body.bookingId !== "string" || !body.bookingId) throw new HttpError("Choose a booking.");
  const booking = await config.tablesDB.getRow({
    databaseId: config.databaseId,
    tableId: config.bookingsTableId,
    rowId: body.bookingId,
  });
  if (!ACTIVE_STATUSES.includes(booking.status)) throw new HttpError("Only pending or confirmed bookings can be rescheduled.", 409);
  if (typeof body.date !== "string" || typeof body.time !== "string") throw new HttpError("Choose a new date and time.");
  const { schedule, slot, lockKeys } = await ensureSlotAvailable(config, body.date, body.time, booking.$id);
  const oldLocks = await listLocks(config, booking.$id);
  if (!(await acquireLocks(config, booking.$id, lockKeys))) throw new HttpError("That time is already reserved.", 409);
  const slotKey = `${body.date}T${body.time}`;
  let updated;
  try {
    updated = await config.tablesDB.updateRow({
      databaseId: config.databaseId,
      tableId: config.bookingsTableId,
      rowId: booking.$id,
      data: {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        timezone: schedule.timezone,
        slotKey,
      },
    });
  } catch (caught) {
    const keep = new Set(oldLocks.map((lock) => lock.lockKey));
    await releaseLocks(config, booking.$id, keep);
    throw caught;
  }
  await releaseLocks(config, booking.$id, new Set(lockKeys));
  await writeAudit(config, actor, {
    bookingId: booking.$id,
    reference: booking.reference,
    action: "booking.rescheduled",
    fromStatus: booking.status,
    toStatus: booking.status,
    reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "",
    details: { previousStartsAt: booking.startsAt, startsAt: slot.startsAt },
  });
  return { booking: updated };
  });
}

export default async ({ req, res, error }) => {
  const origin = req.headers.origin;
  try {
    if (!isAllowedOrigin(origin)) throw new HttpError("Origin is not allowed.", 403);
    if (req.method !== "POST") throw new HttpError("Method not allowed.", 405);
    const actor = await authorize(req);
    const config = getConfig(req);
    const body = readBody(req);
    let result;
    switch (body.action) {
      case "dashboard":
        result = { user: { id: actor.$id, name: actor.name, email: actor.email }, ...(await getDashboard(config)) };
        break;
      case "list-bookings":
        result = { bookings: await listBookings(config, body) };
        break;
      case "save-schedule":
        result = await withScheduleGuard(config, () => saveSchedule(config, actor, body));
        break;
      case "add-exception":
        result = await withScheduleGuard(config, () => addException(config, actor, body));
        break;
      case "remove-exception":
        result = await withScheduleGuard(config, () => removeException(config, actor, body));
        break;
      case "available-slots": {
        const { slots } = await resolveSlots(config, body.date, body.bookingId || "");
        result = { date: body.date, slots };
        break;
      }
      case "booking-status":
        result = body.status === "confirmed"
          ? await withScheduleGuard(config, () => updateBookingStatus(config, actor, body))
          : await updateBookingStatus(config, actor, body);
        break;
      case "reschedule":
        result = await rescheduleBooking(config, actor, body);
        break;
      default:
        throw new HttpError("Choose a valid admin action.");
    }
    return json(res, result, 200, origin);
  } catch (caught) {
    error(`admin-api failed: ${caught.message}`);
    const status = caught instanceof HttpError
      ? caught.status
      : caught instanceof SyntaxError
        ? 400
        : 503;
    return json(res, {
      error: caught instanceof HttpError || caught instanceof SyntaxError
        ? caught.message
        : "The admin request could not be completed.",
      code: status,
    }, status, origin);
  }
};
