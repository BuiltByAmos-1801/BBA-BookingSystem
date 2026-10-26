export default function Header() {
  const websiteUrl = import.meta.env.VITE_AGENCY_WEBSITE_URL;
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER?.replace(/\D/g, "");

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Built By Amos booking home">
        <span className="brand-name">BUILT BY AMOS</span>
        <span className="brand-tagline">DESIGN · DEVELOP · GROW</span>
      </a>
      <nav className="header-links" aria-label="Main navigation">
        {websiteUrl && (
          <a href={websiteUrl} target="_blank" rel="noreferrer">
            Agency website
          </a>
        )}
        {whatsappNumber && (
          <a
            className="contact-link"
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp <span aria-hidden="true">↗</span>
          </a>
        )}
      </nav>
    </header>
  );
}
