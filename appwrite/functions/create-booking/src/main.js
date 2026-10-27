import { randomBytes } from "node:crypto";
import { Client, ID, Query, TablesDB } from "node-appwrite";
import {
  DEFAULT_SCHEDULE,
  dateStringAt,
  getAvailableSlots,
  getLockKeys,
  parseDate,
  validateSchedule,
  zonedDateTime,
} from "../../shared/schedule.js";

const ACTIVE_STATUSES = ["confirmed", "pending"];
const SCHEDULE_GUARD_KEY = "__schedule_guard__";
const SERVICES = new Set([
  "website-development",
  "ecommerce-website",
  "mobile-app-development",
  "custom-software-automation",
]);

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

function sanitize(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, maxLength + 1);
}

function readBody(req) {
  const body = req.bodyJson && typeof req.bodyJson === "object"
    ? req.bodyJson
    : typeof req.bodyText === "string"
      ? JSON.parse(req.bodyText)
      : null;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body");
  return body;
}

function validateCustomer(body) {
  const customerName = sanitize(body.customerName, 120);
  const customerEmail = sanitize(body.customerEmail, 254).toLowerCase();
  const customerPhone = sanitize(body.customerPhone, 32);
  const businessName = sanitize(body.businessName, 120);
  const projectBrief = sanitize(body.projectBrief, 2000);
  if (customerName.length < 2 || customerName.length > 120) return { error: "Enter your full name (2–120 characters)." };
  if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customerEmail)) return { error: "Enter a valid email address." };
  if (customerPhone && (
    customerPhone.length < 7 ||
    customerPhone.length > 32 ||
    !/^[0-9+().\-\s]+$/.test(customerPhone)
  )) return { error: "Enter a valid phone or WhatsApp number." };
  if (businessName.length > 120 || projectBrief.length > 2000) return { error: "One of the optional fields is too long." };
  return { customerName, customerEmail, customerPhone, businessName, projectBrief };
}

async function verifyTurnstile(token, clientIp, secretKey) {
  if (typeof token !== "string" || token.length < 10 || token.length > 2048) return false;
  const form = new URLSearchParams({ secret: secretKey, response: token });
  if (clientIp) form.set("remoteip", clientIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Turnstile verification returned ${response.status}`);
  const result = await response.json();
  return result.success === true;
}

function getConfig(req) {
  const required = [
    "APPWRITE_DATABASE_ID",
    "APPWRITE_BOOKINGS_TABLE_ID",
    "APPWRITE_SCHEDULE_TABLE_ID",
    "APPWRITE_EXCEPTIONS_TABLE_ID",
    "APPWRITE_SLOT_LOCKS_TABLE_ID",
  ];
  const missing = required.filter((name) => !process.env[name]);
  const turnstileEnabled = process.env.TURNSTILE_ENABLED;
  if (turnstileEnabled !== "true" && turnstileEnabled !== "false") throw new Error("TURNSTILE_ENABLED must be explicitly set to true or false");
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
  const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || "";
  if (turnstileEnabled === "true" && (!turnstileSiteKey || !turnstileSecretKey)) {
    throw new Error("Turnstile is enabled but its site key or secret is missing");
  }
  if (turnstileEnabled === "false" && (turnstileSiteKey || turnstileSecretKey)) {
    throw new Error("Turnstile keys are configured while TURNSTILE_ENABLED is false");
  }
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
    turnstileEnabled: turnstileEnabled === "true",
    turnstileSecretKey,
  };
}

async function getSchedule(tablesDB, databaseId, tableId) {
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
  if (!dayStart || !dayEnd) throw new Error("Invalid booking date or timezone");
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
    config.tablesDB.listRows({
      databaseId: config.databaseId,
      tableId: config.exceptionsTableId,
      queries: [Query.equal("date", date), Query.limit(100)],
      total: false,
      ttl: 0,
    }),
    config.tablesDB.listRows({
      databaseId: config.databaseId,
      tableId: config.locksTableId,
      queries: [Query.startsWith("lockKey", `${date}T`), Query.limit(500)],
      total: false,
      ttl: 0,
    }),
  ]);
  return { bookings: bookings.rows, exceptions: exceptions.rows, locks: locks.rows };
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
      await deleteLockRows(config, created);
      return false;
    }
  }
  return true;
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

async function releaseScheduleGuard(config, bookingId) {
  const result = await config.tablesDB.listRows({
    databaseId: config.databaseId,
    tableId: config.locksTableId,
    queries: [Query.equal("bookingId", bookingId), Query.equal("lockKey", SCHEDULE_GUARD_KEY), Query.limit(1)],
    total: false,
    ttl: 0,
  });
  await deleteLockRows(config, result.rows.map((lock) => lock.$id));
}

export default async ({ req, res, error }) => {
  const origin = req.headers.origin;
  try {
    if (!isAllowedOrigin(origin)) return json(res, { error: "Origin is not allowed.", code: 403 }, 403, origin);
    if (req.method !== "POST") return json(res, { error: "Method not allowed.", code: 405 }, 405, origin);
    const body = readBody(req);
    if (typeof body.timezone !== "string") return json(res, { error: "The selected timezone is not supported.", code: 400 }, 400, origin);

    const customer = validateCustomer(body);
    if (customer.error) return json(res, { error: customer.error, code: 400 }, 400, origin);
    if (!SERVICES.has(body.service)) return json(res, { error: "Choose a valid consultation service.", code: 400 }, 400, origin);
    if (!parseDate(body.date) || typeof body.time !== "string") return json(res, { error: "Choose a valid date and available time.", code: 400 }, 400, origin);

    const config = getConfig(req);
    if (config.turnstileEnabled) {
      const valid = await verifyTurnstile(
        body.turnstileToken,
        req.headers["x-appwrite-client-ip"],
        config.turnstileSecretKey,
      );
      if (!valid) return json(res, { error: "Security verification failed. Please try again.", code: 400 }, 400, origin);
    } else if (body.turnstileToken) {
      return json(res, { error: "Turnstile is disabled on the booking service.", code: 503 }, 503, origin);
    }

    const bookingId = ID.unique();
    if (!(await acquireLocks(config, bookingId, [SCHEDULE_GUARD_KEY]))) {
      return json(res, { error: "A booking or schedule update is in progress. Please retry.", code: 409 }, 409, origin);
    }

    try {
      const schedule = await getSchedule(config.tablesDB, config.databaseId, config.scheduleTableId);
      if (body.timezone !== schedule.timezone) {
        return json(res, { error: "The selected timezone is not supported.", code: 400 }, 400, origin);
      }
      const today = parseDate(dateStringAt(new Date(), schedule.timezone));
      const requestedDate = parseDate(body.date);
      const lastDate = new Date(today.getTime() + schedule.maximumAdvanceDays * 86_400_000);
      if (requestedDate < today || requestedDate > lastDate) {
        return json(res, { error: "Choose a date within the configured booking window.", code: 400 }, 400, origin);
      }
      const data = await getRowsForDate(config, body.date, schedule.timezone);
      const slots = getAvailableSlots(body.date, schedule, data.exceptions, data.bookings, data.locks);
      const slot = slots.find((item) => item.time === body.time);
      if (!slot) return json(res, { error: "That time was just booked or is outside the configured schedule.", code: 409 }, 409, origin);

      const lockKeys = getLockKeys(
        body.date,
        new Date(slot.startsAt),
        new Date(slot.endsAt),
        schedule.bufferMinutes,
        schedule.timezone,
      );
      if (!(await acquireLocks(config, bookingId, lockKeys))) {
        return json(res, { error: "That time was just booked. Please choose another.", code: 409 }, 409, origin);
      }

      const reference = `BBA-${randomBytes(5).toString("hex").toUpperCase()}`;
      let booking;
      try {
        booking = await config.tablesDB.createRow({
          databaseId: config.databaseId,
          tableId: config.bookingsTableId,
          rowId: bookingId,
          data: {
            ...customer,
            service: body.service,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            timezone: schedule.timezone,
            status: "confirmed",
            reference,
            slotKey: `${body.date}T${body.time}`,
            createdAt: new Date().toISOString(),
          },
          permissions: [],
        });
      } catch (caught) {
        await deleteLockRows(config, (await config.tablesDB.listRows({
          databaseId: config.databaseId,
          tableId: config.locksTableId,
          queries: [Query.equal("bookingId", bookingId), Query.limit(100)],
          total: false,
          ttl: 0,
        })).rows.map((lock) => lock.$id));
        throw caught;
      }

      return json(res, {
        booking: {
          reference: booking.reference,
          service: booking.service,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          timezone: booking.timezone,
          status: booking.status,
        },
      }, 201, origin);
    } finally {
      await releaseScheduleGuard(config, bookingId);
    }
  } catch (caught) {
    error(`create-booking failed: ${caught.message}`);
    const status = caught instanceof SyntaxError || caught.message === "Invalid request body" ? 400 : 503;
    return json(
      res,
      {
        error: status === 400
          ? "Send a valid booking request."
          : "We could not confirm the booking. Please try again.",
        code: status,
      },
      status,
      origin,
    );
  }
};
