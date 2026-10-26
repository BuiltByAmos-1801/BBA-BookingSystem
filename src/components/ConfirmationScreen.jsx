import { SERVICES } from "../services/bookingService.js";

export default function ConfirmationScreen({ booking, onStartOver }) {
  const service = SERVICES.find((item) => item.id === booking.service);
  const date = new Date(booking.startsAt).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const time = new Date(booking.startsAt).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  return (
    <main className="confirmation-wrap">
      <div className="confirmation-card">
        <div className="confirmation-check" aria-hidden="true">✓</div>
        <p className="eyebrow">BOOKING CONFIRMED</p>
        <h1>We look forward to talking.</h1>
        <p className="confirmation-intro">Your consultation is reserved. Keep your reference handy.</p>
        <div className="confirmation-details">
          <div><span>When</span><strong>{date}<br />{time} IST</strong></div>
          <div><span>Service</span><strong>{service?.title || booking.service}</strong></div>
          <div><span>Duration</span><strong>30 minutes</strong></div>
          <div><span>Reference</span><strong className="reference-code">{booking.reference}</strong></div>
        </div>
        <p className="confirmation-note">
          No email has been sent. Please save this confirmation or note your reference.
        </p>
        <button className="text-button" type="button" onClick={onStartOver}>Return to booking</button>
      </div>
    </main>
  );
}
