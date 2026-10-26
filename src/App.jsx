import { useEffect, useMemo, useState } from "react";
import BookingCalendar from "./components/BookingCalendar.jsx";
import BookingSummary from "./components/BookingSummary.jsx";
import ConfirmationScreen from "./components/ConfirmationScreen.jsx";
import CustomerForm from "./components/CustomerForm.jsx";
import Header from "./components/Header.jsx";
import ServiceSelector from "./components/ServiceSelector.jsx";
import TimeSlotPicker from "./components/TimeSlotPicker.jsx";
import TurnstileWidget from "./components/TurnstileWidget.jsx";
import { createBooking, getAvailableSlots } from "./services/bookingService.js";
import { missingConfig } from "./lib/appwrite.js";

const EMPTY_CUSTOMER = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  businessName: "",
  projectBrief: "",
};

function istDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return istDateString(date);
}

export default function App() {
  const [service, setService] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [bookingError, setBookingError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [today, setToday] = useState(() => istDateString(new Date()));
  const maxDate = useMemo(() => shiftDate(today, 30), [today]);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const timer = window.setInterval(() => setToday(istDateString(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedDate) return undefined;
    let active = true;
    setLoadingSlots(true);
    setAvailabilityError("");
    setSelectedTime("");
    getAvailableSlots(selectedDate)
      .then((result) => {
        if (active) setSlots(result.slots);
      })
      .catch((error) => {
        if (active) {
          setSlots([]);
          setAvailabilityError(error.message || "Availability could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => { active = false; };
  }, [selectedDate]);

  function changeDate(date) {
    setSelectedDate(date);
    setBookingError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBookingError("");
    if (!service || !selectedDate || !selectedTime) {
      setBookingError("Choose a service, date, and available time before continuing.");
      return;
    }
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    if (turnstileSiteKey && !turnstileToken) {
      setBookingError("Complete the security check before confirming your consultation.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createBooking({
        ...customer,
        service,
        date: selectedDate,
        time: selectedTime,
        timezone: "Asia/Kolkata",
        ...(turnstileSiteKey ? { turnstileToken } : {}),
      });
      setConfirmedBooking(result.booking);
    } catch (error) {
      setBookingError(
        error.code === 409
          ? "That time was just booked. Please choose another available time."
          : error.message || "We could not confirm your booking. Please try again.",
      );
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      if (error.code === 409) {
        setSelectedTime("");
        try {
          const latestSlots = await getAvailableSlots(selectedDate);
          setSlots(latestSlots.slots);
        } catch (refreshError) {
          setAvailabilityError(refreshError.message || "Availability could not be refreshed.");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmedBooking) {
    return (
      <>
        <Header />
        <ConfirmationScreen
          booking={confirmedBooking}
          onStartOver={() => {
            setConfirmedBooking(null);
            setService("");
            setSelectedDate("");
            setSelectedTime("");
            setCustomer(EMPTY_CUSTOMER);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> FREE INTRODUCTORY CONSULTATION</p>
            <h1>Good things start<br />with a conversation<span>.</span></h1>
            <p className="hero-description">
              Book a free 30-minute introductory consultation. Tell us what you’re building,
              and we’ll discuss the right next step for your business.
            </p>
            <div className="hero-meta">
              <span><i aria-hidden="true">◷</i> 30 minutes</span>
              <span><i aria-hidden="true">⌖</i> India Standard Time</span>
              <span><i aria-hidden="true">↗</i> Next 30 days</span>
            </div>
          </div>
          <div className="hero-note">
            <span className="note-rule" />
            <p>Clear thinking.<br />A useful conversation.<br />A better next step.</p>
            <span className="note-signature">— BUILT BY AMOS</span>
          </div>
        </section>

        <div className="booking-shell">
          {missingConfig.length > 0 && (
            <div className="configuration-notice" role="status">
              Booking services are not configured yet. Complete the Appwrite settings in <code>.env.local</code> to enable live availability.
            </div>
          )}
          <ServiceSelector value={service} onChange={(value) => { setService(value); setBookingError(""); }} />

          <BookingCalendar
            selectedDate={selectedDate}
            onSelect={changeDate}
            minDate={today}
            maxDate={maxDate}
          >
            {selectedDate && (
              <TimeSlotPicker
                slots={slots}
                selectedSlot={selectedTime}
                onSelect={(time) => { setSelectedTime(time); setBookingError(""); }}
                loading={loadingSlots}
                error={availabilityError}
              />
            )}
          </BookingCalendar>

          <div className="details-layout">
            <CustomerForm
              values={customer}
              onChange={setCustomer}
              onSubmit={handleSubmit}
              submitting={submitting}
              error={bookingError}
            />
            <BookingSummary service={service} date={selectedDate} time={selectedTime} />
          </div>
          {turnstileSiteKey ? (
            <TurnstileWidget
              key={turnstileResetKey}
              siteKey={turnstileSiteKey}
              onToken={setTurnstileToken}
            />
          ) : null}
        </div>
      </main>
      <footer className="site-footer">
        <span>BUILT BY AMOS</span>
        <span>Thoughtful digital, built with purpose.</span>
      </footer>
    </>
  );
}
