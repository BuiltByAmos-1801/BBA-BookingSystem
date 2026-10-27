import { useEffect, useMemo, useState } from "react";
import BookingCalendar from "./components/BookingCalendar.jsx";
import BookingSummary from "./components/BookingSummary.jsx";
import ConfirmationScreen from "./components/ConfirmationScreen.jsx";
import CustomerForm from "./components/CustomerForm.jsx";
import Header from "./components/Header.jsx";
import ServiceSelector from "./components/ServiceSelector.jsx";
import TimeSlotPicker from "./components/TimeSlotPicker.jsx";
import TurnstileWidget from "./components/TurnstileWidget.jsx";
import { createBooking, getAvailableSlots, getBookingConfig } from "./services/bookingService.js";
import { missingConfig } from "./lib/appwrite.js";
import AdminApp from "./admin/AdminApp.jsx";

const EMPTY_CUSTOMER = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  businessName: "",
  projectBrief: "",
};

function localDateString(date, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDate(dateString, days, timezone) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return localDateString(date, timezone);
}

export default function App() {
  if (window.location.pathname.startsWith("/admin")) return <AdminApp />;
  return <BookingApp />;
}

function BookingApp() {
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
  const [bookingConfig, setBookingConfig] = useState(null);
  const [bookingConfigError, setBookingConfigError] = useState("");
  const timezone = bookingConfig?.timezone || "Asia/Kolkata";
  const maximumAdvanceDays = bookingConfig?.maximumAdvanceDays || 30;
  const [today, setToday] = useState(() => localDateString(new Date(), timezone));
  const maxDate = useMemo(
    () => shiftDate(today, maximumAdvanceDays, timezone),
    [today, maximumAdvanceDays, timezone],
  );
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let active = true;
    getBookingConfig()
      .then((config) => {
        if (active) {
          setBookingConfig(config);
          setToday(localDateString(new Date(), config.timezone));
        }
      })
      .catch((error) => {
        if (active) setBookingConfigError(error.message || "Booking schedule settings could not be loaded.");
      });
    const timer = window.setInterval(() => setToday(localDateString(new Date(), timezone)), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [timezone]);

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
        timezone,
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
          duration={bookingConfig?.slotDuration || 30}
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
              Book a free {bookingConfig?.slotDuration || 30}-minute introductory consultation. Tell us what you’re building,
              and we’ll discuss the right next step for your business.
            </p>
            <div className="hero-meta">
              <span><i aria-hidden="true">◷</i> {bookingConfig?.slotDuration || 30} minutes</span>
              <span><i aria-hidden="true">⌖</i> {timezone}</span>
              <span><i aria-hidden="true">↗</i> Up to {maximumAdvanceDays} days ahead</span>
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
          {bookingConfigError && (
            <div className="configuration-notice" role="alert">{bookingConfigError}</div>
          )}
          <ServiceSelector value={service} onChange={(value) => { setService(value); setBookingError(""); }} />

          <BookingCalendar
            selectedDate={selectedDate}
            onSelect={changeDate}
            minDate={today}
            maxDate={maxDate}
            timezone={timezone}
            availableWeekdays={bookingConfig?.availableWeekdays || [1, 2, 3, 4, 5, 6]}
            specialDates={bookingConfig?.specialDates || []}
            blockedDates={bookingConfig?.blockedDates || []}
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
            <BookingSummary
              service={service}
              date={selectedDate}
              time={selectedTime}
              duration={bookingConfig?.slotDuration || 30}
              timezone={timezone}
            />
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
