import { SERVICES } from "../services/bookingService.js";

export default function BookingSummary({ service, date, time }) {
  const selectedService = SERVICES.find((item) => item.id === service);
  const formattedDate = date
    ? new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : null;

  return (
    <aside className="summary-card" aria-label="Booking summary">
      <div className="summary-topline"><span>YOUR SESSION</span><span>FREE</span></div>
      <h3>Introductory consultation</h3>
      <p className="summary-duration">30 minutes · Video or phone</p>
      <div className="summary-divider" />
      <dl>
        <div><dt>Service</dt><dd>{selectedService?.title || "Choose a service"}</dd></div>
        <div><dt>Date</dt><dd>{formattedDate || "Choose a date"}</dd></div>
        <div><dt>Time</dt><dd>{time ? `${time} IST` : "Choose a time"}</dd></div>
      </dl>
      <p className="summary-footnote">Monday–Saturday · 10:00 AM–6:00 PM IST</p>
    </aside>
  );
}
