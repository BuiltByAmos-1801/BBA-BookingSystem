import { Client, Functions, ExecutionMethod } from "appwrite";

const requiredConfig = {
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT,
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID,
  availableSlotsFunctionId: import.meta.env
    .VITE_APPWRITE_AVAILABLE_SLOTS_FUNCTION_ID,
  createBookingFunctionId: import.meta.env
    .VITE_APPWRITE_CREATE_BOOKING_FUNCTION_ID,
};

export const missingConfig = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const client = new Client();
if (requiredConfig.endpoint) client.setEndpoint(requiredConfig.endpoint);
if (requiredConfig.projectId) client.setProject(requiredConfig.projectId);

const functions = new Functions(client);

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

export function requestAvailableSlots(date) {
  return execute(requiredConfig.availableSlotsFunctionId, { date }).then((result) => {
    const validSlots =
      Array.isArray(result.slots) &&
      result.slots.every((slot) =>
        typeof slot.time === "string" &&
        /^(?:10|11|12|13|14|15|16|17):(?:00|30)$/.test(slot.time) &&
        typeof slot.startsAt === "string" &&
        Number.isFinite(Date.parse(slot.startsAt)),
      );
    if (result.date !== date || result.timezone !== "Asia/Kolkata" || !validSlots) {
      throw new Error("The availability service returned invalid data. Please try again.");
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
      saved.timezone !== "Asia/Kolkata" ||
      saved.status !== "confirmed"
    ) {
      throw new Error("The booking service returned an invalid confirmation. Please contact the agency.");
    }
    return result;
  });
}
