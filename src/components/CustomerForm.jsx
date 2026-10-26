export default function CustomerForm({ values, onChange, onSubmit, submitting, error }) {
  function update(event) {
    onChange({ ...values, [event.target.name]: event.target.value });
  }

  return (
    <form className="customer-form" onSubmit={onSubmit} noValidate>
      <h2 className="section-label">03 / A little about you</h2>
      <div className="form-grid">
        <label className="form-field">
          <span>Full name <b aria-hidden="true">*</b></span>
          <input
            name="customerName"
            value={values.customerName}
            onChange={update}
            autoComplete="name"
            minLength={2}
            maxLength={120}
            required
            placeholder="Your name"
          />
        </label>
        <label className="form-field">
          <span>Email address <b aria-hidden="true">*</b></span>
          <input
            name="customerEmail"
            type="email"
            value={values.customerEmail}
            onChange={update}
            autoComplete="email"
            maxLength={254}
            required
            placeholder="you@company.com"
          />
        </label>
        <label className="form-field">
          <span>Phone / WhatsApp <small>Optional</small></span>
          <input
            name="customerPhone"
            type="tel"
            value={values.customerPhone}
            onChange={update}
            autoComplete="tel"
            pattern="[0-9+().\-\s]{7,32}"
            maxLength={32}
            placeholder="+91 00000 00000"
          />
        </label>
        <label className="form-field">
          <span>Business or brand <small>Optional</small></span>
          <input
            name="businessName"
            value={values.businessName}
            onChange={update}
            autoComplete="organization"
            maxLength={120}
            placeholder="Your business name"
          />
        </label>
        <label className="form-field form-field-wide">
          <span>What are you working on? <small>Optional</small></span>
          <textarea
            name="projectBrief"
            value={values.projectBrief}
            onChange={update}
            rows="3"
            maxLength={2000}
            placeholder="A few details will help us make the most of our conversation."
          />
          <span className="character-count">{values.projectBrief.length}/2000</span>
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button submit-button" type="submit" disabled={submitting}>
        {submitting ? "Confirming your time…" : "Confirm consultation"}
        {!submitting && <span aria-hidden="true">↗</span>}
      </button>
      <p className="privacy-note">
        Your details are only used to prepare for this consultation. No email confirmation is sent yet.
      </p>
    </form>
  );
}
