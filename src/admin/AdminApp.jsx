import { useEffect, useMemo, useState } from "react";
import { SERVICES } from "../services/bookingService.js";
import { account, missingAdminConfig, requestAdminAction } from "../lib/appwrite.js";
import "./admin.css";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function localToday(timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatBookingTime(value, timezone) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone || "Asia/Kolkata",
  }).format(new Date(value));
}

function humanize(value) {
  return String(value || "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AppLink({ href, children }) {
  return <a className="admin-link" href={href}>{children}</a>;
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      await account.createEmailPasswordSession({ email: email.trim(), password });
      await requestAdminAction({ action: "dashboard" });
      window.location.assign("/admin");
    } catch (caught) {
      if (caught.code === 403 || caught.code === 503) {
        try {
          await account.deleteSession({ sessionId: "current" });
        } catch {
          setMessage(`${caught.message} The session could not be cleared; use Sign out before another attempt.`);
          setBusy(false);
          return;
        }
      }
      setMessage(caught.message || "Sign-in failed. Check your account and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <p className="admin-eyebrow">BUILT BY AMOS · PRIVATE</p>
        <h1 id="admin-login-title">Admin sign in</h1>
        <p className="admin-muted">Use an Appwrite account that has been explicitly authorized to manage bookings.</p>
        {missingAdminConfig.length > 0 && (
          <div className="admin-alert" role="alert">
            Admin Function is not configured. Set <code>VITE_APPWRITE_ADMIN_FUNCTION_ID</code> after it has been created.
          </div>
        )}
        {message && <div className="admin-alert" role="alert">{message}</div>}
        <form className="admin-form" onSubmit={submit}>
          <label>
            Email address
            <input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="admin-button admin-button-primary" type="submit" disabled={busy || missingAdminConfig.length > 0}>
            {busy ? "Verifying access…" : "Sign in securely"}
          </button>
        </form>
        <AppLink href="/">← Return to booking page</AppLink>
      </section>
    </main>
  );
}

function StatCard({ label, value, note }) {
  return (
    <article className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function BookingCard({ booking, timezone, onAction, busy }) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [reason, setReason] = useState("");
  const service = SERVICES.find((item) => item.id === booking.service)?.title || humanize(booking.service);

  useEffect(() => {
    if (!showReschedule || !newDate) {
      setSlots([]);
      setNewTime("");
      return undefined;
    }
    let active = true;
    setSlotsLoading(true);
    setSlotError("");
    requestAdminAction({ action: "available-slots", date: newDate, bookingId: booking.$id })
      .then((result) => {
        if (active) setSlots(result.slots);
      })
      .catch((caught) => {
        if (active) {
          setSlots([]);
          setSlotError(caught.message || "Availability could not be checked.");
        }
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => { active = false; };
  }, [showReschedule, newDate, booking.$id]);

  return (
    <article className="admin-booking-card">
      <div className="admin-booking-heading">
        <div>
          <p className="admin-eyebrow">{booking.reference}</p>
          <h3>{booking.customerName}</h3>
          <p className="admin-muted">{formatBookingTime(booking.startsAt, timezone)} · {service}</p>
        </div>
        <span className={`admin-status status-${booking.status}`}>{humanize(booking.status)}</span>
      </div>
      <dl className="admin-booking-details">
        <div><dt>Email</dt><dd><a href={`mailto:${booking.customerEmail}`}>{booking.customerEmail}</a></dd></div>
        <div><dt>Phone</dt><dd>{booking.customerPhone ? <a href={`tel:${booking.customerPhone}`}>{booking.customerPhone}</a> : "Not provided"}</dd></div>
        <div><dt>Business</dt><dd>{booking.businessName || "Not provided"}</dd></div>
        <div><dt>Reference</dt><dd>{booking.reference}</dd></div>
        {booking.projectBrief && <div className="admin-brief"><dt>Project brief</dt><dd>{booking.projectBrief}</dd></div>}
      </dl>
      {booking.status === "cancelled" && booking.cancellationReason && (
        <p className="admin-cancellation-note"><strong>Cancellation reason:</strong> {booking.cancellationReason}</p>
      )}
      {booking.status === "pending" && (
        <div className="admin-card-actions">
          <button className="admin-button admin-button-primary" disabled={busy} onClick={() => onAction("booking-status", { bookingId: booking.$id, status: "confirmed" })}>Confirm request</button>
          <button className="admin-button admin-button-danger" disabled={busy} onClick={() => {
            const cancellationReason = window.prompt("Enter a reason for cancelling this request:");
            if (cancellationReason !== null && window.confirm("Decline and cancel this booking request?")) {
              onAction("booking-status", { bookingId: booking.$id, status: "cancelled", reason: cancellationReason });
            }
          }}>Decline</button>
        </div>
      )}
      {booking.status === "confirmed" && (
        <div className="admin-card-actions">
          <button className="admin-button" disabled={busy} onClick={() => setShowReschedule((value) => !value)}>
            {showReschedule ? "Close reschedule" : "Reschedule"}
          </button>
          <button className="admin-button admin-button-danger" disabled={busy} onClick={() => {
            const cancellationReason = window.prompt("Enter a reason for cancelling this booking:");
            if (cancellationReason !== null && window.confirm("Cancel this booking? The selected slot will be released.")) {
              onAction("booking-status", { bookingId: booking.$id, status: "cancelled", reason: cancellationReason });
            }
          }}>Cancel booking</button>
          {Date.parse(booking.endsAt) <= Date.now() && (
            <button className="admin-button" disabled={busy} onClick={() => {
              if (window.confirm("Mark this consultation as completed?")) onAction("booking-status", { bookingId: booking.$id, status: "completed" });
            }}>Mark completed</button>
          )}
        </div>
      )}
      {showReschedule && (
        <form className="admin-reschedule" onSubmit={(event) => {
          event.preventDefault();
          if (newTime && window.confirm(`Reschedule this booking to ${newDate} at ${newTime}?`)) {
            onAction("reschedule", { bookingId: booking.$id, date: newDate, time: newTime, reason })
              .then((saved) => {
                if (saved) setShowReschedule(false);
              });
          }
        }}>
          <label>New date<input required type="date" min={localToday(timezone)} value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label>
          <label>Available time
            <select required disabled={!newDate || slotsLoading || !slots.length} value={newTime} onChange={(event) => setNewTime(event.target.value)}>
              <option value="">{slotsLoading ? "Checking availability…" : "Choose a time"}</option>
              {slots.map((slot) => <option key={slot.time} value={slot.time}>{slot.time}</option>)}
            </select>
          </label>
          <label className="admin-reschedule-reason">Reason (optional)<input maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          {slotError && <p className="admin-alert" role="alert">{slotError}</p>}
          {!slotsLoading && newDate && slots.length === 0 && !slotError && <p className="admin-muted">No available times for this date.</p>}
          <button className="admin-button admin-button-primary" disabled={busy || !newTime}>Save reschedule</button>
        </form>
      )}
    </article>
  );
}

function ScheduleEditor({ value, onSave, busy }) {
  const [schedule, setSchedule] = useState(value);
  useEffect(() => setSchedule(value), [value]);
  function updateField(key, nextValue) {
    setSchedule((current) => ({ ...current, [key]: nextValue }));
  }
  function updateDay(day, key, nextValue) {
    setSchedule((current) => ({
      ...current,
      weeklyHours: current.weeklyHours.map((hours) => hours.day === day ? { ...hours, [key]: nextValue } : hours),
    }));
  }
  if (!schedule) return <p className="admin-muted">Schedule settings are loading.</p>;
  return (
    <form className="admin-schedule-form" onSubmit={(event) => { event.preventDefault(); onSave(schedule); }}>
      <div className="admin-settings-grid">
        <label>Consultation timezone
          <input required maxLength="64" value={schedule.timezone} onChange={(event) => updateField("timezone", event.target.value)} />
          <small>Use an IANA timezone, e.g. Asia/Kolkata.</small>
        </label>
        <label>Slot duration
          <select value={schedule.slotDuration} onChange={(event) => updateField("slotDuration", Number(event.target.value))}>
            {[15, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
          </select>
        </label>
        <label>Buffer between appointments
          <select value={schedule.bufferMinutes} onChange={(event) => updateField("bufferMinutes", Number(event.target.value))}>
            {[0, 15, 30, 45, 60, 75, 90, 105, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
          </select>
        </label>
        <label>Minimum notice
          <input type="number" min="0" max="10080" value={schedule.minimumNoticeMinutes} onChange={(event) => updateField("minimumNoticeMinutes", Number(event.target.value))} />
          <small>Minutes (up to 7 days).</small>
        </label>
        <label>Maximum advance booking
          <input type="number" min="1" max="365" value={schedule.maximumAdvanceDays} onChange={(event) => updateField("maximumAdvanceDays", Number(event.target.value))} />
          <small>Days, up to 365.</small>
        </label>
      </div>
      <div className="admin-table-scroll">
        <table className="admin-hours-table">
          <thead><tr><th>Weekday</th><th>Enabled</th><th>Start</th><th>End</th><th>Break start</th><th>Break end</th></tr></thead>
          <tbody>{schedule.weeklyHours.map((hours) => (
            <tr key={hours.day}>
              <th scope="row">{DAY_NAMES[hours.day]}</th>
              <td><input aria-label={`${DAY_NAMES[hours.day]} enabled`} type="checkbox" checked={hours.enabled} onChange={(event) => updateDay(hours.day, "enabled", event.target.checked)} /></td>
              {["start", "end", "breakStart", "breakEnd"].map((key) => (
                <td key={key}><input aria-label={`${DAY_NAMES[hours.day]} ${key}`} type="time" step="900" disabled={!hours.enabled} value={hours[key]} onChange={(event) => updateDay(hours.day, key, event.target.value)} /></td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="admin-muted">Existing bookings are retained if you change these hours. The server validates every saved schedule.</p>
      <button className="admin-button admin-button-primary" disabled={busy}>Save weekly hours</button>
    </form>
  );
}

function ExceptionManager({ exceptions, timezone, onAdd, onRemove, busy }) {
  const [date, setDate] = useState("");
  const [type, setType] = useState("full-day");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const includeTimes = type !== "full-day";
  return (
    <section className="admin-panel">
      <h2>Date exceptions</h2>
      <p className="admin-muted">Reasons are visible only in this authorized admin panel. Existing bookings are never removed by an exception.</p>
      <form className="admin-exception-form" onSubmit={async (event) => {
        event.preventDefault();
        const saved = await onAdd({ date, type, startTime: includeTimes ? startTime : "", endTime: includeTimes ? endTime : "", reason });
        if (saved) {
          setDate("");
          setReason("");
        }
      }}>
        <label>Date<input required type="date" min={localToday(timezone)} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Exception
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="full-day">Block full date</option>
            <option value="blocked-range">Block time range</option>
            <option value="special-hours">Special hours</option>
          </select>
        </label>
        {includeTimes && <>
          <label>{type === "special-hours" ? "Open time" : "From"}<input required type="time" step="900" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
          <label>{type === "special-hours" ? "Close time" : "To"}<input required type="time" step="900" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        </>}
        <label className="admin-reason-field">Admin-only reason<input maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Public holiday" /></label>
        <button className="admin-button admin-button-primary" disabled={busy}>Add exception</button>
      </form>
      {exceptions.length === 0 ? <p className="admin-empty">No date exceptions configured.</p> : (
        <div className="admin-exception-list">{exceptions.map((exception) => (
          <article className="admin-exception" key={exception.$id}>
            <div>
              <strong>{exception.date} · {humanize(exception.type)}</strong>
              {exception.type !== "full-day" && <span>{exception.startTime}–{exception.endTime}</span>}
              <small>{exception.reason || "No reason recorded"}</small>
            </div>
            <button className="admin-button admin-button-danger" disabled={busy} onClick={() => {
              if (window.confirm(`Remove the ${exception.date} exception?`)) onRemove(exception.$id);
            }}>Remove</button>
          </article>
        ))}</div>
      )}
    </section>
  );
}

function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "all", service: "all", dateFrom: "", dateTo: "" });
  const today = useMemo(() => localToday(dashboard?.schedule?.timezone), [dashboard?.schedule?.timezone]);

  async function refresh() {
    const result = await requestAdminAction({ action: "dashboard" });
    setDashboard(result);
    setBookings(result.bookings);
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await account.get();
        const result = await requestAdminAction({ action: "dashboard" });
        if (active) {
          setDashboard(result);
          setBookings(result.bookings);
        }
      } catch (caught) {
        if (active) {
          if (caught.code === 401) window.location.replace("/admin/login");
          else {
            setDenied(caught.code === 403);
            setError(caught.message || "Admin dashboard could not be loaded.");
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    initialize();
    return () => { active = false; };
  }, []);

  async function perform(action, payload, success) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestAdminAction({ action, ...payload });
      setNotice(success);
      try {
        await refresh();
      } catch (caught) {
        setError(`The change was saved, but the dashboard could not refresh: ${caught.message || "Unknown error."}`);
      }
      return true;
    } catch (caught) {
      setError(caught.message || "The admin action failed.");
      if (caught.code === 401) window.location.replace("/admin/login");
      if (caught.code === 403) setDenied(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function filterBookings(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await requestAdminAction({ action: "list-bookings", ...filters });
      setBookings(result.bookings);
    } catch (caught) {
      setError(caught.message || "Bookings could not be filtered.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await account.deleteSession({ sessionId: "current" });
      window.location.assign("/admin/login");
    } catch (caught) {
      setError(caught.message || "Could not end the Appwrite session.");
      setBusy(false);
    }
  }

  if (loading) return <main className="admin-loading" role="status">Verifying your Appwrite session…</main>;
  if (denied) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <p className="admin-eyebrow">PRIVATE ADMIN</p>
          <h1>Access not authorized</h1>
          <div className="admin-alert" role="alert">{error}</div>
          <button className="admin-button admin-button-primary" disabled={busy} onClick={logout}>Sign out</button>
          <AppLink href="/admin/login">Return to admin sign in</AppLink>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin"><span>BUILT BY AMOS</span><small>BOOKING ADMIN</small></a>
        <nav className="admin-nav" aria-label="Admin navigation">
          {[
            ["overview", "Overview"],
            ["bookings", "Bookings"],
            ["schedule", "Weekly hours"],
            ["exceptions", "Date exceptions"],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <span>{dashboard?.user?.name || dashboard?.user?.email}</span>
          <button className="admin-button" disabled={busy} onClick={logout}>Sign out</button>
          <AppLink href="/">View booking page</AppLink>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div><p className="admin-eyebrow">BOOKING MANAGEMENT</p><h1>{tab === "overview" ? "Dashboard" : tab === "bookings" ? "Bookings" : tab === "schedule" ? "Weekly hours" : "Date exceptions"}</h1></div>
          <button className="admin-button" disabled={busy} onClick={() => refresh().catch((caught) => setError(caught.message))}>Refresh</button>
        </header>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        {notice && <div className="admin-success" role="status">{notice}</div>}
        {tab === "overview" && dashboard && (
          <section className="admin-dashboard-content">
            <div className="admin-stats">
              <StatCard label="Today’s bookings" value={dashboard.stats.today} note={today} />
              <StatCard label="Upcoming bookings" value={dashboard.stats.upcoming} note="Pending or confirmed" />
              <StatCard label="Pending requests" value={dashboard.stats.pending} note="Awaiting your review" />
            </div>
            <div className="admin-panel">
              <div className="admin-panel-heading"><div><h2>Upcoming consultations</h2><p className="admin-muted">Bookings currently stored in Appwrite.</p></div><button className="admin-button" onClick={() => setTab("bookings")}>Manage bookings</button></div>
              <BookingList bookings={dashboard.bookings.filter((booking) => ["confirmed", "pending"].includes(booking.status)).slice(0, 8)} timezone={dashboard.schedule.timezone} onAction={perform} busy={busy} />
            </div>
          </section>
        )}
        {tab === "bookings" && dashboard && (
          <section className="admin-panel">
            <h2>Search and filter bookings</h2>
            <form className="admin-filter-form" onSubmit={filterBookings}>
              <label>Search<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Name, email, phone, reference" /></label>
              <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">All statuses</option>{["pending", "confirmed", "cancelled", "completed"].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label>
              <label>Service<select value={filters.service} onChange={(event) => setFilters({ ...filters, service: event.target.value })}><option value="all">All services</option>{SERVICES.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label>
              <label>From<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
              <label>To<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
              <button className="admin-button admin-button-primary" disabled={busy}>Apply filters</button>
            </form>
            <BookingList bookings={bookings} timezone={dashboard.schedule.timezone} onAction={perform} busy={busy} />
          </section>
        )}
        {tab === "schedule" && dashboard && (
          <section className="admin-panel">
            <h2>Availability rules</h2>
            <p className="admin-muted">These settings are enforced by the same server-side schedule used by public availability and booking requests.</p>
            <ScheduleEditor value={dashboard.schedule} busy={busy} onSave={(schedule) => perform("save-schedule", { schedule }, "Weekly schedule saved.")} />
          </section>
        )}
        {tab === "exceptions" && dashboard && (
          <ExceptionManager
            exceptions={dashboard.exceptions}
            timezone={dashboard.schedule.timezone}
            busy={busy}
            onAdd={(exception) => perform("add-exception", { exception }, "Date exception added.")}
            onRemove={(exceptionId) => perform("remove-exception", { exceptionId }, "Date exception removed.")}
          />
        )}
      </main>
    </div>
  );
}

function BookingList({ bookings, timezone, onAction, busy }) {
  if (!bookings.length) return <p className="admin-empty">No bookings match this view.</p>;
  return (
    <div className="admin-booking-list">
      {bookings.map((booking) => (
        <BookingCard key={booking.$id} booking={booking} timezone={timezone} onAction={onAction} busy={busy} />
      ))}
    </div>
  );
}

export default function AdminApp() {
  return window.location.pathname === "/admin/login"
    ? <AdminLogin />
    : <AdminDashboard />;
}
