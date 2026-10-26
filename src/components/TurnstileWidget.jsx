import { useEffect, useRef, useState } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function TurnstileWidget({ siteKey, onToken }) {
  const containerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let widgetId;
    let mounted = true;

    function renderWidget() {
      if (!mounted || !containerRef.current || !window.turnstile) return;
      try {
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            setError("The security check could not be completed. Reload the page and try again.");
          },
        });
      } catch {
        setError("The security check could not be loaded. Reload the page and try again.");
      }
    }

    let script = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", renderWidget);
    const handleScriptError = () => setError("The security check could not be loaded. Reload the page and try again.");
    script.addEventListener("error", handleScriptError);
    if (window.turnstile) renderWidget();

    return () => {
      mounted = false;
      script.removeEventListener("load", renderWidget);
      script.removeEventListener("error", handleScriptError);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, siteKey]);

  return (
    <div className="turnstile-wrap">
      <div ref={containerRef} />
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
