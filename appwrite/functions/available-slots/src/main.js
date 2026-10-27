import { Client, Query, TablesDB } from "node-appwrite";
import {
  DEFAULT_SCHEDULE,
  dateStringAt,
  getAvailableSlots,
  parseDate,
  validateSchedule,
  zonedDateTime,
} from "../../shared/schedule.js";
import adminApi from "../../admin-api/src/main.js";

const ACTIVE_STATUSES = ["confirmed", "pending"];

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
  const rawBody = typeof req.body === "string" ? req.body : req.bodyText;
  const body = req.bodyJson && typeof req.bodyJson === "object"
    ? req.bodyJson
    : typeof rawBody === "string"
      ? JSON.parse(rawBody)
      : null;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body");
  return body;
}

function getConfig(req) {
  const required = [
    "APPWRITE_DATABASE_ID",
    "APPWRITE_BOOKINGS_TABLE_ID",
  ];
  const missing = required.filter((name) => !process.env[name]);
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const functionKey = req.headers["x-appwrite-key"];
  if (missing.length || !endpoint || !projectId || !functionKey) {
    throw new Error(`Function database/runtime configuration is incomplete${missing.length ? `: ${missing.join(", ")}` : ""}`);
  }
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(functionKey);
  return {
    tablesDB: new TablesDB(client),
    databaseId: process.env.APPWRITE_DATABASE_ID,
    bookingsTableId: process.env.APPWRITE_BOOKINGS_TABLE_ID,
    scheduleTableId: process.env.APPWRITE_SCHEDULE_TABLE_ID,
    exceptionsTableId: process.env.APPWRITE_EXCEPTIONS_TABLE_ID,
    locksTableId: process.env.APPWRITE_SLOT_LOCKS_TABLE_ID,
  };
}

async function getSchedule(tablesDB, databaseId, tableId) {
  if (!tableId) return DEFAULT_SCHEDULE;
  try {
    const row = await tablesDB.getRow({ databaseId, tableId, rowId: "weekly-settings" });
    return validateSchedule(JSON.parse(row.scheduleJson));
  } catch (caught) {
    if (Number(caught.code) === 404) return DEFAULT_SCHEDULE;
    throw caught;
  }
}

async function getRowsForDate(config, date, timezone) {
  const dayStart = zonedDateTime(date, "00:00", timezone);
  const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const dayEnd = zonedDateTime(nextDate, "00:00", timezone);
  if (!dayStart || !dayEnd) throw new Error("Invalid availability date or timezone");
  const [bookings, exceptions, locks] = await Promise.all([
    config.tablesDB.listRows({
      databaseId: config.databaseId,
      tableId: config.bookingsTableId,
      queries: [
        Query.equal("status", ACTIVE_STATUSES),
        Query.greaterThanEqual("startsAt", dayStart.toISOString()),
        Query.lessThan("startsAt", dayEnd.toISOString()),
        Query.limit(100),
      ],
      total: false,
      ttl: 0,
    }),
    config.exceptionsTableId ? config.tablesDB.listRows({
      databaseId: config.databaseId,
      tableId: config.exceptionsTableId,
      queries: [Query.equal("date", date), Query.limit(100)],
      total: false,
      ttl: 0,
    }) : Promise.resolve({ rows: [] }),
    config.locksTableId ? config.tablesDB.listRows({
      databaseId: config.databaseId,
      tableId: config.locksTableId,
      queries: [Query.startsWith("lockKey", `${date}T`), Query.limit(500)],
      total: false,
      ttl: 0,
    }) : Promise.resolve({ rows: [] }),
  ]);
  return { bookings: bookings.rows, exceptions: exceptions.rows, locks: locks.rows };
}

export default async ({ req, res, error }) => {
  const origin = req.headers.origin;
  if (typeof req.bodyJson?.action === "string" && req.bodyJson.action !== "config") {
    return adminApi({ req, res, error });
  }
  try {
    if (!isAllowedOrigin(origin)) return json(res, { error: "Origin is not allowed.", code: 403 }, 403, origin);
    if (req.method !== "POST") return json(res, { error: "Method not allowed.", code: 405 }, 405, origin);

    const body = readBody(req);
    const config = getConfig(req);
    const schedule = await getSchedule(config.tablesDB, config.databaseId, config.scheduleTableId);
    if (body.action === "config") {
      const exceptions = config.exceptionsTableId ? await config.tablesDB.listRows({
        databaseId: config.databaseId,
        tableId: config.exceptionsTableId,
        queries: [Query.limit(500)],
        total: false,
        ttl: 0,
      }) : { rows: [] };
      return json(res, {
        timezone: schedule.timezone,
        slotDuration: schedule.slotDuration,
        maximumAdvanceDays: schedule.maximumAdvanceDays,
        availableWeekdays: schedule.weeklyHours.filter((hours) => hours.enabled).map((hours) => hours.day),
        specialDates: exceptions.rows.filter((item) => item.type === "special-hours").map((item) => item.date),
        blockedDates: exceptions.rows.filter((item) => item.type === "full-day").map((item) => item.date),
      }, 200, origin);
    }

    const date = body.date;
    const parsedDate = parseDate(date);
    if (!parsedDate) return json(res, { error: "Choose a valid date.", code: 400 }, 400, origin);
    const today = dateStringAt(new Date(), schedule.timezone);
    const todayDate = parseDate(today);
    const latestDate = new Date(todayDate.getTime() + schedule.maximumAdvanceDays * 86_400_000);
    if (parsedDate < todayDate || parsedDate > latestDate) {
      return json(res, { error: "That date is outside the configured booking window.", code: 400 }, 400, origin);
    }

    const data = await getRowsForDate(config, date, schedule.timezone);
    const slots = getAvailableSlots(date, schedule, data.exceptions, data.bookings, data.locks);
    return json(res, { date, timezone: schedule.timezone, slots }, 200, origin);
  } catch (caught) {
    error(`available-slots failed: ${caught.message}`);
    const status = caught instanceof SyntaxError || caught.message === "Invalid request body" ? 400 : 503;
    return json(
      res,
      {
        error: status === 400
          ? "Send a valid availability request."
          : "Availability is temporarily unavailable. Please try again.",
        code: status,
      },
      status,
      origin,
    );
  }
};
