import { SERVICES } from "../services/bookingService.js";

export default function ServiceSelector({ value, onChange }) {
  return (
    <fieldset className="service-fieldset">
      <legend className="section-label">01 / What are you looking to build?</legend>
      <div className="service-grid">
        {SERVICES.map((service) => (
          <label
            className={`service-card${value === service.id ? " is-selected" : ""}`}
            key={service.id}
          >
            <input
              type="radio"
              name="service"
              value={service.id}
              checked={value === service.id}
              onChange={() => onChange(service.id)}
            />
            <span className="service-icon" aria-hidden="true">{service.icon}</span>
            <span className="service-copy">
              <span className="service-title">{service.title}</span>
              <span className="service-description">{service.description}</span>
            </span>
            <span className="radio-mark" aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
