import { Client, Query, TablesDB } from "node-appwrite";

const TIMEZONE = "Asia/Kolkata";
const DAY_START_MINUTES = 10 * 60;
const DAY_END_MINUTES = 18 * 60;
const SLOT_MINUTES = 30;
const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;

function json(res, body, statusCode, origin) {
  const headers = { "Cache-Control": "no-store" };
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return res.json(body, statusCode, headers);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(origin);
}

function parseDate(value) {
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

function istDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getRangeDate() {
  const today = istDateString(new Date());
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 30));
}

function getConfig() {
  const names = [
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
    "APPWRITE_DATABASE_ID",
    "APPWRITE_BOOKINGS_TABLE_ID",
  ];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing Function environment variables: ${missing.join(", ")}`);
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return {
    tablesDB: new TablesDB(client),
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tableId: process.env.APPWRITE_BOOKINGS_TABLE_ID,
  };
}

function readBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  if (typeof req.bodyText === "string") return JSON.parse(req.bodyText);
  throw new Error("Invalid request body");
}

export default async ({ req, res, error }) => {
  const origin = req.headers.origin;
  try {
    if (!isAllowedOrigin(origin)) {
      return json(res, { error: "Origin is not allowed.", code: 403 }, 403, origin);
    }
    if (req.method !== "POST") {
      return json(res, { error: "Method not allowed.", code: 405 }, 405, origin);
    }

    const body = readBody(req);
    const date = parseDate(body.date);
    if (!date) return json(res, { error: "Choose a valid date.", code: 400 }, 400, origin);

    const todayString = istDateString(new Date());
    const today = parseDate(todayString);
    const maxDate = getRangeDate();
    if (date < today || date > maxDate || date.getUTCDay() === 0) {
      return json(res, { error: "That date is outside the available booking window.", code: 400 }, 400, origin);
    }

    const dateStart = new Date(`${body.date}T00:00:00+05:30`);
    const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);
    const { tablesDB, databaseId, tableId } = getConfig();
    const result = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [
        Query.equal("status", "confirmed"),
        Query.greaterThanEqual("startsAt", dateStart.toISOString()),
        Query.lessThan("startsAt", dateEnd.toISOString()),
        Query.limit(100),
      ],
      ttl: 0,
    });

    const occupied = new Set(
      result.rows.map((booking) => new Date(booking.startsAt).getTime()),
    );
    const now = Date.now();
    const slots = [];
    for (let minute = DAY_START_MINUTES; minute < DAY_END_MINUTES; minute += SLOT_MINUTES) {
      const hour = String(Math.floor(minute / 60)).padStart(2, "0");
      const mins = String(minute % 60).padStart(2, "0");
      const time = `${hour}:${mins}`;
      const startsAt = new Date(`${body.date}T${time}:00+05:30`);
      const startMs = startsAt.getTime();
      if (startMs < now + MIN_NOTICE_MS || occupied.has(startMs)) continue;
      slots.push({ time, startsAt: startsAt.toISOString() });
    }

    return json(res, { date: body.date, timezone: TIMEZONE, slots }, 200, origin);
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
