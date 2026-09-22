import { useEffect, useState } from "react";

const INDIA_EARTH_URL =
  "https://earth.google.com/web/@22.5937,78.9629,0a,22000000d,35y,0h,0t,0r";

export default function Header({ reportCount, onShowGlobe, theme, onToggleTheme }) {
  const isLight = theme === "light";
  // The icon shown/rotated is decoupled from the real theme so the swap can
  // happen at the midpoint of a rotation instead of an instant snap — see
  // the effect below.
  const [displayedIsLight, setDisplayedIsLight] = useState(isLight);
  const [flipCount, setFlipCount] = useState(0);
  // Ambient rain drops behind the header content — generated once per
  // mount rather than every render, same technique as the globe intro's
  // rain but continuous/looping and much fainter.
  const [ambientRainDrops] = useState(() =>
    Array.from({ length: 10 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 2500,
      duration: 1400 + Math.random() * 900,
      height: 30 + Math.random() * 30,
    }))
  );

  useEffect(() => {
    if (isLight === displayedIsLight) return;
    setFlipCount((c) => c + 1);
    // Swap which icon is rendered partway through the 300ms rotation below,
    // so the flip reveals the new icon rather than just spinning the old
    // one and then snapping.
    const t = setTimeout(() => setDisplayedIsLight(isLight), 150);
    return () => clearTimeout(t);
  }, [isLight, displayedIsLight]);
  const iconButtonStyle = {
    background: "var(--card-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    width: 30,
    height: 30,
    padding: 0,
    color: "var(--slate)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    textDecoration: "none",
  };

  return (
    <header
      className="mm-fade-up"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "16px 20px 14px",
        background: "var(--card)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
      }}
    >
      {/* Ambient rain, purely decorative, behind the actual content —
          ties the "monsoon" theme into the main app itself, not just the
          globe intro. Very faint and continuous rather than a one-shot
          burst. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {ambientRainDrops.map((d, i) => (
          <div
            key={i}
            className="mm-rain-drop-ambient"
            style={{
              left: `${d.left}%`,
              height: d.height,
              animationDelay: `${d.delay}ms`,
              animationDuration: `${d.duration}ms`,
            }}
          />
        ))}
      </div>

      {/* Row 1: identity — logo, title, subtitle. Never competes with the
          controls below for horizontal space, so it can't get squeezed. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "linear-gradient(155deg, var(--accent), var(--brand-dark))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 3px 10px rgba(59,130,246,0.4)",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff">
            <path d="M12 2c-.5 0-1 .2-1.3.7C8.6 6 5 11.4 5 15a7 7 0 0014 0c0-3.6-3.6-9-5.7-12.3-.3-.5-.8-.7-1.3-.7z" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Newsreader', serif",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              whiteSpace: "nowrap",
            }}
          >
            MonsoonMap
          </h1>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 13,
              color: "var(--slate)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Live waterlogging &amp; road damage across India
          </p>
        </div>
      </div>

      {/* Row 2: a deliberate toolbar row — view controls on the left, the
          live-count badge on the right. Kept as its own row (rather than
          letting it wrap unpredictably out of row 1) so it always lands in
          the same clean, right-aligned spot regardless of sidebar width. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onShowGlobe && (
            <button
              onClick={onShowGlobe}
              aria-label="Replay the space intro"
              title="Replay the space intro"
              className="mm-interactive"
              style={iconButtonStyle}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.6 3.8 5.8 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.8-3.8-9s1.3-6.4 3.8-9z" />
              </svg>
            </button>
          )}
          <a
            href={INDIA_EARTH_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open India in Google Earth (new tab)"
            title="Open in Google Earth"
            className="mm-interactive"
            style={iconButtonStyle}
          >
            {/* Satellite icon — distinct from the "replay intro" globe so
                the two aren't confused: this one leaves the app. */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="14.5" y="2.5" width="5" height="8" rx="1.2" transform="rotate(45 17 6.5)" />
              <path d="M13 8l-7.5 7.5M9 20l1.5-1.5M4 15l1.5-1.5" strokeLinecap="round" />
              <path d="M15.5 10.5L18 13a2 2 0 01-2.8 2.8L13 13.3" strokeLinecap="round" />
            </svg>
          </a>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
              title={isLight ? "Switch to dark mode" : "Switch to light mode"}
              className="mm-interactive"
              style={iconButtonStyle}
            >
              <span
                style={{
                  display: "flex",
                  transition: "transform 0.3s ease",
                  transform: `rotateY(${flipCount * 180}deg)`,
                }}
              >
                {displayedIsLight ? (
                  // Sun icon: shown while in light mode, click switches to dark
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="4.2" />
                    <path
                      d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  // Moon icon: shown while in dark mode, click switches to light
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.4 14.7A8.9 8.9 0 019.3 3.6a.6.6 0 00-.7-.8A9.9 9.9 0 1021.2 15.4a.6.6 0 00-.8-.7z" />
                  </svg>
                )}
              </span>
            </button>
          )}
        </div>

        {/* Live-count badge — a single compact pill instead of a stacked
            "big number over small label", which looked disconnected once
            it had its own row to sit on. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "var(--card-2)",
            border: "1px solid var(--line)",
            borderRadius: 999,
            padding: "5px 12px",
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            className="mm-live-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 0 3px var(--glow)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{reportCount}</span>
          <span style={{ fontSize: 11.5, color: "var(--slate)", whiteSpace: "nowrap" }}>active reports</span>
        </div>
      </div>

      {/* Wave divider instead of a flat border-bottom — reinforces the
          "water" theme throughout the app, not just in the globe intro.
          Drifts slowly and seamlessly (the SVG is 200% width, translated
          by exactly half its own width = one full repetition). */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 6, overflow: "hidden", pointerEvents: "none" }}
      >
        <svg
          className="mm-wave-drift"
          viewBox="0 0 1200 20"
          preserveAspectRatio="none"
          style={{ width: "200%", height: "100%", display: "block" }}
        >
          <path
            d="M0,8 C50,0 150,16 200,8 C250,0 350,16 400,8 C450,0 550,16 600,8 C650,0 750,16 800,8 C850,0 950,16 1000,8 C1050,0 1150,16 1200,8"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="1.5"
            opacity="0.5"
          />
        </svg>
      </div>
    </header>
  );
}