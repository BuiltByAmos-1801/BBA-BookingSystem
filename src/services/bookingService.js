import { requestAvailableSlots, requestBookingConfig, submitBooking } from "../lib/appwrite.js";

export const SERVICES = [
  {
    id: "website-development",
    title: "Website Development",
    description: "A polished, high-performing website built around your goals.",
    icon: "◫",
  },
  {
    id: "ecommerce-website",
    title: "E-commerce Website",
    description: "A considered online store made to turn visits into sales.",
    icon: "↗",
  },
  {
    id: "mobile-app-development",
    title: "Mobile App Development",
    description: "Useful mobile experiences for the way your customers work.",
    icon: "▯",
  },
  {
    id: "custom-software-automation",
    title: "Custom Software & Automation",
    description: "Thoughtful software that simplifies your day-to-day work.",
    icon: "⌘",
  },
];

export function getAvailableSlots(date) {
  return requestAvailableSlots(date);
}

export function getBookingConfig() {
  return requestBookingConfig();
}

export function createBooking(payload) {
  return submitBooking(payload);
}
