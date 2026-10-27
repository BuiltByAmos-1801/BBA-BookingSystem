import { Account, Client, Functions, ExecutionMethod } from "appwrite";

const requiredConfig = {
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT,
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID,
  availableSlotsFunctionId: import.meta.env
    .VITE_APPWRITE_AVAILABLE_SLOTS_FUNCTION_ID,
  createBookingFunctionId: import.meta.env
    .VITE_APPWRITE_CREATE_BOOKING_FUNCTION_ID,
};
export const adminFunctionId = import.meta.env.VITE_APPWRITE_ADMIN_FUNCTION_ID;

export const missingConfig = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const client = new Client();
if (requiredConfig.endpoint) client.setEndpoint(requiredConfig.endpoint);
if (requiredConfig.projectId) client.setProject(requiredConfig.projectId);

const functions = new Functions(client);
export const account = new Account(client);

export const missingAdminConfig = [
  ...missingConfig,
  ...(!adminFunctionId ? ["adminFunctionId"] : []),
];

function parseExecution(execution) {
  const status = execution.responseStatusCode ?? execution.statusCode;
  let payload;

  try {
    payload = JSON.parse(execution.responseBody || "{}");
  } catch {
    throw new Error("The booking service returned an unreadable response.");
  }

  if (status < 200 || status >= 300 || payload.error) {
    const error = new Error(payload.error || "The booking request could not be completed.");
    error.code = payload.code || status;
    throw error;
  }

  return payload;
}

async function execute(functionId, body) {
  if (missingConfig.length) {
    throw new Error("Booking is not configured yet. Please contact the agency.");
  }

  const execution = await functions.createExecution({
    functionId,
    body: JSON.stringify(body),
    async: false,
    method: ExecutionMethod.POST,
  });

  return parseExecution(execution);
}

export function requestBookingConfig() {
  return execute(requiredConfig.availableSlotsFunctionId, { action: "config" }).then((result) => {
    if (
      typeof result.timezone !== "string" ||
      !Number.isInteger(result.slotDuration) ||
      !Number.isInteger(result.maximumAdvanceDays) ||
      !Array.isArray(result.availableWeekdays) ||
      !result.availableWeekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
      !Array.isArray(result.specialDates) ||
      !Array.isArray(result.blockedDates)
    ) {
      throw new Error("The availability service returned invalid booking settings.");
    }
    return result;
  });
}

export function requestAvailableSlots(date) {
  return execute(requiredConfig.availableSlotsFunctionId, { date }).then((result) => {
    const validSlots =
      Array.isArray(result.slots) &&
      result.slots.every((slot) =>
        typeof slot.time === "string" &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.time) &&
        typeof slot.startsAt === "string" &&
        Number.isFinite(Date.parse(slot.startsAt)) &&
        typeof slot.endsAt === "string" &&
        Number.isFinite(Date.parse(slot.endsAt)),
      );
    if (result.date !== date || typeof result.timezone !== "string" || !validSlots) {
        throw new Error(
          "The Appwrite availability Function is not deployed with the booking code yet. Deploy the updated Function and try again.",
        );
      }
    return result;
  });
}

export function submitBooking(booking) {
  return execute(requiredConfig.createBookingFunctionId, booking).then((result) => {
    const saved = result.booking;
    if (
      !saved ||
      typeof saved.reference !== "string" ||
      !/^BBA-[A-F0-9]{10}$/.test(saved.reference) ||
      saved.service !== booking.service ||
      !Number.isFinite(Date.parse(saved.startsAt)) ||
      saved.timezone !== booking.timezone ||
      saved.status !== "confirmed"
    ) {
      throw new Error("The booking service returned an invalid confirmation. Please contact the agency.");
    }
    return result;
  });
}

export async function requestAdminAction(body) {
  if (missingAdminConfig.length) {
    throw new Error("Admin services are not configured. Complete the VITE_APPWRITE_ADMIN_FUNCTION_ID setting.");
  }
  const execution = await functions.createExecution({
    functionId: adminFunctionId,
    body: JSON.stringify(body),
    async: false,
    method: ExecutionMethod.POST,
  });
  return parseExecution(execution);
}
