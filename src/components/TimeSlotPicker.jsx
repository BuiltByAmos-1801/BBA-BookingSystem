export default function TimeSlotPicker({
  slots,
  selectedSlot,
  onSelect,
  loading,
  error,
}) {
  if (loading) {
    return <p className="slot-message" role="status">Checking live availability…</p>;
  }
  if (error) {
    return <p className="inline-error" role="alert">{error}</p>;
  }
  if (!slots.length) {
    return <p className="slot-message">No times are available for this date. Try another day.</p>;
  }

  return (
    <div className="time-slots" role="group" aria-label="Available consultation times">
      {slots.map((slot) => (
        <button
          className={`time-slot${selectedSlot === slot.time ? " is-selected" : ""}`}
          type="button"
          key={slot.time}
          aria-pressed={selectedSlot === slot.time}
          onClick={() => onSelect(slot.time)}
        >
          {slot.time}
        </button>
      ))}
    </div>
  );
}
