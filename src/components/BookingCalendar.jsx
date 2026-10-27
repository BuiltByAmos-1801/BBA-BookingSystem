import { useEffect, useMemo, useState } from "react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export default function BookingCalendar({
  selectedDate,
  onSelect,
  minDate,
  maxDate,
  timezone = "Asia/Kolkata",
  availableWeekdays = [1, 2, 3, 4, 5, 6],
  specialDates = [],
  blockedDates = [],
  children,
}) {
  const [displayMonth, setDisplayMonth] = useState(() => {
    const anchor = parseDateKey(selectedDate || minDate);
    return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  });
  const anchorDate = parseDateKey(selectedDate || minDate);
  const targetMonth = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1));

  useEffect(() => {
    setDisplayMonth(targetMonth);
  }, [selectedDate, minDate]);

  const year = displayMonth.getUTCFullYear();
  const month = displayMonth.getUTCMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(Date.UTC(year, month, 1));
    const offset = (firstDay.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [month, year]);

  const earliest = parseDateKey(minDate);
  const latest = parseDateKey(maxDate);
  const firstVisibleMonth = new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1));
  const lastVisibleMonth = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), 1));
  const canGoPrevious = displayMonth > firstVisibleMonth;
  const canGoNext = displayMonth < lastVisibleMonth;

  return (
    <section className="booking-section" aria-labelledby="calendar-heading">
      <h2 id="calendar-heading" className="section-label">02 / Choose a date & time</h2>
      <div className="calendar-layout">
        <div className="calendar-panel">
          <div className="calendar-heading">
            <div>
              <p className="eyebrow">YOUR CONSULTATION</p>
              <h3>
                {displayMonth.toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </h3>
            </div>
            <div className="month-controls">
              <button
                type="button"
                aria-label="Previous month"
                disabled={!canGoPrevious}
                onClick={() => setDisplayMonth(new Date(Date.UTC(year, month - 1, 1)))}
              >←</button>
              <button
                type="button"
                aria-label="Next month"
                disabled={!canGoNext}
                onClick={() => setDisplayMonth(new Date(Date.UTC(year, month + 1, 1)))}
              >→</button>
            </div>
            <span className="timezone-pill">{timezone}</span>
          </div>
          <div className="calendar-grid" role="group" aria-label="Select a booking date">
            {DAY_LABELS.map((day) => (
              <span className="calendar-day-label" key={day}>{day}</span>
            ))}
            {calendarDays.map((day, index) => {
              if (!day) return <span className="calendar-empty" key={`empty-${index}`} />;
              const date = new Date(Date.UTC(year, month, day));
              const key = dateKey(date);
              const weekday = date.getUTCDay();
              const disabled =
                date < earliest ||
                date > latest ||
                blockedDates.includes(key) ||
                (!availableWeekdays.includes(weekday) && !specialDates.includes(key));
              return (
                <button
                  className={`calendar-date${selectedDate === key ? " is-selected" : ""}`}
                  type="button"
                  key={key}
                  disabled={disabled}
                  aria-pressed={selectedDate === key}
                  aria-label={`${date.toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  })}${disabled ? ", unavailable" : ""}`}
                  onClick={() => onSelect(key)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span><i className="legend-dot" /> Available weekdays</span>
            <span>{availableWeekdays.length} working days / week</span>
          </div>
        </div>
        <div className="slots-panel" aria-live="polite">
          {selectedDate ? (
            <div className="slot-panel-heading">
              <p className="eyebrow">AVAILABLE TIMES</p>
              <h3>
                {new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: timezone,
                })}
              </h3>
            </div>
          ) : (
            <div className="slot-empty-prompt">
              <span className="prompt-icon" aria-hidden="true">↙</span>
              <p>Select a date to see genuinely available times.</p>
            </div>
          )}
          {selectedDate && <div className="slot-content">{children}</div>}
        </div>
      </div>
    </section>
  );
}
