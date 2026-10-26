import { randomBytes } from "node:crypto";
import { Client, ID, Query, TablesDB } from "node-appwrite";

const TIMEZONE = "Asia/Kolkata";
const SLOT_MINUTES = 30;
const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
const SERVICES = new Set([
  "website-development",
  "ecommerce-website",
  "mobile-app-development",
  "custom-software-automation",
]);

function json(res, body, statusCode, origin) {
  const headers = { "Cache-Control": "no-store" };
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
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

function sanitize(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, maxLength + 1);
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

function getSlot(dateString, time) {
  if (!/^(?:10|11|12|13|14|15|16|17):(?:00|30)$/.test(time)) return null;
  const date = parseDate(dateString);
  if (!date || date.getUTCDay() === 0) return null;
  const startsAt = new Date(`${dateString}T${time}:00+05:30`);
  if (!Number.isFinite(startsAt.getTime())) return null;
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000),
  };
}

function getConfig(req) {
  const names = [
    "APPWRITE_DATABASE_ID",
    "APPWRITE_BOOKINGS_TABLE_ID",
  ];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing Function environment variables: ${missing.join(", ")}`);
  const turnstileEnabled = process.env.TURNSTILE_ENABLED;
  if (turnstileEnabled !== "true" && turnstileEnabled !== "false") {
    throw new Error("TURNSTILE_ENABLED must be explicitly set to true or false");
  }
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
  const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || "";
  if (
    turnstileEnabled === "true" &&
    (!turnstileSiteKey || !turnstileSecretKey)
  ) {
    throw new Error("Turnstile is enabled but its site key or secret is missing");
  }
  if (
    turnstileEnabled === "false" &&
    (turnstileSiteKey || turnstileSecretKey)
  ) {
    throw new Error("Turnstile keys are configured while TURNSTILE_ENABLED is false");
  }
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const functionKey = req.headers["x-appwrite-key"];
  if (!endpoint || !projectId || !functionKey) {
    throw new Error("Appwrite Function runtime authentication is unavailable");
  }
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(functionKey);
  return {
    tablesDB: new TablesDB(client),
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tableId: process.env.APPWRITE_BOOKINGS_TABLE_ID,
    turnstileEnabled: turnstileEnabled === "true",
    turnstileSecretKey,
  };
}

function readBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  if (typeof req.bodyText === "string") return JSON.parse(req.bodyText);
  throw new Error("Invalid request body");
}

function validateCustomer(body) {
  const customerName = sanitize(body.customerName, 120);
  const customerEmail = sanitize(body.customerEmail, 254).toLowerCase();
  const customerPhone = sanitize(body.customerPhone, 32);
  const businessName = sanitize(body.businessName, 120);
  const projectBrief = sanitize(body.projectBrief, 2000);

  if (customerName.length < 2 || customerName.length > 120) {
    return { error: "Enter your full name (2–120 characters)." };
  }
  if (
    customerEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customerEmail)
  ) {
    return { error: "Enter a valid email address." };
  }
  if (customerPhone && (
    customerPhone.length < 7 ||
    customerPhone.length > 32 ||
    !/^[0-9+().\-\s]+$/.test(customerPhone)
  )) {
    return { error: "Enter a valid phone or WhatsApp number." };
  }
  if (businessName.length > 120 || projectBrief.length > 2000) {
    return { error: "One of the optional fields is too long." };
  }
  return { customerName, customerEmail, customerPhone, businessName, projectBrief };
}

async function verifyTurnstile(token, clientIp, secretKey) {
  if (typeof token !== "string" || token.length < 10 || token.length > 2048) return false;
  const form = new URLSearchParams({
    secret: secretKey,
    response: token,
  });
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
    if (body.timezone !== TIMEZONE) {
      return json(res, { error: "The selected timezone is not supported.", code: 400 }, 400, origin);
    }

    const customer = validateCustomer(body);
    if (customer.error) return json(res, { error: customer.error, code: 400 }, 400, origin);
    if (!SERVICES.has(body.service)) {
      return json(res, { error: "Choose a valid consultation service.", code: 400 }, 400, origin);
    }

    const slot = getSlot(body.date, body.time);
    if (!slot) {
      return json(res, { error: "Choose a valid weekday time between 10:00 AM and 6:00 PM IST.", code: 400 }, 400, origin);
    }
    const todayString = istDateString(new Date());
    const today = parseDate(todayString);
    const latestDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const latestDateString = [
      latestDate.getUTCFullYear(),
      String(latestDate.getUTCMonth() + 1).padStart(2, "0"),
      String(latestDate.getUTCDate()).padStart(2, "0"),
    ].join("-");
    if (body.date < todayString || body.date > latestDateString) {
      return json(res, { error: "Choose a date within the next 30 days.", code: 400 }, 400, origin);
    }
    if (slot.startsAt.getTime() < Date.now() + MIN_NOTICE_MS) {
      return json(res, { error: "Bookings require at least two hours’ notice.", code: 400 }, 400, origin);
    }

    const {
      tablesDB,
      databaseId,
      tableId,
      turnstileEnabled,
      turnstileSecretKey,
    } = getConfig(req);
    if (turnstileEnabled) {
      const captchaValid = await verifyTurnstile(
        body.turnstileToken,
        req.headers["x-appwrite-client-ip"],
        turnstileSecretKey,
      );
      if (!captchaValid) {
        return json(res, { error: "Security verification failed. Please try again.", code: 400 }, 400, origin);
      }
    } else if (body.turnstileToken) {
      return json(res, { error: "Turnstile is disabled on the booking service.", code: 503 }, 503, origin);
    }

    const dayStart = new Date(`${body.date}T00:00:00+05:30`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const existing = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [
        Query.equal("status", "confirmed"),
        Query.greaterThanEqual("startsAt", dayStart.toISOString()),
        Query.lessThan("startsAt", dayEnd.toISOString()),
        Query.limit(100),
      ],
      total: false,
      ttl: 0,
    });
    const overlaps = existing.rows.some((booking) =>
      new Date(booking.startsAt).getTime() < slot.endsAt.getTime() &&
      new Date(booking.endsAt).getTime() > slot.startsAt.getTime(),
    );
    if (overlaps) {
      return json(res, { error: "That time was just booked. Please choose another.", code: 409 }, 409, origin);
    }

    const reference = `BBA-${randomBytes(5).toString("hex").toUpperCase()}`;
    const slotKey = `${body.date}T${body.time}`;
    let booking;
    try {
      booking = await tablesDB.createRow({
        databaseId,
        tableId,
        rowId: ID.unique(),
        data: {
          ...customer,
          service: body.service,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          timezone: TIMEZONE,
          status: "confirmed",
          reference,
          slotKey,
          createdAt: new Date().toISOString(),
        },
        permissions: [],
      });
    } catch (writeError) {
      if (Number(writeError.code) === 409) {
        const sameSlot = await tablesDB.listRows({
          databaseId,
          tableId,
          queries: [
            Query.equal("slotKey", slotKey),
            Query.equal("status", "confirmed"),
            Query.limit(1),
          ],
          total: false,
          ttl: 0,
        });
        if (sameSlot.rows.length > 0) {
          return json(res, { error: "That time was just booked. Please choose another.", code: 409 }, 409, origin);
        }
      }
      throw writeError;
    }

    return json(
      res,
      {
        booking: {
          reference: booking.reference,
          service: booking.service,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          timezone: booking.timezone,
          status: booking.status,
        },
      },
      201,
      origin,
    );
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
