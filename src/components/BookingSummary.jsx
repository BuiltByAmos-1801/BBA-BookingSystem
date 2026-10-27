import { SERVICES } from "../services/bookingService.js";

export default function BookingSummary({ service, date, time, duration = 30, timezone = "Asia/Kolkata" }) {
  const selectedService = SERVICES.find((item) => item.id === service);
  const formattedDate = date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: timezone,
      })
    : null;

  return (
    <aside className="summary-card" aria-label="Booking summary">
      <div className="summary-topline"><span>YOUR SESSION</span><span>FREE</span></div>
      <h3>Introductory consultation</h3>
      <p className="summary-duration">{duration} minutes · Video or phone</p>
      <div className="summary-divider" />
      <dl>
        <div><dt>Service</dt><dd>{selectedService?.title || "Choose a service"}</dd></div>
        <div><dt>Date</dt><dd>{formattedDate || "Choose a date"}</dd></div>
        <div><dt>Time</dt><dd>{time ? `${time} ${timezone}` : "Choose a time"}</dd></div>
      </dl>
      <p className="summary-footnote">Times shown in {timezone}.</p>
    </aside>
  );
}
